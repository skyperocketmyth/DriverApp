// =============================================================================
// DateTimePicker — 24-hour date & time picker
// Uses native Android date/time pickers via @react-native-community/datetimepicker
// but since we're Expo managed, we use a simple inline selector approach
// that matches the original app's separate date, hour, minute selects.
// Returns value as 'YYYY-MM-DDTHH:MM' string (same format as original app).
// =============================================================================
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, ScrollView,
  StyleSheet, Platform,
} from 'react-native';
import { COLORS } from '../config';

function pad(n) { return String(n).padStart(2, '0'); }

function getDubaiNow() {
  // Dubai is UTC+4
  const now     = new Date();
  const dubaiMs = now.getTime() + (4 * 60 * 60 * 1000);
  return new Date(dubaiMs);
}

function toDatetimeLocal(date) {
  const y  = date.getUTCFullYear();
  const mo = date.getUTCMonth() + 1;
  const d  = date.getUTCDate();
  const h  = date.getUTCHours();
  const mi = date.getUTCMinutes();
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}`;
}

function fromDatetimeLocal(str) {
  if (!str) return null;
  const [datePart, timePart] = str.split('T');
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi]    = (timePart || '00:00').split(':').map(Number);
  // Treat as Dubai local (UTC+4) → store as UTC
  return { y, mo, d, h, mi };
}

export default function DateTimePicker({ label, value, onChange, required, rtl }) {
  const [visible, setVisible] = useState(false);

  // Parse current value
  const parsed = value ? fromDatetimeLocal(value) : (() => {
    const n = getDubaiNow();
    return { y: n.getUTCFullYear(), mo: n.getUTCMonth() + 1, d: n.getUTCDate(), h: n.getUTCHours(), mi: n.getUTCMinutes() };
  })();

  const [selYear,  setSelYear]  = useState(parsed.y);
  const [selMonth, setSelMonth] = useState(parsed.mo);
  const [selDay,   setSelDay]   = useState(parsed.d);
  const [selHour,  setSelHour]  = useState(parsed.h);
  const [selMin,   setSelMin]   = useState(parsed.mi);

  function openPicker() {
    const p = value ? fromDatetimeLocal(value) : (() => {
      const n = getDubaiNow();
      return { y: n.getUTCFullYear(), mo: n.getUTCMonth() + 1, d: n.getUTCDate(), h: n.getUTCHours(), mi: n.getUTCMinutes() };
    })();
    setSelYear(p.y); setSelMonth(p.mo); setSelDay(p.d);
    setSelHour(p.h); setSelMin(p.mi);
    setVisible(true);
  }

  function confirm() {
    const str = `${selYear}-${pad(selMonth)}-${pad(selDay)}T${pad(selHour)}:${pad(selMin)}`;
    onChange(str);
    setVisible(false);
  }

  function daysInMonth(y, m) {
    return new Date(y, m, 0).getDate();
  }

  const displayValue = value
    ? `${pad(fromDatetimeLocal(value).d)}/${pad(fromDatetimeLocal(value).mo)}/${fromDatetimeLocal(value).y}  ${pad(fromDatetimeLocal(value).h)}:${pad(fromDatetimeLocal(value).mi)}`
    : '';

  return (
    <View style={styles.container}>
      {label ? (
        <Text style={[styles.label, rtl && styles.rtlText]}>
          {label}{required ? <Text style={styles.asterisk}> *</Text> : null}
        </Text>
      ) : null}

      <TouchableOpacity style={styles.input} onPress={openPicker}>
        <Text style={[styles.inputText, !value && styles.placeholder, rtl && styles.rtlText]}>
          {displayValue || 'Tap to set date & time'}
        </Text>
        <Text style={styles.clockIcon}>🕐</Text>
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{label || 'Date & Time'}</Text>

            <View style={styles.rowSelectors}>
              <ScrollPicker label="Day"   values={range(1, daysInMonth(selYear, selMonth))} selected={selDay}   onSelect={setSelDay} />
              <ScrollPicker label="Month" values={range(1, 12)}                             selected={selMonth} onSelect={setSelMonth} />
              <ScrollPicker label="Year"  values={range(2024, 2030)}                        selected={selYear}  onSelect={setSelYear} />
              <ScrollPicker label="Hour"  values={range(0, 23)}                             selected={selHour}  onSelect={setSelHour} padded />
              <ScrollPicker label="Min"   values={range(0, 59)}                             selected={selMin}   onSelect={setSelMin}  padded />
            </View>

            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={confirm}>
                <Text style={styles.confirmBtnText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function range(from, to) {
  const arr = [];
  for (let i = from; i <= to; i++) arr.push(i);
  return arr;
}

function ScrollPicker({ label, values, selected, onSelect, padded }) {
  return (
    <View style={sp.container}>
      <Text style={sp.label}>{label}</Text>
      <ScrollView style={sp.scroll} showsVerticalScrollIndicator={false}>
        {values.map(v => (
          <TouchableOpacity
            key={v}
            style={[sp.item, v === selected && sp.selectedItem]}
            onPress={() => onSelect(v)}
          >
            <Text style={[sp.itemText, v === selected && sp.selectedItemText]}>
              {padded ? pad(v) : v}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const sp = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  label:     { fontSize: 11, color: COLORS.textLight, marginBottom: 4, fontWeight: '600' },
  scroll:    { maxHeight: 180, width: '100%' },
  item:      { paddingVertical: 9, alignItems: 'center', borderRadius: 6 },
  selectedItem: { backgroundColor: COLORS.primary },
  itemText:  { fontSize: 16, color: COLORS.textDark },
  selectedItemText: { color: COLORS.white, fontWeight: '700' },
});

const styles = StyleSheet.create({
  container: { marginBottom: 14 },
  label:     { fontSize: 13, fontWeight: '600', color: COLORS.textDark, marginBottom: 6 },
  asterisk:  { color: COLORS.error },
  rtlText:   { textAlign: 'right' },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.borderGray,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
  },
  inputText:   { fontSize: 15, color: COLORS.textDark, flex: 1 },
  placeholder: { color: COLORS.textLight },
  clockIcon:   { fontSize: 18 },

  // Modal
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textDark,
    textAlign: 'center',
    marginBottom: 16,
  },
  rowSelectors: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 20,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: COLORS.borderGray,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 15, color: COLORS.textMid, fontWeight: '600' },
  confirmBtn: {
    flex: 2,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmBtnText: { fontSize: 15, color: COLORS.white, fontWeight: '700' },
});

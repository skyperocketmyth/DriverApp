// =============================================================================
// Stage3Screen — Last Drop Done
// Driver taps "Last Drop Done" button → auto-captures timestamp.
// Then enters odometer reading, takes photo, enters failed drops count.
// =============================================================================
import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useAppContext } from '../store/AppContext';
import CameraCapture from '../components/CameraCapture';
import GpsBanner from './GpsBanner';
import { saveLastDrop } from '../services/api';
import { COLORS } from '../config';
import { t, isRTL } from '../i18n/translations';

function toDatetimeLocal(date) {
  // Convert Date to datetime-local format in Dubai time for GAS
  const dubaiMs = date.getTime() + (4 * 60 * 60 * 1000);
  const d = new Date(dubaiMs);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function formatDisplayTime(isoLocal) {
  if (!isoLocal) return '';
  const [date, time] = isoLocal.split('T');
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y} ${time}`;
}

export default function Stage3Screen({ navigation }) {
  const { language, currentUser, shiftProgress, setShiftProgress } = useAppContext();
  const rtl = isRTL(language);

  const [lastDropTime, setLastDropTime] = useState(null); // set on button tap
  const [photo,        setPhoto]        = useState(null);
  const [failedDrops,  setFailedDrops]  = useState('0');
  const [saving,       setSaving]       = useState(false);
  const [errors,       setErrors]       = useState({});

  function handleMarkLastDrop() {
    const now = toDatetimeLocal(new Date());
    setLastDropTime(now);
  }

  function validate() {
    const e = {};
    if (!lastDropTime) e.dropTime  = true;
    if (!photo)        e.photo     = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) {
      Alert.alert(t('error', language), 'Please tap "Last Drop Done" and take the odometer photo.');
      return;
    }
    if (!shiftProgress?.rowId) {
      Alert.alert(t('error', language), 'No active shift found. Please start from Stage 1.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        rowId:               shiftProgress.rowId,
        lastDropTime:        lastDropTime,
        lastDropPhotoBase64: photo,
        failedDrops:         failedDrops || '0',
      };

      const result = await saveLastDrop(payload);

      if (!result.success) {
        Alert.alert(t('error', language), result.error || t('errServer', language));
        return;
      }

      // Update shift progress
      const progress = { ...shiftProgress, stage3Done: true };
      await setShiftProgress(progress);

      navigation.navigate('Success', {
        stage:      3,
        message:    'Last drop recorded! Please proceed to Stage 4 to complete your shift.',
        driverName: currentUser?.userName,
        submitTime: result.submitTime,
      });
    } catch (err) {
      Alert.alert(t('error', language), err.message || t('errServer', language));
    } finally {
      setSaving(false);
    }
  }

  if (!shiftProgress?.stage2Done) {
    return (
      <View style={styles.centred}>
        <Text style={styles.errorText}>⚠ Complete Stage 2 (Departure) first.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="always">

      <View style={styles.headerCard}>
        <Text style={styles.stageTag}>STAGE 3</Text>
        <Text style={styles.headerTitle}>Last Drop Done</Text>
        <Text style={styles.headerSub}>{currentUser?.userName}</Text>
      </View>

      <GpsBanner language={language} />

      <View style={styles.card}>

        {/* ── Big "Last Drop Done" button ── */}
        {!lastDropTime ? (
          <>
            <Text style={styles.instructionText}>
              Tap the button below when you have completed your last drop. The time will be automatically recorded.
            </Text>
            <TouchableOpacity style={styles.lastDropBtn} onPress={handleMarkLastDrop}>
              <Text style={styles.lastDropBtnIcon}>📦</Text>
              <Text style={styles.lastDropBtnText}>Last Drop Done</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.timestampBox}>
            <Text style={styles.timestampLabel}>Last Drop Time (Auto-Captured)</Text>
            <Text style={styles.timestampValue}>🕐 {formatDisplayTime(lastDropTime)}</Text>
            <TouchableOpacity onPress={handleMarkLastDrop} style={styles.retapBtn}>
              <Text style={styles.retapBtnText}>Re-tap to update time</Text>
            </TouchableOpacity>
          </View>
        )}

        {errors.dropTime && (
          <Text style={styles.errText}>Please tap "Last Drop Done" first.</Text>
        )}

        {/* ── Odometer photo ── */}
        <CameraCapture
          label="Odometer Photo *"
          onPhoto={setPhoto}
          required
          rtl={rtl}
        />
        {errors.photo && <Text style={styles.errText}>{t('errRequired', language)}</Text>}

        {/* ── Failed drops ── */}
        <Text style={styles.fieldLabel}>{t('failedDropsLabel', language)}</Text>
        <TextInput
          style={styles.textInput}
          placeholder="0"
          placeholderTextColor={COLORS.textLight}
          value={failedDrops}
          onChangeText={setFailedDrops}
          keyboardType="numeric"
        />

        {/* ── Save button ── */}
        <TouchableOpacity
          style={[styles.saveBtn, (saving || !lastDropTime) && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving || !lastDropTime}
        >
          {saving
            ? <ActivityIndicator color={COLORS.white} />
            : <Text style={styles.saveBtnText}>Save Last Drop Record</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: COLORS.lightGray },
  content: { padding: 16, paddingBottom: 40 },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

  headerCard: {
    backgroundColor: '#E65100',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
  },
  stageTag: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: COLORS.white },
  headerSub:   { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 4 },

  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },

  instructionText: {
    fontSize: 14,
    color: COLORS.textMid,
    lineHeight: 22,
    marginBottom: 16,
    textAlign: 'center',
  },

  lastDropBtn: {
    backgroundColor: '#E65100',
    borderRadius: 14,
    paddingVertical: 22,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#E65100',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  lastDropBtnIcon: { fontSize: 36, marginBottom: 8 },
  lastDropBtnText: { fontSize: 20, fontWeight: '900', color: COLORS.white },

  timestampBox: {
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FF8F00',
  },
  timestampLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textLight, letterSpacing: 0.5, marginBottom: 4 },
  timestampValue: { fontSize: 16, fontWeight: '800', color: '#E65100' },
  retapBtn:       { marginTop: 8 },
  retapBtnText:   { fontSize: 12, color: COLORS.textLight, textDecorationLine: 'underline' },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textDark, marginBottom: 6, marginTop: 4 },
  textInput: {
    borderWidth: 1.5,
    borderColor: COLORS.borderGray,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.textDark,
    marginBottom: 14,
    backgroundColor: COLORS.white,
  },
  errText: { color: COLORS.error, fontSize: 12, marginBottom: 10 },

  saveBtn: {
    backgroundColor: '#E65100',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnDisabled: { backgroundColor: COLORS.textLight },
  saveBtnText: { fontSize: 16, fontWeight: '800', color: COLORS.white },

  errorText: { color: COLORS.error, fontSize: 15, textAlign: 'center', marginBottom: 16 },
  backBtn: { backgroundColor: COLORS.primary, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  backBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
});

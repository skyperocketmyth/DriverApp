// =============================================================================
// Stage4Screen — Shift Complete
// Driver taps "Shift Complete" → auto-captures timestamp.
// Enters end odometer + photo. GPS tracking stops. Total KMs shown.
// =============================================================================
import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useAppContext } from '../store/AppContext';
import CameraCapture from '../components/CameraCapture';
import GpsBanner from './GpsBanner';
import { saveShiftEnd } from '../services/api';
import { stopShiftTracking } from '../services/gps';
import { COLORS } from '../config';
import { t, isRTL } from '../i18n/translations';

function toDatetimeLocal(date) {
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

export default function Stage4Screen({ navigation }) {
  const { language, currentUser, shiftProgress, setShiftProgress, clearShiftProgress } = useAppContext();
  const rtl = isRTL(language);

  const [completeTime, setCompleteTime] = useState(null); // set on button tap
  const [endOdo,       setEndOdo]       = useState('');
  const [endPhoto,     setEndPhoto]     = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [errors,       setErrors]       = useState({});

  function handleMarkComplete() {
    const now = toDatetimeLocal(new Date());
    setCompleteTime(now);
  }

  function validate() {
    const e = {};
    if (!completeTime)    e.completeTime = true;
    if (!endOdo.trim())   e.endOdo       = true;
    if (!endPhoto)        e.endPhoto     = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) {
      Alert.alert(t('error', language), 'Please tap "Shift Complete", enter odometer, and take a photo.');
      return;
    }
    if (!shiftProgress?.rowId) {
      Alert.alert(t('error', language), 'No active shift found. Please start from Stage 1.');
      return;
    }

    setSaving(true);
    try {
      // Stop GPS tracking and get totals BEFORE sending to backend
      const gpsData = await stopShiftTracking();

      const payload = {
        rowId:             shiftProgress.rowId,
        endOdometer:       endOdo.trim(),
        endPhotoBase64:    endPhoto,
        shiftCompleteTime: completeTime,
        gpsKm:             gpsData.totalKm || 0,
      };

      const result = await saveShiftEnd(payload);

      if (!result.success) {
        Alert.alert(t('error', language), result.error || t('errServer', language));
        return;
      }

      // Clear shift progress — shift is fully complete
      await clearShiftProgress();

      navigation.navigate('Success', {
        stage:         4,
        message:       'Shift completed! Well done.',
        driverName:    currentUser?.userName,
        shiftDuration: result.shiftDuration,
        overtime:      result.overtime,
        gpsKm:         gpsData.totalKm,
        facilityLeft:  gpsData.facilityLeftTime,
      });
    } catch (err) {
      Alert.alert(t('error', language), err.message || t('errServer', language));
    } finally {
      setSaving(false);
    }
  }

  if (!shiftProgress?.stage3Done) {
    return (
      <View style={styles.centred}>
        <Text style={styles.errorText}>⚠ Complete Stage 3 (Last Drop) first.</Text>
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
        <Text style={styles.stageTag}>STAGE 4</Text>
        <Text style={styles.headerTitle}>Shift Complete</Text>
        <Text style={styles.headerSub}>{currentUser?.userName}</Text>
      </View>

      <GpsBanner language={language} />

      <View style={styles.card}>

        {/* ── Big "Shift Complete" button ── */}
        {!completeTime ? (
          <>
            <Text style={styles.instructionText}>
              Tap below when you are home and your shift is complete.
              The time will be auto-captured and GPS tracking will stop.
            </Text>
            <TouchableOpacity style={styles.completeBtn} onPress={handleMarkComplete}>
              <Text style={styles.completeBtnIcon}>✅</Text>
              <Text style={styles.completeBtnText}>Shift Complete</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.timestampBox}>
            <Text style={styles.timestampLabel}>Shift Complete Time (Auto-Captured)</Text>
            <Text style={styles.timestampValue}>🕐 {formatDisplayTime(completeTime)}</Text>
            <TouchableOpacity onPress={handleMarkComplete} style={styles.retapBtn}>
              <Text style={styles.retapBtnText}>Re-tap to update time</Text>
            </TouchableOpacity>
          </View>
        )}

        {errors.completeTime && (
          <Text style={styles.errText}>Please tap "Shift Complete" first.</Text>
        )}

        {/* ── End Odometer ── */}
        <Text style={styles.fieldLabel}>{t('endOdoLabel', language)} <Text style={styles.asterisk}>*</Text></Text>
        <TextInput
          style={[styles.textInput, errors.endOdo && styles.inputError]}
          placeholder="e.g. 45680"
          placeholderTextColor={COLORS.textLight}
          value={endOdo}
          onChangeText={setEndOdo}
          keyboardType="numeric"
        />

        {/* ── End Photo ── */}
        <CameraCapture
          label={t('endPhotoLabel', language)}
          onPhoto={setEndPhoto}
          required
          rtl={rtl}
        />
        {errors.endPhoto && <Text style={styles.errText}>{t('errRequired', language)}</Text>}

        {/* GPS note */}
        <View style={styles.gpsNote}>
          <Text style={styles.gpsNoteText}>
            📍 GPS tracking will stop and total km driven will be saved automatically when you submit.
          </Text>
        </View>

        {/* ── Save button ── */}
        <TouchableOpacity
          style={[styles.saveBtn, (saving || !completeTime) && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving || !completeTime}
        >
          {saving
            ? <ActivityIndicator color={COLORS.white} />
            : <Text style={styles.saveBtnText}>Submit & End Shift</Text>}
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
    backgroundColor: '#1B5E20',
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
    marginBottom: 20,
    textAlign: 'center',
  },

  completeBtn: {
    backgroundColor: COLORS.success,
    borderRadius: 14,
    paddingVertical: 24,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: COLORS.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  completeBtnIcon: { fontSize: 36, marginBottom: 8 },
  completeBtnText: { fontSize: 20, fontWeight: '900', color: COLORS.white },

  timestampBox: {
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#66BB6A',
  },
  timestampLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textLight, letterSpacing: 0.5, marginBottom: 4 },
  timestampValue: { fontSize: 16, fontWeight: '800', color: COLORS.success },
  retapBtn:       { marginTop: 8 },
  retapBtnText:   { fontSize: 12, color: COLORS.textLight, textDecorationLine: 'underline' },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textDark, marginBottom: 6, marginTop: 4 },
  asterisk:   { color: COLORS.error },
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
  inputError: { borderColor: COLORS.error },
  errText:    { color: COLORS.error, fontSize: 12, marginBottom: 10 },

  gpsNote: {
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  gpsNoteText: { fontSize: 13, color: COLORS.accent, lineHeight: 20 },

  saveBtn: {
    backgroundColor: COLORS.success,
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

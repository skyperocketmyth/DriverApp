// =============================================================================
// LoginScreen — Stage 1: Mark Arrival at Facility (GPS geofence check)
// The user is already identified via AuthScreen. This screen just:
//   1. Verifies the driver is within 200m of the facility via GPS
//   2. Records the auto-captured arrival timestamp
//   3. Starts background GPS tracking
// =============================================================================
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { useAppContext } from '../store/AppContext';
import { checkFacilityGeofence, requestLocationPermissions, startShiftTracking } from '../services/gps';
import { saveShiftStart, saveGpsPoint } from '../services/api';
import { COLORS } from '../config';
import { t, isRTL } from '../i18n/translations';

function getDubaiNowISO() {
  return new Date().toISOString();
}

function formatDubaiTime(isoStr) {
  if (!isoStr) return '';
  try {
    return new Date(isoStr).toLocaleString('en-GB', {
      timeZone: 'Asia/Dubai',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch (_) {
    return isoStr;
  }
}

export default function Stage1ArrivalScreen({ navigation }) {
  const { currentUser, shiftProgress, setShiftProgress, language } = useAppContext();
  const rtl = isRTL(language);

  const [checking,    setChecking]    = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [gpsStatus,   setGpsStatus]   = useState(null); // null | 'ok' | 'far' | 'error'
  const [distanceM,   setDistanceM]   = useState(null);
  const [arrivalCoords, setArrivalCoords] = useState(null);
  const [arrivalTime,   setArrivalTime]   = useState(null);

  // Guard: if Stage 1 already done but shift not complete, show message
  const alreadyDone = shiftProgress?.stage1Done && !allStagesDone(shiftProgress);

  function allStagesDone(sp) {
    return sp?.stage1Done && sp?.stage2Done && sp?.stage3Done && sp?.stage4Done;
  }

  async function handleArrivedAtFacility() {
    setChecking(true);
    setGpsStatus(null);

    // Request permissions first
    const perm = await requestLocationPermissions();
    if (!perm.granted) {
      setChecking(false);
      Alert.alert(
        'Location Permission Required',
        perm.reason === 'background'
          ? 'Background location is required for shift tracking.\n\nPlease go to:\nSettings → Apps → RSA Driver Pilot → Permissions → Location → "Allow all the time"'
          : 'Location permission is required to verify you are at the facility.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Check geofence
    const result = await checkFacilityGeofence();
    setChecking(false);

    if (result.error) {
      setGpsStatus('error');
      Alert.alert(t('error', language), result.error);
      return;
    }

    setDistanceM(result.distanceMetres);

    if (!result.withinGeofence) {
      setGpsStatus('far');
      return;
    }

    // Within 200m — record arrival
    setGpsStatus('ok');
    const ts = getDubaiNowISO();
    setArrivalTime(ts);
    setArrivalCoords({ lat: result.lat, lng: result.lng });
  }

  async function handleConfirmArrival() {
    if (!arrivalCoords || !arrivalTime) return;

    setSaving(true);
    try {
      // Convert ISO to datetime-local format for GAS parser
      const dubaiOffset = 4 * 60; // +04:00
      const d = new Date(new Date(arrivalTime).getTime() + dubaiOffset * 60000);
      const localStr = d.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm

      const result = await saveShiftStart({
        userId:         currentUser.userId,
        userName:       currentUser.userName,
        shiftStartTime: localStr,
        arrivalLat:     arrivalCoords.lat,
        arrivalLng:     arrivalCoords.lng,
      });

      if (!result.success) {
        Alert.alert(t('error', language), result.error || t('errServer', language));
        return;
      }

      // Update shift progress in context + AsyncStorage
      const progress = {
        ...(shiftProgress || {}),
        stage1Done:  true,
        stage2Done:  false,
        stage3Done:  false,
        stage4Done:  false,
        rowId:       result.rowId,
        arrivalTime: result.arrivalTime,
        startLat:    arrivalCoords.lat,
        startLng:    arrivalCoords.lng,
      };
      await setShiftProgress(progress);

      // Push first GPS point immediately so GPS_Tracking has an entry right away.
      // Background task may take up to 15s to fire its first update; this closes that gap.
      saveGpsPoint(currentUser.userId, currentUser.userName, arrivalCoords.lat, arrivalCoords.lng, 0).catch(() => {});

      // Navigate to Success immediately — data is confirmed saved
      navigation.replace('Success', {
        stage:       1,
        message:     'Arrival recorded successfully! GPS tracking is now active.',
        arrivalTime: result.arrivalTime,
        driverName:  currentUser.userName,
      });

      // Start background GPS tracking after navigation (isolated — failure won't crash)
      try {
        await startShiftTracking(arrivalCoords.lat, arrivalCoords.lng, currentUser.userId, currentUser.userName, result.rowId);
      } catch (gpsErr) {
        console.warn('GPS tracking start failed (non-fatal):', gpsErr);
      }

      // Request battery optimization exemption (Android) — keeps foreground GPS service alive
      if (Platform.OS === 'android') {
        try {
          await IntentLauncher.startActivityAsync(
            IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
            { data: 'package:com.rsa.driverpilot' }
          );
        } catch (_) { /* non-fatal — user may have dismissed or already exempted */ }
      }
    } catch (err) {
      Alert.alert(t('error', language), err.message || t('errServer', language));
    } finally {
      setSaving(false);
    }
  }

  if (!currentUser) {
    return (
      <View style={styles.centred}>
        <Text style={styles.errorText}>Not logged in. Please restart the app.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

      {/* ── Header card ── */}
      <View style={styles.headerCard}>
        <Text style={styles.stageTag}>STAGE 1</Text>
        <Text style={styles.headerTitle}>Mark Arrival at Facility</Text>
        <Text style={styles.headerSub}>Welcome, {currentUser.userName}</Text>
      </View>

      {/* ── Already done warning ── */}
      {alreadyDone && (
        <View style={styles.warnBox}>
          <Text style={styles.warnText}>
            ⚠ You have already marked arrival for the current shift.
            Complete Stage 4 before starting a new shift.
          </Text>
        </View>
      )}

      {/* ── GPS check card ── */}
      <View style={styles.card}>
        <Text style={styles.instructionText}>
          Stand within 200m of the facility gate, then tap the button below to mark your arrival.
          Your GPS location will be automatically verified.
        </Text>

        {/* GPS status feedback */}
        {gpsStatus === 'ok' && (
          <View style={[styles.statusBannerBase, styles.statusBannerSuccess]}>
            <Text style={styles.statusText}>
              ✓ Location verified — within {distanceM}m of facility
            </Text>
          </View>
        )}
        {gpsStatus === 'far' && (
          <View style={[styles.statusBannerBase, styles.statusBannerWarning]}>
            <Text style={styles.statusTextWarning}>
              📍 You are {distanceM}m from the facility.{'\n'}
              Move closer (within 200m) to mark your arrival.
            </Text>
          </View>
        )}
        {gpsStatus === 'error' && (
          <View style={[styles.statusBannerBase, styles.statusBannerError]}>
            <Text style={styles.statusTextError}>⚠ GPS error. Please enable GPS and try again.</Text>
          </View>
        )}

        {/* Arrival time preview */}
        {gpsStatus === 'ok' && arrivalTime && (
          <View style={styles.timestampBox}>
            <Text style={styles.timestampLabel}>Arrival Timestamp (Auto-Captured)</Text>
            <Text style={styles.timestampValue}>🕐 {formatDubaiTime(arrivalTime)}</Text>
          </View>
        )}

        {/* Check location button */}
        {gpsStatus !== 'ok' && (
          <TouchableOpacity
            style={[styles.arrivedBtn, (checking || alreadyDone) && styles.arrivedBtnDisabled]}
            onPress={handleArrivedAtFacility}
            disabled={checking || alreadyDone}
          >
            {checking ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <>
                <Text style={styles.arrivedBtnIcon}>📍</Text>
                <Text style={styles.arrivedBtnText}>Check My Location</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {checking && (
          <Text style={styles.checkingText}>Verifying your GPS location…</Text>
        )}

        {/* Confirm arrival button — shown after GPS verified */}
        {gpsStatus === 'ok' && (
          <TouchableOpacity
            style={[styles.confirmBtn, saving && styles.confirmBtnDisabled]}
            onPress={handleConfirmArrival}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <>
                <Text style={styles.arrivedBtnIcon}>✅</Text>
                <Text style={styles.arrivedBtnText}>Confirm Arrival &amp; Start Shift</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Info note */}
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          📶 GPS must be enabled on your phone.{'\n'}
          Background location permission ("Allow all the time") is required for shift tracking.
        </Text>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: COLORS.lightGray },
  content: { padding: 16, paddingBottom: 40 },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

  headerCard: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    marginBottom: 16,
  },
  stageTag: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 8,
    letterSpacing: 1.5,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: COLORS.white, textAlign: 'center' },
  headerSub:   { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 6 },

  warnBox: {
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
  },
  warnText: { color: '#E65100', fontSize: 14, lineHeight: 20 },

  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 12,
  },

  instructionText: {
    fontSize: 14,
    color: COLORS.textMid,
    lineHeight: 22,
    marginBottom: 16,
    textAlign: 'center',
  },

  statusBannerBase: {
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
  },
  statusBannerSuccess: { backgroundColor: '#E8F5E9' },
  statusBannerWarning: { backgroundColor: '#FFF8E1' },
  statusBannerError:   { backgroundColor: '#FFEBEE' },
  statusText:        { color: COLORS.success, fontWeight: '600', fontSize: 14, textAlign: 'center' },
  statusTextWarning: { color: '#E65100', fontWeight: '600', fontSize: 14, lineHeight: 22 },
  statusTextError:   { color: COLORS.error, fontWeight: '600', fontSize: 14 },

  timestampBox: {
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
    alignItems: 'center',
  },
  timestampLabel: { fontSize: 11, color: COLORS.textLight, fontWeight: '600', letterSpacing: 0.5, marginBottom: 4 },
  timestampValue: { fontSize: 15, color: COLORS.primary, fontWeight: '700' },

  arrivedBtn: {
    backgroundColor: '#1565C0',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  arrivedBtnDisabled: { backgroundColor: COLORS.textLight },
  arrivedBtnIcon:     { fontSize: 20 },
  arrivedBtnText:     { fontSize: 17, fontWeight: '800', color: COLORS.white },

  confirmBtn: {
    backgroundColor: COLORS.success,
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  confirmBtnDisabled: { backgroundColor: COLORS.textLight },

  checkingText: {
    textAlign: 'center',
    color: COLORS.textLight,
    fontSize: 13,
    marginTop: 10,
  },

  infoBox: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 14,
  },
  infoText: { fontSize: 13, color: COLORS.accent, lineHeight: 20 },

  errorText: { color: COLORS.error, fontSize: 15, textAlign: 'center' },
});

// =============================================================================
// SuccessScreen — Stage completion confirmation
// Shows a success message and summary data.
// User returns home from here.
// =============================================================================
import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import { useAppContext } from '../store/AppContext';
import { COLORS } from '../config';
import { t } from '../i18n/translations';

export default function SuccessScreen({ navigation, route }) {
  const { language } = useAppContext();
  const {
    stage, message, driverName, arrivalTime, departureTime,
    submitTime, shiftDuration, overtime, gpsKm, facilityLeft,
  } = route.params || {};

  function handleBackToHome() {
    navigation.navigate('Home');
  }

  const stageEmojis = { 1: '🏁', 2: '🚗', 3: '📦', 4: '✅' };
  const stageColors = { 1: '#1976D2', 2: '#7B1FA2', 3: '#F57F17', 4: '#2E7D32' };
  const bgColor     = stageColors[stage] || COLORS.primary;

  return (
    <View style={styles.screen}>
      <View style={[styles.hero, { backgroundColor: bgColor }]}>
        <Text style={styles.emoji}>{stageEmojis[stage] || '✓'}</Text>
        <Text style={styles.successTitle}>{t('successTitle', language)}</Text>
        <Text style={styles.successMessage}>{message}</Text>
        {driverName ? <Text style={styles.driverName}>{driverName}</Text> : null}
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>

        {/* Stage 1 summary */}
        {stage === 1 && arrivalTime && (
          <SummaryCard title="Shift Started">
            <Row label="Arrival Time" value={arrivalTime} />
            <Row label="GPS Tracking" value="Active — running in background" highlight />
          </SummaryCard>
        )}

        {/* Stage 2 summary */}
        {stage === 2 && departureTime && (
          <SummaryCard title="Departure Recorded">
            <Row label="Departure Time" value={departureTime} />
          </SummaryCard>
        )}

        {/* Stage 3 summary */}
        {stage === 3 && submitTime && (
          <SummaryCard title="Last Drop Saved">
            <Row label="Submitted At" value={submitTime} />
          </SummaryCard>
        )}

        {/* Stage 4 summary — includes GPS data */}
        {stage === 4 && (
          <SummaryCard title="Shift Complete">
            {shiftDuration !== undefined && (
              <Row label="Shift Duration" value={`${shiftDuration} hrs`} />
            )}
            {overtime > 0 && (
              <Row label="Overtime" value={`${overtime} hrs`} highlight />
            )}
            {gpsKm !== undefined && (
              <Row label="GPS Distance" value={`${gpsKm.toFixed ? gpsKm.toFixed(1) : gpsKm} km`} />
            )}
            {facilityLeft && (
              <Row label="Facility Left" value={new Date(facilityLeft).toLocaleTimeString()} />
            )}
          </SummaryCard>
        )}

        <TouchableOpacity style={[styles.homeBtn, { backgroundColor: bgColor }]} onPress={handleBackToHome}>
          <Text style={styles.homeBtnText}>{t('backToHome', language)}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function SummaryCard({ title, children }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value, highlight }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, highlight && styles.rowValueHighlight]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.lightGray },
  hero: {
    paddingTop: 60,
    paddingBottom: 36,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emoji:          { fontSize: 56, marginBottom: 12 },
  successTitle:   { fontSize: 28, fontWeight: '900', color: COLORS.white },
  successMessage: { fontSize: 15, color: 'rgba(255,255,255,0.85)', marginTop: 8, textAlign: 'center', lineHeight: 22 },
  driverName:     { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 6, fontWeight: '600' },

  body:        { flex: 1 },
  bodyContent: { padding: 16, paddingBottom: 40 },

  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMid,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  rowLabel:          { fontSize: 13, color: COLORS.textMid, flex: 1 },
  rowValue:          { fontSize: 14, fontWeight: '600', color: COLORS.textDark, flex: 1, textAlign: 'right' },
  rowValueHighlight: { color: COLORS.warning },

  homeBtn: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  homeBtnText: { fontSize: 16, fontWeight: '800', color: COLORS.white },
});

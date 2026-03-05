// =============================================================================
// HomeScreen — Main hub
// Driver view: stage progress cards + live KM counter + dashboard link
// Admin view: admin dashboard link only
// =============================================================================
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { useAppContext } from '../store/AppContext';
import { getLiveGpsStats } from '../services/gps';
import { writeGpsPoint } from '../services/firebase';
import { distanceMetres } from '../utils/haversine';
import { COLORS } from '../config';
import { t, isRTL } from '../i18n/translations';

const LANGUAGES = ['en', 'hi', 'ar', 'ur'];

// Stage definitions (for driver view)
const STAGES = [
  {
    num:     1,
    emoji:   '🏭',
    color:   '#1565C0',
    nav:     'Stage1Arrival',
    title:   'Mark Arrival',
    sub:     'GPS-verified arrival at facility',
  },
  {
    num:     2,
    emoji:   '🚗',
    color:   '#6A1B9A',
    nav:     'Stage2',
    title:   'Departure Details',
    sub:     'Vehicle, helper, odometer & departure time',
  },
  {
    num:     3,
    emoji:   '📦',
    color:   '#E65100',
    nav:     'Stage3',
    title:   'Last Drop Done',
    sub:     'Mark last drop & record odometer',
  },
  {
    num:     4,
    emoji:   '✅',
    color:   '#1B5E20',
    nav:     'Stage4',
    title:   'Shift Complete',
    sub:     'End shift & capture final odometer',
  },
];

export default function HomeScreen({ navigation }) {
  const {
    language, setLanguage,
    currentUser, clearCurrentUser,
    shiftProgress,
  } = useAppContext();
  const rtl = isRTL(language);

  const [liveKm, setLiveKm] = useState(0);
  const lastFgPos = React.useRef(null); // last foreground GPS position written

  // Refresh GPS km + push foreground GPS heartbeat every 15 seconds while shift is active.
  // This supplements the background task — Android may throttle it when the app is in foreground.
  useFocusEffect(
    useCallback(() => {
      let interval;
      const shiftActive = shiftProgress?.stage1Done && !shiftProgress?.stage4Done;

      if (shiftActive) {
        loadGpsStats();
        interval = setInterval(loadGpsStats, 15000);
      }

      return () => {
        if (interval) clearInterval(interval);
      };
    }, [shiftProgress])
  );

  async function loadGpsStats() {
    try {
      const stats = await getLiveGpsStats();
      setLiveKm(stats.totalKm || 0);

      // Foreground GPS heartbeat: get current position and write to Firebase as a route point
      // if the driver has moved >15m from the last foreground-written point.
      const shiftActive = shiftProgress?.stage1Done && !shiftProgress?.stage4Done;
      if (shiftActive && currentUser && shiftProgress?.rowId) {
        try {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
            timeout: 10000,
          });
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const acc = pos.coords.accuracy;

          if (acc != null && acc <= 50) {
            let shouldAppend = false;
            if (!lastFgPos.current) {
              shouldAppend = true;
            } else {
              const d = distanceMetres(lastFgPos.current.lat, lastFgPos.current.lng, lat, lng);
              shouldAppend = d > 15;
            }
            if (shouldAppend) {
              lastFgPos.current = { lat, lng };
              writeGpsPoint({
                driverId:   currentUser.userId,
                driverName: currentUser.userName,
                shiftRowId: String(shiftProgress.rowId),
                lat, lng,
                km:         stats.totalKm || 0,
                accuracy:   acc,
                appendRoute: true,
              });
            }
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  function handleLogout() {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await clearCurrentUser();
            navigation.replace('Auth');
          },
        },
      ]
    );
  }

  // Stage enablement logic
  function isStageEnabled(stageNum) {
    if (!shiftProgress) {
      return stageNum === 1;
    }
    const { stage1Done, stage2Done, stage3Done, stage4Done } = shiftProgress;
    const allDone = stage1Done && stage2Done && stage3Done && stage4Done;

    if (allDone) return stageNum === 1; // Reset — allow new shift

    switch (stageNum) {
      case 1: return !stage1Done;
      case 2: return stage1Done && !stage2Done;
      case 3: return stage2Done && !stage3Done;
      case 4: return stage3Done && !stage4Done;
      default: return false;
    }
  }

  function isStageDone(stageNum) {
    if (!shiftProgress) return false;
    switch (stageNum) {
      case 1: return !!shiftProgress.stage1Done;
      case 2: return !!shiftProgress.stage2Done;
      case 3: return !!shiftProgress.stage3Done;
      case 4: return !!shiftProgress.stage4Done;
      default: return false;
    }
  }

  function handleStagePress(stage) {
    const enabled = isStageEnabled(stage.num);
    if (!enabled) {
      const done = isStageDone(stage.num);
      if (done) {
        const allDone = shiftProgress?.stage1Done && shiftProgress?.stage2Done &&
                        shiftProgress?.stage3Done && shiftProgress?.stage4Done;
        if (!allDone) {
          Alert.alert(
            'Stage Already Completed',
            `Stage ${stage.num} has already been completed for this shift.`
          );
        }
      } else {
        const prevStage = stage.num - 1;
        Alert.alert(
          'Complete Previous Stage',
          `Please complete Stage ${prevStage} before proceeding to Stage ${stage.num}.`
        );
      }
      return;
    }
    navigation.navigate(stage.nav);
  }

  const allShiftDone = shiftProgress?.stage1Done && shiftProgress?.stage2Done &&
                       shiftProgress?.stage3Done && shiftProgress?.stage4Done;
  const shiftActive  = shiftProgress?.stage1Done && !allShiftDone;

  if (!currentUser) {
    return null; // AuthScreen handles this via navigation
  }

  // ── ADMIN VIEW ──
  if (currentUser.isAdmin) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <View>
            <Text style={styles.appTitle}>RSA Driver Pilot</Text>
            <Text style={styles.appSubtitle}>Admin: {currentUser.userName}</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Text style={styles.logoutBtnText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.body} contentContainerStyle={[styles.bodyContent, { alignItems: 'center', justifyContent: 'center', flex: 1 }]}>
          <View style={styles.adminWelcome}>
            <Text style={styles.adminEmoji}>👨‍💼</Text>
            <Text style={styles.adminTitle}>Admin Portal</Text>
            <Text style={styles.adminSub}>Monitor all driver operations and shift data</Text>
          </View>
          <TouchableOpacity
            style={styles.adminDashBtn}
            onPress={() => navigation.navigate('AdminDashboard')}
          >
            <Text style={styles.adminDashBtnIcon}>📊</Text>
            <Text style={styles.adminDashBtnText}>Open Admin Dashboard</Text>
            <Text style={styles.adminDashBtnArrow}>›</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── DRIVER VIEW ──
  return (
    <View style={styles.screen}>

      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.appTitle}>RSA Driver Pilot</Text>
          <Text style={styles.appSubtitle}>👤 {currentUser.userName}</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.langRow}>
            {LANGUAGES.map(lang => (
              <TouchableOpacity
                key={lang}
                style={[styles.langBtn, language === lang && styles.langBtnActive]}
                onPress={() => setLanguage(lang)}
              >
                <Text style={[styles.langBtnText, language === lang && styles.langBtnTextActive]}>
                  {lang.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Text style={styles.logoutBtnText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>

        {/* Live KM counter — shown during active shift */}
        {shiftActive && (
          <View style={styles.kmBanner}>
            <View style={styles.kmBannerLeft}>
              <View style={styles.gpsDot} />
              <Text style={styles.kmBannerTitle}>GPS Tracking Active</Text>
            </View>
            <View style={styles.kmValueBox}>
              <Text style={styles.kmValue}>{liveKm.toFixed(2)}</Text>
              <Text style={styles.kmUnit}>km</Text>
            </View>
          </View>
        )}

        {/* All shift done banner */}
        {allShiftDone && (
          <View style={styles.allDoneBanner}>
            <Text style={styles.allDoneTitle}>✅ Shift Complete!</Text>
            <Text style={styles.allDoneSub}>All stages done. You can start a new shift when ready.</Text>
          </View>
        )}

        {/* Stage progress cards */}
        <Text style={styles.sectionLabel}>Shift Stages</Text>

        {STAGES.map(stage => {
          const done    = isStageDone(stage.num);
          const enabled = isStageEnabled(stage.num);
          const locked  = !done && !enabled;

          return (
            <TouchableOpacity
              key={stage.num}
              style={[
                styles.stageCard,
                { borderLeftColor: done ? COLORS.success : enabled ? stage.color : COLORS.borderGray },
                locked && styles.stageCardLocked,
              ]}
              onPress={() => handleStagePress(stage)}
              activeOpacity={0.75}
            >
              <View style={[
                styles.stageEmojiBg,
                { backgroundColor: done ? '#E8F5E9' : enabled ? stage.color + '18' : '#F5F5F5' },
              ]}>
                <Text style={styles.stageEmoji}>
                  {done ? '✅' : locked ? '🔒' : stage.emoji}
                </Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.stageNumLabel}>Stage {stage.num}</Text>
                <Text style={[styles.stageTitle, locked && styles.stageTitleLocked]}>
                  {stage.title}
                </Text>
                <Text style={styles.stageSub}>{done ? 'Completed ✓' : stage.sub}</Text>
              </View>

              <Text style={[
                styles.stageArrow,
                { color: done ? COLORS.success : enabled ? stage.color : COLORS.textLight },
              ]}>
                {done ? '✓' : locked ? '' : '›'}
              </Text>
            </TouchableOpacity>
          );
        })}

        {/* My Dashboard button */}
        <TouchableOpacity
          style={styles.dashboardBtn}
          onPress={() => navigation.navigate('DriverDashboard')}
        >
          <Text style={styles.dashboardBtnIcon}>📊</Text>
          <Text style={styles.dashboardBtnText}>My Dashboard</Text>
          <Text style={styles.dashboardBtnArrow}>›</Text>
        </TouchableOpacity>

        {/* Pilot badge */}
        <View style={styles.pilotBadge}>
          <Text style={styles.pilotBadgeText}>🧪 PILOT — GPS tracking enabled</Text>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.lightGray },

  header: {
    backgroundColor: COLORS.primary,
    paddingTop: 52,
    paddingHorizontal: 20,
    paddingBottom: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  appTitle:    { fontSize: 20, fontWeight: '800', color: COLORS.white },
  appSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2 },

  headerRight: { alignItems: 'flex-end', gap: 6 },
  langRow:     { flexDirection: 'row', gap: 4 },
  langBtn: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  langBtnActive:     { backgroundColor: COLORS.white },
  langBtnText:       { fontSize: 10, color: 'rgba(255,255,255,0.8)', fontWeight: '700' },
  langBtnTextActive: { color: COLORS.primary },

  logoutBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  logoutBtnText: { color: COLORS.white, fontSize: 12, fontWeight: '600' },

  body:        { flex: 1 },
  bodyContent: { padding: 16, paddingBottom: 40, gap: 12 },

  // Live KM banner
  kmBanner: {
    backgroundColor: '#0A3880',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kmBannerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gpsDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#4CAF50' },
  kmBannerTitle: { color: COLORS.white, fontWeight: '700', fontSize: 14 },
  kmValueBox:    { alignItems: 'flex-end' },
  kmValue:       { fontSize: 28, fontWeight: '900', color: COLORS.white },
  kmUnit:        { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: -4 },

  // All done banner
  allDoneBanner: {
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#A5D6A7',
  },
  allDoneTitle: { fontSize: 16, fontWeight: '800', color: COLORS.success },
  allDoneSub:   { fontSize: 12, color: COLORS.textMid, marginTop: 4, textAlign: 'center' },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 0,
  },

  // Stage cards
  stageCard: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderLeftWidth: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  stageCardLocked: { opacity: 0.5 },
  stageEmojiBg: {
    width: 50,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageEmoji:      { fontSize: 24 },
  stageNumLabel:   { fontSize: 10, fontWeight: '700', color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: 0.5 },
  stageTitle:      { fontSize: 15, fontWeight: '800', color: COLORS.textDark, marginTop: 1 },
  stageTitleLocked:{ color: COLORS.textLight },
  stageSub:        { fontSize: 11, color: COLORS.textMid, marginTop: 1 },
  stageArrow:      { fontSize: 28, fontWeight: '300', marginLeft: 4 },

  // Dashboard button
  dashboardBtn: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderLeftWidth: 5,
    borderLeftColor: COLORS.accent,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    marginTop: 4,
  },
  dashboardBtnIcon:  { fontSize: 24 },
  dashboardBtnText:  { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.textDark },
  dashboardBtnArrow: { fontSize: 28, color: COLORS.accent, fontWeight: '300' },

  pilotBadge: {
    backgroundColor: '#FFF9C4',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  pilotBadgeText: { color: '#5D4037', fontSize: 13, fontWeight: '600' },

  // Admin view
  adminWelcome: { alignItems: 'center', paddingVertical: 40 },
  adminEmoji:   { fontSize: 64, marginBottom: 16 },
  adminTitle:   { fontSize: 26, fontWeight: '900', color: COLORS.textDark },
  adminSub:     { fontSize: 14, color: COLORS.textMid, marginTop: 6, textAlign: 'center' },
  adminDashBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    marginTop: 20,
  },
  adminDashBtnIcon:  { fontSize: 28 },
  adminDashBtnText:  { flex: 1, fontSize: 17, fontWeight: '800', color: COLORS.white },
  adminDashBtnArrow: { fontSize: 32, color: 'rgba(255,255,255,0.7)', fontWeight: '300' },
});

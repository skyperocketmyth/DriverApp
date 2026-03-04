// =============================================================================
// GpsBanner — Live GPS tracking status shown on Stage 2/3/4 screens
// =============================================================================
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getLiveGpsStats } from '../services/gps';
import { COLORS } from '../config';
import { t } from '../i18n/translations';

export default function GpsBanner({ language }) {
  const [stats, setStats] = useState({ totalKm: 0, facilityLeftTime: null });

  useEffect(() => {
    let interval;
    loadStats();
    interval = setInterval(loadStats, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, []);

  async function loadStats() {
    const s = await getLiveGpsStats();
    setStats(s);
  }

  function formatTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  return (
    <View style={styles.banner}>
      <View style={styles.row}>
        <View style={styles.dot} />
        <Text style={styles.title}>{t('gpsTracking', language)}</Text>
      </View>
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{stats.totalKm.toFixed(1)}</Text>
          <Text style={styles.statLabel}>km travelled</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.stat}>
          {stats.facilityLeftTime ? (
            <>
              <Text style={styles.statValue}>{formatTime(stats.facilityLeftTime)}</Text>
              <Text style={styles.statLabel}>facility left</Text>
            </>
          ) : (
            <>
              <Text style={styles.statValueMuted}>–</Text>
              <Text style={styles.statLabel}>not left yet</Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#0A3880',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
    marginRight: 8,
  },
  title: { color: COLORS.white, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  stats: { flexDirection: 'row', alignItems: 'center' },
  stat:  { flex: 1, alignItems: 'center' },
  divider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.2)' },
  statValue:      { color: COLORS.white, fontSize: 22, fontWeight: '800' },
  statValueMuted: { color: 'rgba(255,255,255,0.4)', fontSize: 22, fontWeight: '800' },
  statLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 2 },
});

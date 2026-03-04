// =============================================================================
// DriverDashboardScreen — Personal metrics for the logged-in driver
// =============================================================================
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, RefreshControl, Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { BarChart, LineChart } from 'react-native-chart-kit';
import { useAppContext } from '../store/AppContext';
import { fetchDriverDashboard } from '../services/api';
import { COLORS } from '../config';

const SCREEN_W = Dimensions.get('window').width;
const CHART_W  = SCREEN_W - 48; // accounting for padding

const CHART_CONFIG = {
  backgroundGradientFrom: '#FFFFFF',
  backgroundGradientTo:   '#FFFFFF',
  color: (opacity = 1) => `rgba(13, 71, 161, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(85, 85, 85, ${opacity})`,
  strokeWidth: 2,
  barPercentage: 0.6,
  decimalPlaces: 1,
  propsForDots: { r: '4', strokeWidth: '2', stroke: COLORS.primary },
};

function StatCard({ label, value, sub, color }) {
  return (
    <View style={[styles.statCard, { borderTopColor: color || COLORS.primary }]}>
      <Text style={[styles.statValue, { color: color || COLORS.primary }]}>{value ?? '—'}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

function SectionTitle({ title }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

export default function DriverDashboardScreen() {
  const { currentUser } = useAppContext();
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [error,       setError]       = useState(null);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useFocusEffect(useCallback(() => { load(); }, [currentMonth]));

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else           setLoading(true);
    setError(null);
    try {
      const result = await fetchDriverDashboard(currentUser?.userId, currentMonth);
      if (result.error) throw new Error(result.error);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function prevMonth() {
    const [y, m] = currentMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  function nextMonth() {
    const [y, m] = currentMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    const now = new Date();
    if (d > now) return; // don't go future
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  function formatMonth(ym) {
    const [y, m] = ym.split('-').map(Number);
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${names[m-1]} ${y}`;
  }

  if (loading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading your dashboard…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centred}>
        <Text style={styles.errorText}>⚠ {error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Chart data preparation ──
  const otDates = (data?.overtimeByDate || []).slice(-14);
  const kmDates = (data?.kmByDate || []).slice(-14);

  const otChartData = otDates.length > 0 ? {
    labels: otDates.map(d => d.date.slice(0, 5)), // dd/MM
    datasets: [{ data: otDates.map(d => Math.round(d.overtime * 10) / 10 || 0) }],
  } : null;

  const kmChartData = kmDates.length > 0 ? {
    labels: kmDates.map(d => d.date.slice(0, 5)),
    datasets: [{ data: kmDates.map(d => Math.round(d.km * 10) / 10 || 0) }],
  } : null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
    >
      {/* Month selector */}
      <View style={styles.monthRow}>
        <TouchableOpacity style={styles.monthBtn} onPress={prevMonth}>
          <Text style={styles.monthBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{formatMonth(currentMonth)}</Text>
        <TouchableOpacity style={styles.monthBtn} onPress={nextMonth}>
          <Text style={styles.monthBtnText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* ── Summary stat cards ── */}
      <SectionTitle title="Monthly Overview" />
      <View style={styles.statRow}>
        <StatCard
          label="Days Present"
          value={data?.daysPresent ?? 0}
          color={COLORS.primary}
        />
        <StatCard
          label="Overtime (hrs)"
          value={data?.overtimeHours ?? 0}
          color={COLORS.warning}
        />
      </View>
      <View style={styles.statRow}>
        <StatCard
          label="KM Driven"
          value={`${data?.kmData?.monthTotal ?? 0} km`}
          sub={`Yesterday: ${data?.kmData?.yesterday ?? 0} km`}
          color={COLORS.accent}
        />
        <StatCard
          label="Failed Drops"
          value={data?.failedDrops?.monthTotal ?? 0}
          sub={`${data?.failedDrops?.monthPercent ?? 0}% of total`}
          color={COLORS.error}
        />
      </View>

      {/* ── Failed drops breakdown ── */}
      <SectionTitle title="Failed Drops Breakdown" />
      <View style={styles.card}>
        <View style={styles.tableRow}>
          <Text style={styles.tableHeader}>Period</Text>
          <Text style={styles.tableHeader}>Failed</Text>
        </View>
        {[
          { label: 'Today',     value: data?.failedDrops?.today ?? 0 },
          { label: 'Yesterday', value: data?.failedDrops?.yesterday ?? 0 },
          { label: 'This Month', value: data?.failedDrops?.monthTotal ?? 0, sub: `${data?.failedDrops?.monthPercent ?? 0}%` },
        ].map(row => (
          <View key={row.label} style={styles.tableRow}>
            <Text style={styles.tableCell}>{row.label}</Text>
            <Text style={[styles.tableCell, styles.tableCellBold]}>
              {row.value}{row.sub ? ` (${row.sub})` : ''}
            </Text>
          </View>
        ))}
      </View>

      {/* ── KM Data ── */}
      <SectionTitle title="KM Driven Summary" />
      <View style={styles.card}>
        {[
          { label: 'Yesterday',    value: `${data?.kmData?.yesterday ?? 0} km` },
          { label: 'Last 7 Days',  value: `${data?.kmData?.last7Days ?? 0} km` },
          { label: 'This Month',   value: `${data?.kmData?.monthTotal ?? 0} km` },
        ].map(row => (
          <View key={row.label} style={styles.tableRow}>
            <Text style={styles.tableCell}>{row.label}</Text>
            <Text style={[styles.tableCell, styles.tableCellBold]}>{row.value}</Text>
          </View>
        ))}
      </View>

      {/* ── Vehicle Running Hours ── */}
      <SectionTitle title="Vehicle Running Hours" />
      <View style={styles.card}>
        {[
          { label: 'Yesterday',   value: `${data?.vehicleHours?.yesterday ?? 0} hrs` },
          { label: 'Last 7 Days', value: `${data?.vehicleHours?.last7Days ?? 0} hrs` },
          { label: 'This Month',  value: `${data?.vehicleHours?.monthTotal ?? 0} hrs` },
        ].map(row => (
          <View key={row.label} style={styles.tableRow}>
            <Text style={styles.tableCell}>{row.label}</Text>
            <Text style={[styles.tableCell, styles.tableCellBold]}>{row.value}</Text>
          </View>
        ))}
      </View>

      {/* ── OT Trend Chart ── */}
      {otChartData && (
        <>
          <SectionTitle title="Overtime Trend (Last 14 Days)" />
          <View style={styles.chartCard}>
            <BarChart
              data={otChartData}
              width={CHART_W}
              height={200}
              chartConfig={{ ...CHART_CONFIG, color: (o = 1) => `rgba(245, 127, 23, ${o})` }}
              style={styles.chart}
              showValuesOnTopOfBars
              fromZero
              yAxisSuffix="h"
            />
          </View>
        </>
      )}

      {/* ── KM Trend Chart ── */}
      {kmChartData && (
        <>
          <SectionTitle title="KM Trend (Last 14 Days)" />
          <View style={styles.chartCard}>
            <LineChart
              data={kmChartData}
              width={CHART_W}
              height={200}
              chartConfig={CHART_CONFIG}
              style={styles.chart}
              bezier
              fromZero
              yAxisSuffix="k"
            />
          </View>
        </>
      )}

      {/* ── Day-level breakdown table ── */}
      <SectionTitle title="Daily Breakdown" />
      <View style={styles.card}>
        {/* Table header */}
        <View style={[styles.tableRow, styles.tableHeaderRow]}>
          <Text style={[styles.tableHeader, { flex: 1.2 }]}>Date</Text>
          <Text style={styles.tableHeader}>KM</Text>
          <Text style={styles.tableHeader}>Veh.Hrs</Text>
          <Text style={styles.tableHeader}>OT</Text>
          <Text style={styles.tableHeader}>Fail/Total</Text>
        </View>
        {(data?.dayBreakdown || []).map((row, i) => (
          <View key={row.date + i} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
            <Text style={[styles.tableCell, { flex: 1.2, fontSize: 11 }]}>{row.date}</Text>
            <Text style={styles.tableCell}>{Math.round(row.km)}</Text>
            <Text style={styles.tableCell}>{Math.round(row.vehicleHours * 10) / 10}</Text>
            <Text style={[styles.tableCell, row.overtime > 0 && styles.tableCellOT]}>
              {Math.round(row.overtime * 10) / 10}h
            </Text>
            <Text style={styles.tableCell}>{row.failedDrops}/{row.totalDrops}</Text>
          </View>
        ))}
        {(!data?.dayBreakdown || data.dayBreakdown.length === 0) && (
          <Text style={styles.emptyText}>No data for this period.</Text>
        )}
      </View>

      {/* ── OT breakdown ── */}
      <SectionTitle title="Overtime Breakdown (Date Level)" />
      <View style={styles.card}>
        <View style={[styles.tableRow, styles.tableHeaderRow]}>
          <Text style={[styles.tableHeader, { flex: 1 }]}>Date</Text>
          <Text style={styles.tableHeader}>OT Hours</Text>
        </View>
        {(data?.overtimeByDate || []).filter(r => r.overtime > 0).map((row, i) => (
          <View key={row.date + i} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
            <Text style={[styles.tableCell, { flex: 1 }]}>{row.date}</Text>
            <Text style={[styles.tableCell, styles.tableCellOT]}>{Math.round(row.overtime * 10) / 10} hrs</Text>
          </View>
        ))}
        {!(data?.overtimeByDate?.some(r => r.overtime > 0)) && (
          <Text style={styles.emptyText}>No overtime this period.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: COLORS.lightGray },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

  loadingText: { marginTop: 12, color: COLORS.textMid, fontSize: 15 },
  errorText:   { color: COLORS.error, fontSize: 15, textAlign: 'center', marginBottom: 16 },
  retryBtn: { backgroundColor: COLORS.primary, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  retryBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },

  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 4 },
  monthBtn: { padding: 8 },
  monthBtnText: { fontSize: 28, color: COLORS.primary, fontWeight: '300' },
  monthLabel: { fontSize: 17, fontWeight: '800', color: COLORS.textDark },

  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 4,
  },

  statRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
    borderTopWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: { fontSize: 22, fontWeight: '900' },
  statLabel: { fontSize: 11, color: COLORS.textMid, marginTop: 2, fontWeight: '600' },
  statSub:   { fontSize: 10, color: COLORS.textLight, marginTop: 2 },

  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  chartCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  chart: { borderRadius: 8 },

  tableHeaderRow: { backgroundColor: COLORS.lightGray, borderRadius: 6, paddingHorizontal: 8 },
  tableRow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: COLORS.borderGray },
  tableRowAlt: { backgroundColor: '#FAFAFA' },
  tableHeader: { flex: 1, fontSize: 10, fontWeight: '800', color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableCell:   { flex: 1, fontSize: 12, color: COLORS.textDark },
  tableCellBold: { fontWeight: '700' },
  tableCellOT:   { color: COLORS.warning, fontWeight: '700' },

  emptyText: { textAlign: 'center', color: COLORS.textLight, fontSize: 13, paddingVertical: 12 },
});

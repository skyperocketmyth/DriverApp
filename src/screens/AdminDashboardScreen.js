// =============================================================================
// AdminDashboardScreen — Full operational view for Admin users
// 7 tabs: Live Ops, Failed Drops, Shift Trends, Vehicle Analysis,
//         Day Analysis, Stage Timings, Helper Usage
// =============================================================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, RefreshControl, Dimensions, FlatList,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { BarChart, LineChart } from 'react-native-chart-kit';
import { fetchAdminDashboard, fetchLiveOperations } from '../services/api';
import { subscribeToLivePositions, fetchShiftRoute } from '../services/firebase';
import MapView, { Marker, Polyline, Callout } from 'react-native-maps';
import { FACILITY } from '../config';
import { COLORS } from '../config';

const SCREEN_W = Dimensions.get('window').width;

// Distinct colours assigned to each driver on the map
const DRIVER_COLORS = [
  '#E53935', '#7B1FA2', '#00897B', '#F57C00',
  '#0288D1', '#558B2F', '#AD1457', '#795548',
];

const STAGE_NAMES = ['', 'At Facility', 'On Road', 'Last Drop Done', 'Shift Complete'];

// Drop GPS teleportation jumps only (>5 km = signal loss, not driving).
// Old 300 m threshold incorrectly dropped highway points (80 km/h every 20 s = 440 m).
function filterRouteOutliers(points) {
  if (points.length < 2) return points;
  const R = 6371000;
  const filtered = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = filtered[filtered.length - 1];
    const dLat = (points[i].latitude - prev.latitude) * Math.PI / 180;
    const dLng = (points[i].longitude - prev.longitude) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(prev.latitude * Math.PI / 180) * Math.cos(points[i].latitude * Math.PI / 180)
      * Math.sin(dLng / 2) ** 2;
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (dist < 5000) filtered.push(points[i]);
  }
  return filtered;
}

// Ramer-Douglas-Peucker simplification — removes collinear GPS noise (eps in metres)
function perpendicularDist(pt, s, e) {
  const dx = e.latitude - s.latitude, dy = e.longitude - s.longitude;
  if (dx === 0 && dy === 0) {
    const dlat = (pt.latitude - s.latitude) * 111320;
    const dlng = (pt.longitude - s.longitude) * 111320 * Math.cos(s.latitude * Math.PI / 180);
    return Math.sqrt(dlat * dlat + dlng * dlng);
  }
  const t = Math.max(0, Math.min(1, ((pt.latitude - s.latitude) * dx + (pt.longitude - s.longitude) * dy) / (dx * dx + dy * dy)));
  const px = (s.latitude + t * dx - pt.latitude) * 111320;
  const py = (s.longitude + t * dy - pt.longitude) * 111320 * Math.cos(pt.latitude * Math.PI / 180);
  return Math.sqrt(px * px + py * py);
}

function rdpSimplify(pts, eps) {
  if (pts.length < 3) return pts;
  let maxD = 0, idx = 0;
  const s = pts[0], e = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpendicularDist(pts[i], s, e);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > eps) {
    return [...rdpSimplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdpSimplify(pts.slice(idx), eps)];
  }
  return [s, e];
}

const CHART_W  = SCREEN_W - 48;

const CHART_CONFIG = {
  backgroundGradientFrom: '#FFFFFF',
  backgroundGradientTo:   '#FFFFFF',
  color: (opacity = 1) => `rgba(13, 71, 161, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(85, 85, 85, ${opacity})`,
  strokeWidth: 2,
  barPercentage: 0.55,
  decimalPlaces: 1,
};

const TABS = [
  { id: 'live',     label: '🔴 Live' },
  { id: 'map',      label: '🗺 Map' },
  { id: 'failed',   label: '📉 Failed' },
  { id: 'trends',   label: '📈 Trends' },
  { id: 'vehicles', label: '🚗 Vehicles' },
  { id: 'days',     label: '📅 Days' },
  { id: 'timings',  label: '⏱ Timings' },
  { id: 'helpers',  label: '👷 Helpers' },
];

function SectionTitle({ title }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function StatCard({ label, value, sub, color }) {
  return (
    <View style={[styles.statCard, { borderTopColor: color || COLORS.primary }]}>
      <Text style={[styles.statValue, { color: color || COLORS.primary }]}>{value ?? '—'}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

function minToHrMin(mins) {
  if (!mins && mins !== 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Tab: Live Operations ──
function LiveTab({ data, onRefresh }) {
  const ops       = data?.liveOperations || [];
  const summary   = data;
  const stageName = ['', 'At Facility', 'On Road', 'Last Drop Done', 'Shift Complete'];

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <View style={styles.statRow}>
        <StatCard label="Active Today"  value={summary?.activeDriversToday} color={COLORS.primary} />
        <StatCard label="On Road"       value={summary?.driversOnRoad}      color={COLORS.accent} />
      </View>
      <View style={styles.statRow}>
        <StatCard label="Total Drops"   value={summary?.dropsToday?.total}  color={COLORS.success} />
        <StatCard label="Failed Drops"  value={summary?.dropsToday?.failed} sub={`${summary?.dropsToday?.percent ?? 0}% failure`} color={COLORS.error} />
      </View>
      <View style={styles.statRow}>
        <StatCard label="Avg Shift (hrs)" value={summary?.avgShiftDuration} color={COLORS.warning} />
        <StatCard label="Punch-out Misses" value={summary?.punchOutMisses?.length ?? 0} color={COLORS.error} />
      </View>

      <SectionTitle title="Live Operations" />
      <View style={styles.card}>
        <View style={[styles.tableRow, styles.tableHeaderRow]}>
          <Text style={[styles.tableHeader, { flex: 1.5 }]}>Driver</Text>
          <Text style={styles.tableHeader}>Stage</Text>
          <Text style={styles.tableHeader}>Wait</Text>
          <Text style={styles.tableHeader}>Veh.Time</Text>
          <Text style={styles.tableHeader}>KM</Text>
        </View>
        {ops.map((op, i) => (
          <View key={op.driverName + i} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
            <Text style={[styles.tableCell, { flex: 1.5, fontSize: 11 }]} numberOfLines={1}>{op.driverName}</Text>
            <Text style={styles.tableCell}>{stageName[op.currentStage] || 'N/A'}</Text>
            <Text style={styles.tableCell}>{minToHrMin(op.facilityWaitMins)}</Text>
            <Text style={styles.tableCell}>{minToHrMin(op.vehRunMins)}</Text>
            <Text style={styles.tableCell}>{Math.round(op.kmSoFar * 10) / 10}</Text>
          </View>
        ))}
        {ops.length === 0 && <Text style={styles.emptyText}>No active drivers today.</Text>}
      </View>

      {/* Punch-out misses */}
      {(summary?.punchOutMisses?.length ?? 0) > 0 && (
        <>
          <SectionTitle title="Punch-Out Misses (Previous Day)" />
          <View style={styles.card}>
            {summary.punchOutMisses.map((d, i) => (
              <View key={d.driverName + i} style={styles.tableRow}>
                <Text style={styles.tableCell}>{d.driverName}</Text>
                <Text style={[styles.tableCell, styles.errorCell]}>Stage {d.stage} incomplete</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

// ── Tab: Failed Drop Analysis ──
function FailedTab({ data }) {
  const [expanded, setExpanded] = useState({});
  const analysis = data?.failedDropAnalysis || [];

  const chartData = analysis.slice(-14).length > 0 ? {
    labels: analysis.slice(-14).map(d => d.date.slice(0, 5)),
    datasets: [{ data: analysis.slice(-14).map(d => d.percent || 0) }],
  } : null;

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      {chartData && (
        <>
          <SectionTitle title="Failed % Trend (Last 14 Days)" />
          <View style={styles.chartCard}>
            <BarChart
              data={chartData}
              width={CHART_W}
              height={200}
              chartConfig={{ ...CHART_CONFIG, color: (o = 1) => `rgba(198, 40, 40, ${o})` }}
              style={styles.chart}
              showValuesOnTopOfBars
              fromZero
              yAxisSuffix="%"
            />
          </View>
        </>
      )}

      <SectionTitle title="Date-wise Failed Drop Analysis" />
      {analysis.map((row, i) => (
        <View key={row.date + i} style={styles.card}>
          <TouchableOpacity
            style={styles.expandHeader}
            onPress={() => setExpanded(prev => ({ ...prev, [row.date]: !prev[row.date] }))}
          >
            <Text style={styles.expandDate}>{row.date}</Text>
            <Text style={styles.expandStats}>
              {row.failed}/{row.total} ({row.percent}%)
            </Text>
            <Text style={styles.expandArrow}>{expanded[row.date] ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {expanded[row.date] && (
            <View style={styles.expandBody}>
              {(row.drivers || []).map((d, j) => (
                <View key={d.driverName + j} style={styles.tableRow}>
                  <Text style={[styles.tableCell, { flex: 1.5 }]}>{d.driverName}</Text>
                  <Text style={styles.tableCell}>{d.failedDrops}/{d.totalDrops}</Text>
                  <Text style={[styles.tableCell, { color: COLORS.error }]}>{d.percent}%</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ))}
      {analysis.length === 0 && <Text style={styles.emptyText}>No failed drop data available.</Text>}
    </ScrollView>
  );
}

// ── Tab: Shift Trends ──
function TrendsTab({ data }) {
  const trends = data?.shiftTrend || [];

  const avgDurationData = trends.slice(-14).length > 0 ? {
    labels: trends.slice(-14).map(d => d.date.slice(0, 5)),
    datasets: [{ data: trends.slice(-14).map(d => d.avgShiftDuration || 0) }],
  } : null;

  const otData = trends.slice(-14).length > 0 ? {
    labels: trends.slice(-14).map(d => d.date.slice(0, 5)),
    datasets: [{ data: trends.slice(-14).map(d => d.totalOT || 0) }],
  } : null;

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      {avgDurationData && (
        <>
          <SectionTitle title="Avg Shift Duration (hrs, Last 14 Days)" />
          <View style={styles.chartCard}>
            <LineChart
              data={avgDurationData}
              width={CHART_W}
              height={200}
              chartConfig={CHART_CONFIG}
              style={styles.chart}
              bezier
              fromZero
              yAxisSuffix="h"
            />
          </View>
        </>
      )}

      {otData && (
        <>
          <SectionTitle title="Total Overtime Hours (Last 14 Days)" />
          <View style={styles.chartCard}>
            <BarChart
              data={otData}
              width={CHART_W}
              height={200}
              chartConfig={{ ...CHART_CONFIG, color: (o = 1) => `rgba(245, 127, 23, ${o})` }}
              style={styles.chart}
              fromZero
              yAxisSuffix="h"
            />
          </View>
        </>
      )}

      {trends.length === 0 && <Text style={styles.emptyText}>No trend data available.</Text>}
    </ScrollView>
  );
}

// ── Tab: Vehicle Analysis ──
function VehiclesTab({ data }) {
  const vehicleAnalysis = data?.vehicleAnalysis || {};
  const dates = Object.keys(vehicleAnalysis).sort().reverse().slice(0, 30);

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <SectionTitle title="Vehicle KM & Running Hours by Date" />
      {dates.map(date => (
        <View key={date} style={[styles.card, { marginBottom: 10 }]}>
          <Text style={styles.dateGroupHeader}>{date}</Text>
          <View style={[styles.tableRow, styles.tableHeaderRow]}>
            <Text style={[styles.tableHeader, { flex: 1.5 }]}>Vehicle</Text>
            <Text style={styles.tableHeader}>KM</Text>
            <Text style={styles.tableHeader}>Run Hrs</Text>
          </View>
          {(vehicleAnalysis[date] || []).map((v, i) => (
            <View key={v.vehicle + i} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
              <Text style={[styles.tableCell, { flex: 1.5 }]}>{v.vehicle}</Text>
              <Text style={styles.tableCell}>{v.km}</Text>
              <Text style={styles.tableCell}>{v.runHours}h</Text>
            </View>
          ))}
        </View>
      ))}
      {dates.length === 0 && <Text style={styles.emptyText}>No vehicle data available.</Text>}
    </ScrollView>
  );
}

// ── Tab: Day Analysis ──
function DaysTab({ data }) {
  const rows = data?.dayAnalysis || [];

  return (
    <ScrollView contentContainerStyle={styles.tabContent} horizontal={false}>
      <SectionTitle title="Day-wise Driver Analysis" />
      <View style={styles.card}>
        <View style={[styles.tableRow, styles.tableHeaderRow]}>
          <Text style={[styles.tableHeader, { flex: 1.2 }]}>Date</Text>
          <Text style={[styles.tableHeader, { flex: 1.5 }]}>Driver</Text>
          <Text style={styles.tableHeader}>Hrs</Text>
          <Text style={styles.tableHeader}>OT</Text>
          <Text style={styles.tableHeader}>KM</Text>
          <Text style={styles.tableHeader}>Drops</Text>
        </View>
        {rows.map((row, i) => (
          <View key={row.date + row.driverName + i} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
            <Text style={[styles.tableCell, { flex: 1.2, fontSize: 10 }]}>{row.date}</Text>
            <Text style={[styles.tableCell, { flex: 1.5, fontSize: 11 }]} numberOfLines={1}>{row.driverName}</Text>
            <Text style={styles.tableCell}>{row.shiftDuration}h</Text>
            <Text style={[styles.tableCell, row.overtime > 0 && styles.tableCellOT]}>{row.overtime}h</Text>
            <Text style={styles.tableCell}>{Math.round(row.km)}</Text>
            <Text style={styles.tableCell}>{row.failedDrops}/{row.totalDrops}</Text>
          </View>
        ))}
        {rows.length === 0 && <Text style={styles.emptyText}>No day analysis data.</Text>}
      </View>
    </ScrollView>
  );
}

// ── Tab: Stage Timings ──
function TimingsTab({ data }) {
  const rows = data?.stageTimings || [];

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <SectionTitle title="Stage Timing Breakdown (Today)" />
      <View style={styles.card}>
        <View style={[styles.tableRow, styles.tableHeaderRow]}>
          <Text style={[styles.tableHeader, { flex: 1.5 }]}>Driver</Text>
          <Text style={styles.tableHeader}>S1→S2</Text>
          <Text style={styles.tableHeader}>S2→S3</Text>
          <Text style={styles.tableHeader}>S3→S4</Text>
        </View>
        {rows.map((row, i) => (
          <View key={row.driverName + i} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
            <Text style={[styles.tableCell, { flex: 1.5 }]} numberOfLines={1}>{row.driverName}</Text>
            <Text style={styles.tableCell}>{row.s1ToS2Mins != null ? minToHrMin(row.s1ToS2Mins) : '—'}</Text>
            <Text style={styles.tableCell}>{row.s2ToS3Mins != null ? minToHrMin(row.s2ToS3Mins) : '—'}</Text>
            <Text style={styles.tableCell}>{row.s3ToS4Mins != null ? minToHrMin(row.s3ToS4Mins) : '—'}</Text>
          </View>
        ))}
        {rows.length === 0 && <Text style={styles.emptyText}>No timing data for today.</Text>}
      </View>
    </ScrollView>
  );
}

// ── Tab: Helper Usage ──
function HelpersTab({ data }) {
  const rows = data?.helperUsage || [];

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <SectionTitle title="Helper Usage by Date" />
      {rows.map((row, i) => (
        <View key={row.date + i} style={[styles.card, { marginBottom: 10 }]}>
          <Text style={styles.dateGroupHeader}>{row.date} — {row.count} helper{row.count !== 1 ? 's' : ''}</Text>
          {row.helpers.map((h, j) => (
            <View key={h.helperName + j} style={styles.tableRow}>
              <Text style={[styles.tableCell, { flex: 1.5 }]}>{h.helperName || '(Unknown)'}</Text>
              <Text style={styles.tableCell}>{h.company || '—'}</Text>
            </View>
          ))}
        </View>
      ))}
      {rows.length === 0 && <Text style={styles.emptyText}>No helper data available.</Text>}
    </ScrollView>
  );
}

// ── Tab: Live Map (Firebase Realtime Database) ──
// Driver positions push via Firebase onValue listener — no polling needed.
// Routes fetched on-demand from Firebase when a driver is selected.
function MapTab({ liveOpsData }) {
  const [drivers,    setDrivers]    = useState([]);
  const [routes,     setRoutes]     = useState({});  // { driverId: [{latitude, longitude}] }
  const [selectedId, setSelectedId] = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const mapRef      = useRef(null);
  const colorMap    = useRef({});
  const routeCache  = useRef({});   // shiftRowId → points (avoid re-fetching)
  const fittedOnce  = useRef(false);

  function getColor(driverId) {
    if (!colorMap.current[driverId]) {
      const idx = Object.keys(colorMap.current).length;
      colorMap.current[driverId] = DRIVER_COLORS[idx % DRIVER_COLORS.length];
    }
    return colorMap.current[driverId];
  }

  // Subscribe to Firebase live positions — fires on every driver position update
  useEffect(() => {
    const unsubscribe = subscribeToLivePositions(async (firebaseDrivers) => {
      // Enrich with vehicle + stage from GAS live ops (join on driverName)
      const ops = liveOpsData || [];
      const enriched = firebaseDrivers.map(d => {
        const op = ops.find(o => o.driverName === d.driverName);
        return { ...d, vehicle: op?.vehicle || '', currentStage: op?.currentStage };
      });
      setDrivers(enriched);
      setLastUpdate(new Date().toLocaleTimeString('en-GB'));
      setLoading(false);

      // Fetch routes for any driver whose shiftRowId we haven't loaded yet
      const newRoutes = { ...routeCache.current };
      let routeChanged = false;
      await Promise.all(
        firebaseDrivers
          .filter(d => d.shiftRowId && !routeCache.current[d.shiftRowId])
          .map(async d => {
            const raw  = await fetchShiftRoute(d.shiftRowId);
            const mapped = raw.map(p => ({ latitude: p.lat, longitude: p.lng }));
            const pts  = rdpSimplify(filterRouteOutliers(mapped), 8);
            newRoutes[d.shiftRowId] = pts;
            routeCache.current[d.shiftRowId] = pts;
            routeChanged = true;
          })
      );
      if (routeChanged) {
        // Build driverId → points map for rendering
        const routeMap = {};
        firebaseDrivers.forEach(d => {
          if (d.shiftRowId && routeCache.current[d.shiftRowId]) {
            routeMap[d.driverId] = routeCache.current[d.shiftRowId];
          }
        });
        setRoutes(routeMap);
        if (!fittedOnce.current) {
          fittedOnce.current = true;
          setTimeout(() => fitMap(enriched, routeMap, null), 400);
        }
      }
    });
    return unsubscribe;
  }, [liveOpsData]);

  // Re-fetch route when a driver is selected (in case cache is stale)
  useEffect(() => {
    if (!selectedId) return;
    const driver = drivers.find(d => d.driverId === selectedId);
    if (!driver?.shiftRowId) return;
    fetchShiftRoute(driver.shiftRowId).then(raw => {
      const mapped = raw.map(p => ({ latitude: p.lat, longitude: p.lng }));
      const pts = rdpSimplify(filterRouteOutliers(mapped), 8);
      routeCache.current[driver.shiftRowId] = pts;
      setRoutes(prev => ({ ...prev, [driver.driverId]: pts }));
    }).catch(() => {});
  }, [selectedId]);

  function fitMap(driverList, routeMap, focusId) {
    if (!mapRef.current) return;
    const list = focusId ? driverList.filter(d => d.driverId === focusId) : driverList;
    const coords = [{ latitude: FACILITY.lat, longitude: FACILITY.lng }];
    list.forEach(d => {
      if (d.lat && d.lng) coords.push({ latitude: d.lat, longitude: d.lng });
      (routeMap[d.driverId] || []).forEach(p => coords.push(p));
    });
    try {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 80, right: 50, bottom: 80, left: 50 },
        animated: true,
      });
    } catch (_) {}
  }

  const displayDrivers = selectedId
    ? drivers.filter(d => d.driverId === selectedId)
    : drivers;

  return (
    <View style={{ flex: 1 }}>

      {/* ── Filter bar ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterBarContent}
      >
        <TouchableOpacity
          style={[styles.filterChip, !selectedId && styles.filterChipActive]}
          onPress={() => { setSelectedId(null); fitMap(drivers, routes, null); }}
        >
          <Text style={[styles.filterChipText, !selectedId && styles.filterChipTextActive]}>
            All Drivers
          </Text>
        </TouchableOpacity>

        {drivers.map(d => {
          const color    = getColor(d.driverId);
          const isActive = selectedId === d.driverId;
          return (
            <TouchableOpacity
              key={d.driverId}
              style={[
                styles.filterChip,
                { borderColor: color },
                isActive && { backgroundColor: color },
              ]}
              onPress={() => { setSelectedId(d.driverId); fitMap(drivers, routes, d.driverId); }}
            >
              <View style={[styles.filterDot, { backgroundColor: color }]} />
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                {d.driverName}{d.vehicle ? ` · ${d.vehicle}` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Map ── */}
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={{
          latitude:      FACILITY.lat,
          longitude:     FACILITY.lng,
          latitudeDelta:  0.15,
          longitudeDelta: 0.15,
        }}
      >
        {/* Facility home pin */}
        <Marker
          coordinate={{ latitude: FACILITY.lat, longitude: FACILITY.lng }}
          anchor={{ x: 0.5, y: 1 }}
        >
          <View style={styles.homeMarker}>
            <Text style={styles.homeMarkerIcon}>🏠</Text>
          </View>
          <Callout>
            <Text style={styles.calloutTitle}>RSA Facility</Text>
          </Callout>
        </Marker>

        {/* Route polyline per driver */}
        {displayDrivers.map(d => {
          const pts = routes[d.driverId] || [];
          if (pts.length < 2) return null;
          return (
            <Polyline
              key={`route-${d.driverId}`}
              coordinates={pts}
              strokeColor={getColor(d.driverId)}
              strokeWidth={4}
            />
          );
        })}

        {/* Live position marker per driver */}
        {displayDrivers.filter(d => d.lat != null && d.lng != null).map(d => {
          const color = getColor(d.driverId);
          return (
            <Marker
              key={`driver-${d.driverId}`}
              coordinate={{ latitude: d.lat, longitude: d.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View style={[styles.truckMarker, { backgroundColor: color }]}>
                <Text style={styles.truckIcon}>🚚</Text>
              </View>
              <Callout tooltip={false}>
                <View style={styles.calloutBox}>
                  <Text style={styles.calloutTitle}>{d.driverName}</Text>
                  {d.vehicle ? <Text style={styles.calloutRow}>🚗 {d.vehicle}</Text> : null}
                  <Text style={styles.calloutRow}>📍 {(d.km || 0).toFixed(1)} km</Text>
                  {d.currentStage != null
                    ? <Text style={styles.calloutRow}>📋 Stage {d.currentStage}: {STAGE_NAMES[d.currentStage] || ''}</Text>
                    : null}
                  <Text style={styles.calloutRow}>🕐 {d.ts ? d.ts.slice(11, 19) : ''}</Text>
                </View>
              </Callout>
            </Marker>
          );
        })}
      </MapView>

      {/* ── Bottom info bar ── */}
      <View style={styles.mapInfo}>
        <Text style={styles.mapInfoText}>
          {displayDrivers.length} driver{displayDrivers.length !== 1 ? 's' : ''} · Live
          {lastUpdate ? `  ·  ${lastUpdate}` : ''}
        </Text>
      </View>

      {loading && (
        <View style={styles.mapOverlay}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      )}
    </View>
  );
}

// ── Main Component ──
export default function AdminDashboardScreen() {
  const [activeTab, setActiveTab] = useState('live');
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,     setError]     = useState(null);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else           setLoading(true);
    setError(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const result = await fetchAdminDashboard(today);
      if (result.error) throw new Error(result.error);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading admin dashboard…</Text>
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

  return (
    <View style={styles.screen}>
      {/* Tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
      >
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Refresh button row */}
      <View style={styles.refreshRow}>
        <TouchableOpacity style={styles.refreshBtn} onPress={() => load(true)} disabled={refreshing}>
          {refreshing
            ? <ActivityIndicator size="small" color={COLORS.primary} />
            : <Text style={styles.refreshBtnText}>↻ Refresh</Text>}
        </TouchableOpacity>
      </View>

      {/* Tab content */}
      {activeTab === 'live'     && <LiveTab     data={data} onRefresh={() => load(true)} />}
      {activeTab === 'map'      && <MapTab liveOpsData={data?.liveOperations} />}
      {activeTab === 'failed'   && <FailedTab   data={data} />}
      {activeTab === 'trends'   && <TrendsTab   data={data} />}
      {activeTab === 'vehicles' && <VehiclesTab data={data} />}
      {activeTab === 'days'     && <DaysTab     data={data} />}
      {activeTab === 'timings'  && <TimingsTab  data={data} />}
      {activeTab === 'helpers'  && <HelpersTab  data={data} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.lightGray },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

  loadingText: { marginTop: 12, color: COLORS.textMid, fontSize: 15 },
  errorText:   { color: COLORS.error, fontSize: 15, textAlign: 'center', marginBottom: 16 },
  retryBtn: { backgroundColor: COLORS.primary, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  retryBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },

  // Tab bar
  tabBar: { backgroundColor: COLORS.white, maxHeight: 52, flexGrow: 0 },
  tabBarContent: { paddingHorizontal: 8, paddingVertical: 8, gap: 6 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.lightGray,
  },
  tabActive:     { backgroundColor: COLORS.primary },
  tabText:       { fontSize: 12, fontWeight: '600', color: COLORS.textMid },
  tabTextActive: { color: COLORS.white },

  refreshRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderGray,
  },
  refreshBtn: { paddingHorizontal: 12, paddingVertical: 4 },
  refreshBtnText: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },

  tabContent: { padding: 16, paddingBottom: 40, gap: 10 },

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
    padding: 12,
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

  tableHeaderRow: { backgroundColor: COLORS.lightGray, borderRadius: 4, paddingHorizontal: 4 },
  tableRow: { flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 2, borderBottomWidth: 0.5, borderBottomColor: COLORS.borderGray },
  tableRowAlt: { backgroundColor: '#FAFAFA' },
  tableHeader: { flex: 1, fontSize: 10, fontWeight: '800', color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: 0.4 },
  tableCell:   { flex: 1, fontSize: 11, color: COLORS.textDark },
  tableCellOT: { color: COLORS.warning, fontWeight: '700' },

  errorCell: { color: COLORS.error, fontSize: 11 },
  emptyText: { textAlign: 'center', color: COLORS.textLight, fontSize: 13, paddingVertical: 16 },

  expandHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  expandDate:   { flex: 1, fontSize: 13, fontWeight: '700', color: COLORS.textDark },
  expandStats:  { fontSize: 12, color: COLORS.error, fontWeight: '600', marginRight: 8 },
  expandArrow:  { fontSize: 12, color: COLORS.textLight },
  expandBody:   { marginTop: 8, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: COLORS.borderGray },

  dateGroupHeader: { fontSize: 13, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 },

  // Map filter bar
  filterBar: { backgroundColor: COLORS.white, maxHeight: 48, flexGrow: 0, borderBottomWidth: 1, borderBottomColor: COLORS.borderGray },
  filterBarContent: { paddingHorizontal: 10, paddingVertical: 8, gap: 6, alignItems: 'center' },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.borderGray,
    backgroundColor: COLORS.white,
    gap: 5,
  },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterChipText: { fontSize: 12, fontWeight: '600', color: COLORS.textMid },
  filterChipTextActive: { color: COLORS.white },
  filterDot: { width: 8, height: 8, borderRadius: 4 },

  mapOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 10, backgroundColor: 'rgba(255,255,255,0.6)' },
  mapInfo: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.borderGray },
  mapInfoText: { flex: 1, fontSize: 12, color: COLORS.textMid },
  mapRefreshBtn: { backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  mapRefreshBtnText: { color: COLORS.white, fontSize: 12, fontWeight: '700' },

  // Custom map markers
  truckMarker: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3, shadowOffset: { width: 0, height: 2 } },
  truckIcon:   { fontSize: 22 },
  homeMarker:  { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  homeMarkerIcon: { fontSize: 32 },

  // Callout popup
  calloutBox:  { minWidth: 190, maxWidth: 260, padding: 10 },
  calloutTitle: { fontWeight: '700', fontSize: 14, color: '#1a1a1a', marginBottom: 5 },
  calloutRow:  { fontSize: 12, color: '#555', marginTop: 3 },
});

// =============================================================================
// RSA Driver Pilot — GPS Service
// Handles:
//   1. One-time geofence check for arrival (within 200m of facility)
//   2. Background GPS tracking during shift (km accumulation + facility exit)
//   3. Auto facility departure detection at 500m
//   4. Stopping tracking and returning totals at shift end
//
// GPS route points are written directly to Firebase Realtime Database via
// writeGpsPoint() in src/services/firebase.js. The Firebase native SDK queues
// writes in on-device SQLite storage and syncs them automatically on reconnect,
// even after the app has been killed — no manual buffering needed here.
// =============================================================================
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FACILITY } from '../config';
import { distanceMetres } from '../utils/haversine';
import { writeGpsPoint } from './firebase';
import { updateFacilityLeft } from './api';

// AsyncStorage keys (local device state — not synced to any backend)
const KEY_LAST_POS         = 'gps_last_position';      // { lat, lng, ts }
const KEY_LAST_ROUTE_POS   = 'gps_last_route_pos';     // { lat, lng } — last point pushed to Firebase route
const KEY_TOTAL_KM         = 'gps_total_km';           // accumulated km (string)
const KEY_FACILITY_LEFT    = 'gps_facility_left_time'; // ISO string
const KEY_SHIFT_ACTIVE     = 'gps_shift_active';       // 'true' | 'false'
const KEY_GPS_USER         = 'gps_tracking_user';      // JSON { userId, userName }
const KEY_SHIFT_ROW_ID     = 'gps_shift_row_id';       // GAS attendance row ID
const KEY_DEPARTURE_ARMED  = 'gps_departure_armed';    // 'true' after Stage 2 submit
const KEY_LAST_BG_TICK     = 'gps_last_bg_tick';       // timestamp of last background task invocation
const KEY_ROUTE_POINT_COUNT = 'gps_route_point_count'; // number of route points appended this shift

export const BACKGROUND_LOCATION_TASK = 'RSA_BACKGROUND_LOCATION';

// =============================================================================
// BACKGROUND TASK
// OS delivers location updates here even when app is minimised.
// Each qualifying point is written to Firebase (SDK handles offline queuing)
// and accumulated locally for the km counter.
// =============================================================================
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  try {
    if (error) { console.warn('[GPS Task] Error:', error.message); return; }
    if (!data || !data.locations || data.locations.length === 0) return;

    // --- Single batched read of all needed state ---
    const keys = [
      KEY_SHIFT_ACTIVE, KEY_LAST_POS, KEY_TOTAL_KM, KEY_GPS_USER,
      KEY_SHIFT_ROW_ID, KEY_LAST_ROUTE_POS, KEY_DEPARTURE_ARMED, KEY_FACILITY_LEFT,
      KEY_ROUTE_POINT_COUNT,
    ];
    const pairs = await AsyncStorage.multiGet(keys);
    const state = {};
    for (const [k, v] of pairs) state[k] = v;

    if (state[KEY_SHIFT_ACTIVE] !== 'true') return;

    // Stamp every background task invocation for health monitoring
    await AsyncStorage.setItem(KEY_LAST_BG_TICK, String(Date.now()));

    let totalKm       = state[KEY_TOTAL_KM] ? parseFloat(state[KEY_TOTAL_KM]) : 0;
    let lastPos       = state[KEY_LAST_POS] ? JSON.parse(state[KEY_LAST_POS]) : null;
    let lastRoutePos  = state[KEY_LAST_ROUTE_POS] ? JSON.parse(state[KEY_LAST_ROUTE_POS]) : null;
    const user        = state[KEY_GPS_USER] ? JSON.parse(state[KEY_GPS_USER]) : null;
    const shiftRowId  = state[KEY_SHIFT_ROW_ID] || '';
    const departArmed = state[KEY_DEPARTURE_ARMED] === 'true';
    let facilityLeft  = state[KEY_FACILITY_LEFT] || '';
    let routePointCount = state[KEY_ROUTE_POINT_COUNT] ? parseInt(state[KEY_ROUTE_POINT_COUNT], 10) : 0;

    // Track which keys need writing back
    const writes = {};

    for (const location of data.locations) {
      const newLat   = location.coords.latitude;
      const newLng   = location.coords.longitude;
      const now      = new Date().toISOString();
      const speed    = location.coords.speed;
      const accuracy = location.coords.accuracy;

      // Reject cell-tower-only fixes (>50m accuracy)
      if (accuracy !== null && accuracy > 50) continue;

      // --- KM accumulation + movement detection ---
      let isMoving = false;
      let metresFromLast = 0;
      if (lastPos) {
        metresFromLast = distanceMetres(lastPos.lat, lastPos.lng, newLat, newLng);

        // Reject teleport jumps (GPS cold-start / signal loss)
        const timeDeltaMs     = lastPos.ts ? (new Date(now) - new Date(lastPos.ts)) : 0;
        const impliedSpeedKmh = timeDeltaMs > 0 ? (metresFromLast / (timeDeltaMs / 3600000)) : 0;
        if (impliedSpeedKmh > 200) continue;

        const speedKnown = speed !== null && speed >= 0;
        isMoving         = speedKnown ? speed >= 0.5 : metresFromLast > 15;

        if (isMoving && metresFromLast > 15) {
          totalKm += metresFromLast / 1000;
          writes[KEY_TOTAL_KM] = String(totalKm);
        }
        if (isMoving) {
          lastPos = { lat: newLat, lng: newLng, ts: now };
          writes[KEY_LAST_POS] = JSON.stringify(lastPos);
        }
      } else {
        lastPos = { lat: newLat, lng: newLng, ts: now };
        writes[KEY_LAST_POS] = JSON.stringify(lastPos);
      }

      // --- Write GPS point to Firebase RTDB ---
      // Live position updates every cycle; route point only when moving >10m from last route point.
      if (user) {
        let appendRoute = false;
        if (isMoving) {
          if (!lastRoutePos) {
            appendRoute = true;
          } else {
            appendRoute = distanceMetres(lastRoutePos.lat, lastRoutePos.lng, newLat, newLng) > 10;
          }
        }
        // Cap route points at 10,000 to prevent unbounded growth on stuck/forgotten shifts
        if (appendRoute && routePointCount >= 10000) {
          appendRoute = false;
        }
        if (appendRoute) {
          lastRoutePos = { lat: newLat, lng: newLng };
          writes[KEY_LAST_ROUTE_POS] = JSON.stringify(lastRoutePos);
          routePointCount += 1;
          writes[KEY_ROUTE_POINT_COUNT] = String(routePointCount);
        }

        writeGpsPoint({
          driverId:    user.userId,
          driverName:  user.userName,
          shiftRowId,
          lat:         newLat,
          lng:         newLng,
          km:          totalKm,
          accuracy:    accuracy || 0,
          appendRoute,
        });
      }

      // --- Auto facility departure detection (500m) ---
      // Only armed AFTER Stage 2 is submitted
      if (departArmed && !facilityLeft) {
        const distFromFacility = distanceMetres(FACILITY.lat, FACILITY.lng, newLat, newLng);
        if (distFromFacility > (FACILITY.departureMetres || 500)) {
          facilityLeft = now;
          writes[KEY_FACILITY_LEFT] = now;
          console.log('[GPS Task] Facility left at:', now, '— dist:', Math.round(distFromFacility), 'm');
          if (shiftRowId) updateFacilityLeft(shiftRowId, now).catch(() => {});
        }
      }
    }

    // --- Single batched write of all changed state ---
    const writeEntries = Object.entries(writes);
    if (writeEntries.length > 0) {
      await AsyncStorage.multiSet(writeEntries);
    }
  } catch (taskErr) {
    console.warn('[GPS Task] Unhandled error:', taskErr.message);
  }
});

// =============================================================================
// REQUEST PERMISSIONS
// =============================================================================
export async function requestLocationPermissions() {
  try {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== 'granted') return { granted: false, reason: 'foreground' };
    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== 'granted') return { granted: false, reason: 'background' };
    return { granted: true };
  } catch (err) {
    return { granted: false, reason: 'error', error: err.message };
  }
}

// =============================================================================
// GEOFENCE CHECK — arrival verification (200m)
// =============================================================================
export async function checkFacilityGeofence() {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      const req = await Location.requestForegroundPermissionsAsync();
      if (req.status !== 'granted') {
        return { withinGeofence: false, distanceMetres: null, error: 'Location permission denied.' };
      }
    }
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      timeout:  15000,
    });
    const dist = distanceMetres(
      FACILITY.lat, FACILITY.lng,
      position.coords.latitude, position.coords.longitude
    );
    return {
      withinGeofence: dist <= FACILITY.geofenceMetres,
      distanceMetres: Math.round(dist),
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };
  } catch (err) {
    return { withinGeofence: false, distanceMetres: null, error: err.message };
  }
}

// =============================================================================
// START BACKGROUND GPS TRACKING
// =============================================================================
export async function startShiftTracking(initialLat, initialLng, userId, userName, rowId) {
  try {
    // IMPORTANT: stop old task FIRST to prevent race condition where the old task
    // reads the new KEY_SHIFT_ACTIVE='true' and processes stale location data
    // (which would carry over old km and facility left time into the new shift).
    const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
    if (isRunning) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => {});
    }

    // Now safe to reset all tracking state for the new shift
    await AsyncStorage.multiSet([
      [KEY_LAST_POS,        JSON.stringify({ lat: initialLat || 0, lng: initialLng || 0, ts: new Date().toISOString() })],
      [KEY_LAST_ROUTE_POS,  ''],
      [KEY_TOTAL_KM,        '0'],
      [KEY_FACILITY_LEFT,   ''],
      [KEY_SHIFT_ACTIVE,    'true'],
      [KEY_GPS_USER,        JSON.stringify({ userId: userId || '', userName: userName || '' })],
      [KEY_SHIFT_ROW_ID,    String(rowId || '')],
      [KEY_DEPARTURE_ARMED, 'false'],  // armed only after Stage 2 submit
      [KEY_LAST_BG_TICK,    String(Date.now())],
      [KEY_ROUTE_POINT_COUNT, '0'],
    ]);

    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy:          Location.Accuracy.BestForNavigation,
      distanceInterval:  5,        // minimum 5m between updates (captures turns better)
      timeInterval:      10000,    // every 10s (was 5s — less aggressive, more reliable in background)
      deferredUpdatesInterval: 0,  // prevent OS from batching/deferring updates
      deferredUpdatesDistance: 0,  // prevent OS from batching/deferring updates
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.AutomotiveNavigation, // hint to OS this is driving
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'RSA Driver Pilot',
        notificationBody:  'Shift in progress — location tracking active.',
        notificationColor: '#0D47A1',
      },
    });

    console.log('[GPS] Tracking started for', userId);
  } catch (err) {
    console.warn('[GPS] Failed to start tracking:', err.message);
  }
}

// =============================================================================
// STOP TRACKING — called when Stage 4 is submitted
// Returns: { totalKm: number, facilityLeftTime: string|null }
// =============================================================================
export async function stopShiftTracking(userId) {
  try {
    await AsyncStorage.setItem(KEY_SHIFT_ACTIVE, 'false');

    const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
    if (isRunning) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      console.log('[GPS] Tracking stopped');
    }

    // Clear the driver's live pin from Firebase map
    if (userId) {
      try {
        const { clearLivePosition } = require('./firebase');
        clearLivePosition(userId);
      } catch (_) {}
    }

    const totalKmStr      = await AsyncStorage.getItem(KEY_TOTAL_KM);
    const facilityLeftRaw = await AsyncStorage.getItem(KEY_FACILITY_LEFT);
    const shiftRowId      = await AsyncStorage.getItem(KEY_SHIFT_ROW_ID);
    const totalKm         = totalKmStr ? Math.round(parseFloat(totalKmStr) * 100) / 100 : 0;
    const facilityLeftTime = (facilityLeftRaw && facilityLeftRaw !== '') ? facilityLeftRaw : null;

    await AsyncStorage.multiRemove([
      KEY_LAST_POS, KEY_LAST_ROUTE_POS, KEY_TOTAL_KM, KEY_FACILITY_LEFT,
      KEY_SHIFT_ACTIVE, KEY_GPS_USER, KEY_SHIFT_ROW_ID, KEY_DEPARTURE_ARMED,
      KEY_LAST_BG_TICK, KEY_ROUTE_POINT_COUNT,
    ]);

    // Schedule route data deletion from Firebase after 5 minutes (gives admin map time to display)
    if (shiftRowId) {
      setTimeout(() => {
        try {
          const { deleteShiftRoute } = require('./firebase');
          deleteShiftRoute(shiftRowId);
        } catch (_) {}
      }, 5 * 60 * 1000);
    }

    return { totalKm, facilityLeftTime };
  } catch (err) {
    console.warn('[GPS] Error stopping:', err.message);
    return { totalKm: 0, facilityLeftTime: null };
  }
}

// =============================================================================
// GET LIVE GPS STATS — reads local AsyncStorage (instant, no network)
// =============================================================================
export async function getLiveGpsStats() {
  try {
    const totalKmStr      = await AsyncStorage.getItem(KEY_TOTAL_KM);
    const facilityLeftRaw = await AsyncStorage.getItem(KEY_FACILITY_LEFT);
    const lastPosStr      = await AsyncStorage.getItem(KEY_LAST_POS);
    return {
      totalKm:          totalKmStr ? parseFloat(totalKmStr) : 0,
      facilityLeftTime: (facilityLeftRaw && facilityLeftRaw !== '') ? facilityLeftRaw : null,
      lastPosition:     lastPosStr ? JSON.parse(lastPosStr) : null,
    };
  } catch (_) {
    return { totalKm: 0, facilityLeftTime: null, lastPosition: null };
  }
}

// =============================================================================
// GET BACKGROUND TASK HEALTH — detects if OS killed the background task
// =============================================================================
export async function getBackgroundTaskHealth() {
  try {
    const [active, tick] = await AsyncStorage.multiGet([KEY_SHIFT_ACTIVE, KEY_LAST_BG_TICK]);
    if (active[1] !== 'true') return { status: 'inactive', gapSeconds: null };
    if (!tick[1]) return { status: 'no_data', gapSeconds: null };
    const gapSeconds = Math.round((Date.now() - parseInt(tick[1], 10)) / 1000);
    return { status: gapSeconds > 90 ? 'stalled' : 'healthy', gapSeconds };
  } catch (_) {
    return { status: 'no_data', gapSeconds: null };
  }
}

// =============================================================================
// GET AUTO DEPARTURE TIME — Stage 2 cross-validation
// =============================================================================
export async function getAutoFacilityLeftTime() {
  try {
    const raw = await AsyncStorage.getItem(KEY_FACILITY_LEFT);
    return (raw && raw !== '') ? raw : null;
  } catch (_) {
    return null;
  }
}

// =============================================================================
// ARM DEPARTURE DETECTION — called after Stage 2 submit
// Enables the 500m facility-left check in the background task.
// Must be called only after the driver has confirmed departure from the facility.
// =============================================================================
export async function setDepartureArmed() {
  try {
    await AsyncStorage.setItem(KEY_DEPARTURE_ARMED, 'true');
  } catch (_) {}
}

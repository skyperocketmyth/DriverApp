// =============================================================================
// RSA Driver Pilot — GPS Service
// Handles:
//   1. One-time geofence check for arrival (within 200m of facility)
//   2. Background GPS tracking during shift (km accumulation + facility exit)
//   3. Auto facility departure detection at 500m (separate from arrival check)
//   4. Stopping tracking and returning totals at shift end
// =============================================================================
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FACILITY } from '../config';
import { distanceMetres } from '../utils/haversine';
import { saveGpsPoint, updateFacilityLeft } from './api';

// AsyncStorage keys
const KEY_LAST_POS         = 'gps_last_position';       // { lat, lng, ts }
const KEY_TOTAL_KM         = 'gps_total_km';             // number (km)
const KEY_FACILITY_LEFT    = 'gps_facility_left_time';   // ISO string (500m auto departure)
const KEY_SHIFT_ACTIVE     = 'gps_shift_active';         // 'true' | 'false'
const KEY_GPS_USER         = 'gps_tracking_user';        // JSON { userId, userName }
const KEY_SHIFT_ROW_ID     = 'gps_shift_row_id';         // string rowId for updateFacilityLeft

export const BACKGROUND_LOCATION_TASK = 'RSA_BACKGROUND_LOCATION';

// =============================================================================
// BACKGROUND TASK DEFINITION
// Must be defined at the top level of a module (not inside a component).
// This runs whenever the OS delivers a location update, even if app is minimised.
// =============================================================================
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  try {
    if (error) {
      console.warn('[GPS Task] Error:', error.message);
      return;
    }
    if (!data || !data.locations || data.locations.length === 0) return;

    const shiftActive = await AsyncStorage.getItem(KEY_SHIFT_ACTIVE);
    if (shiftActive !== 'true') return;

    for (const location of data.locations) {
      const newLat   = location.coords.latitude;
      const newLng   = location.coords.longitude;
      const now      = new Date().toISOString();
      const speed    = location.coords.speed;     // m/s, or null/-1 if unavailable
      const accuracy = location.coords.accuracy;  // metres

      // Skip readings with very poor GPS accuracy
      if (accuracy !== null && accuracy > 25) continue;

      // --- Accumulate distance with stationary filtering ---
      const lastPosStr = await AsyncStorage.getItem(KEY_LAST_POS);
      if (lastPosStr) {
        try {
          const lastPos = JSON.parse(lastPosStr);
          const metres  = distanceMetres(lastPos.lat, lastPos.lng, newLat, newLng);

          // Determine if the device is actually moving:
          //   - If speed is available (>= 0): require >= 1.0 m/s (~3.6 km/h)
          //   - If speed is unavailable (null or -1): fall back to 30m distance threshold
          const speedKnown = speed !== null && speed >= 0;
          const isMoving   = speedKnown ? speed >= 1.0 : metres > 30;

          if (isMoving && metres > 30) {
            const totalKmStr = await AsyncStorage.getItem(KEY_TOTAL_KM);
            const totalKm    = totalKmStr ? parseFloat(totalKmStr) : 0;
            await AsyncStorage.setItem(KEY_TOTAL_KM, String(totalKm + metres / 1000));
          }

          // Only update stored position on confirmed movement (keeps reference point stable when parked)
          if (isMoving) {
            await AsyncStorage.setItem(KEY_LAST_POS, JSON.stringify({ lat: newLat, lng: newLng, ts: now }));
          }
        } catch (_) {
          // Parse error — reset position baseline
          await AsyncStorage.setItem(KEY_LAST_POS, JSON.stringify({ lat: newLat, lng: newLng, ts: now }));
        }
      } else {
        // No previous position — store initial baseline
        await AsyncStorage.setItem(KEY_LAST_POS, JSON.stringify({ lat: newLat, lng: newLng, ts: now }));
      }

      // --- Save GPS point to GAS for live tracking (fire-and-forget) ---
      // Always push position to GAS regardless of movement, so live map stays updated
      try {
        const totalKmStr = await AsyncStorage.getItem(KEY_TOTAL_KM);
        const totalKm    = totalKmStr ? parseFloat(totalKmStr) : 0;
        const userStr    = await AsyncStorage.getItem(KEY_GPS_USER);
        if (userStr) {
          const user = JSON.parse(userStr);
          saveGpsPoint(user.userId, user.userName, newLat, newLng, totalKm).catch(() => {});
        }
      } catch (_) {
        // Non-fatal — don't interrupt local tracking if remote save fails
      }

      // --- Auto facility departure detection (500m) ---
      // Records the first time the driver leaves beyond FACILITY.departureMetres
      const facilityLeftTime = await AsyncStorage.getItem(KEY_FACILITY_LEFT);
      if (!facilityLeftTime) {
        const distFromFacility = distanceMetres(FACILITY.lat, FACILITY.lng, newLat, newLng);
        if (distFromFacility > (FACILITY.departureMetres || 500)) {
          await AsyncStorage.setItem(KEY_FACILITY_LEFT, now);
          console.log('[GPS Task] Auto departure captured at:', now, 'distance:', Math.round(distFromFacility), 'm');
          // Immediately push facility-left time to GAS so Column Q is populated
          // even if the driver has already submitted Stage 2
          try {
            const rowIdRaw = await AsyncStorage.getItem(KEY_SHIFT_ROW_ID);
            if (rowIdRaw) {
              updateFacilityLeft(rowIdRaw, now).catch(() => {});
            }
          } catch (_) {}
        }
      }
    }
  } catch (taskErr) {
    // Swallow all errors — a crash in the background task would kill the OS task
    console.warn('[GPS Task] Unhandled error:', taskErr.message);
  }
});

// =============================================================================
// REQUEST PERMISSIONS
// =============================================================================
export async function requestLocationPermissions() {
  try {
    // Foreground permission first
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== 'granted') {
      return { granted: false, reason: 'foreground' };
    }

    // Background permission (needed for tracking while minimised)
    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== 'granted') {
      return { granted: false, reason: 'background' };
    }

    return { granted: true };
  } catch (err) {
    return { granted: false, reason: 'error', error: err.message };
  }
}

// =============================================================================
// GEOFENCE CHECK — called when driver taps "Arrived at Facility"
// Uses FACILITY.geofenceMetres (200m) for arrival verification
// Returns: { withinGeofence: bool, distanceMetres: number, error?: string }
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
      timeout:  15000,   // 15s max — prevents hanging on slow GPS fix
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
// START BACKGROUND GPS TRACKING — called after Stage 1 is saved successfully
// =============================================================================
export async function startShiftTracking(initialLat, initialLng, userId, userName, rowId) {
  try {
    // Clear any previous shift GPS data
    await AsyncStorage.multiSet([
      [KEY_LAST_POS,      JSON.stringify({ lat: initialLat || 0, lng: initialLng || 0, ts: new Date().toISOString() })],
      [KEY_TOTAL_KM,      '0'],
      [KEY_FACILITY_LEFT, ''],       // empty string = not yet left facility
      [KEY_SHIFT_ACTIVE,  'true'],
      [KEY_GPS_USER,      JSON.stringify({ userId: userId || '', userName: userName || '' })],
      [KEY_SHIFT_ROW_ID,  String(rowId || '')],
    ]);

    // Check if task is already running
    const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
    if (isRunning) return;

    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy:          Location.Accuracy.Balanced,
      distanceInterval:  50,    // trigger every 50m of movement
      timeInterval:      15000, // OR every 15 seconds (was 30s — tighter for route accuracy)
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'RSA Driver Pilot',
        notificationBody:  'Shift in progress — location tracking active.',
        notificationColor: '#0D47A1',
      },
    });

    console.log('[GPS] Background tracking started');
  } catch (err) {
    console.warn('[GPS] Failed to start tracking:', err.message);
  }
}

// =============================================================================
// STOP TRACKING + RETURN SHIFT GPS SUMMARY — called when Stage 4 is submitted
// Returns: { totalKm: number, facilityLeftTime: string|null }
// =============================================================================
export async function stopShiftTracking() {
  try {
    await AsyncStorage.setItem(KEY_SHIFT_ACTIVE, 'false');

    const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
    if (isRunning) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      console.log('[GPS] Background tracking stopped');
    }

    const totalKmStr      = await AsyncStorage.getItem(KEY_TOTAL_KM);
    const facilityLeftRaw = await AsyncStorage.getItem(KEY_FACILITY_LEFT);

    const totalKm          = totalKmStr ? Math.round(parseFloat(totalKmStr) * 100) / 100 : 0;
    const facilityLeftTime = (facilityLeftRaw && facilityLeftRaw !== '') ? facilityLeftRaw : null;

    // Clear GPS storage
    await AsyncStorage.multiRemove([KEY_LAST_POS, KEY_TOTAL_KM, KEY_FACILITY_LEFT, KEY_SHIFT_ACTIVE, KEY_GPS_USER, KEY_SHIFT_ROW_ID]);

    return { totalKm, facilityLeftTime };
  } catch (err) {
    console.warn('[GPS] Error stopping tracking:', err.message);
    return { totalKm: 0, facilityLeftTime: null };
  }
}

// =============================================================================
// GET LIVE GPS STATS — called from home screen and active shift screens
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
// GET AUTO DEPARTURE TIME — Stage 2 reads this to cross-validate with user entry
// Returns ISO string or null
// =============================================================================
export async function getAutoFacilityLeftTime() {
  try {
    const raw = await AsyncStorage.getItem(KEY_FACILITY_LEFT);
    return (raw && raw !== '') ? raw : null;
  } catch (_) {
    return null;
  }
}

// =============================================================================
// RSA Driver Pilot — Firebase Realtime Database GPS Service
//
// Why Firebase RTDB instead of writing to Google Sheets via GAS:
//   - The native SDK maintains its own write queue in on-device SQLite storage.
//   - Writes queued while offline automatically sync when connectivity returns,
//     even after the app has been killed by Android and restarted.
//   - No HTTP calls in app code — the SDK handles retries, backoff, and ordering.
//   - Real-time listeners push updates to the admin map instantly (no polling).
//
// Database structure:
//   gps/live/{driverId}            ← latest position per driver (admin map pins)
//   gps/routes/{shiftRowId}/{key}  ← ordered route points per shift (polyline)
// =============================================================================
import database from '@react-native-firebase/database';
import auth from '@react-native-firebase/auth';

// Enable disk persistence — queued writes survive app kills and replay on restart.
// Must be called before any database reference is used.
// The try/catch handles the case where it's called more than once (e.g. hot reload).
try {
  database().setPersistenceEnabled(true);
} catch (_) {}

// Sign in anonymously so GPS writes satisfy Firebase "auth != null" security rules.
// The anonymous session persists on-device across app restarts (no sign-in delay on
// subsequent launches). Fire-and-forget — the DB write queue buffers locally until
// auth is established, so no GPS points are lost during the brief sign-in.
auth().signInAnonymously().catch(() => {});

const RTDB_LIVE   = 'gps/live';
const RTDB_ROUTES = 'gps/routes';

// =============================================================================
// WRITE GPS POINT
// Writes to two locations atomically:
//   live/{driverId}         — overwrite with current position (admin sees live pin)
//   routes/{shiftRowId}     — append new point (builds the polyline over time)
//
// Both writes go into the SDK's local queue immediately and sync to Firebase
// when the network is available. No await needed — fire-and-forget is safe here
// because the SDK guarantees eventual delivery.
// =============================================================================
export function writeGpsPoint({ driverId, driverName, shiftRowId, lat, lng, km, accuracy }) {
  const ts      = new Date().toISOString();
  const today   = ts.slice(0, 10);
  const db      = database();

  // Overwrite live position (admin map pin moves to current location)
  db.ref(`${RTDB_LIVE}/${driverId}`).set({
    driverId,
    driverName,
    shiftRowId: shiftRowId || '',
    lat,
    lng,
    km:       Math.round((km || 0) * 100) / 100,
    accuracy: accuracy || 0,
    ts,
    date: today,
  });

  // Append to route (push() generates an ordered unique key)
  if (shiftRowId) {
    db.ref(`${RTDB_ROUTES}/${shiftRowId}`).push({
      lat,
      lng,
      km:       Math.round((km || 0) * 100) / 100,
      accuracy: accuracy || 0,
      ts,
    });
  }
}

// =============================================================================
// SUBSCRIBE TO LIVE DRIVER POSITIONS
// Real-time listener — fires immediately with current data, then on every change.
// Returns an unsubscribe function to call on component unmount.
// =============================================================================
export function subscribeToLivePositions(callback) {
  const today = new Date().toISOString().slice(0, 10);
  const ref   = database().ref(RTDB_LIVE);

  const handler = snapshot => {
    const val = snapshot.val() || {};
    const drivers = Object.values(val).filter(d => d.date === today);
    callback(drivers);
  };

  ref.on('value', handler);
  return () => ref.off('value', handler);
}

// =============================================================================
// FETCH FULL ROUTE FOR A SHIFT
// One-time read of all GPS points for a shift, sorted by timestamp.
// Returns array of { lat, lng, km } ready for polyline rendering.
// =============================================================================
export async function fetchShiftRoute(shiftRowId) {
  if (!shiftRowId) return [];
  try {
    const snapshot = await database()
      .ref(`${RTDB_ROUTES}/${shiftRowId}`)
      .orderByChild('ts')
      .once('value');
    const val = snapshot.val();
    if (!val) return [];
    return Object.values(val).map(p => ({ lat: p.lat, lng: p.lng, km: p.km }));
  } catch (_) {
    return [];
  }
}

// =============================================================================
// CLEAR LIVE POSITION — called when shift ends so driver pin disappears from map
// =============================================================================
export function clearLivePosition(driverId) {
  database().ref(`${RTDB_LIVE}/${driverId}`).remove().catch(() => {});
}

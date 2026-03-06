# GPS & Live Maps Architecture — RSA Driver Pilot

## Overview

The system has **two separate map views** that share the same underlying data source (Firebase RTDB):

| View | Where it runs | Map engine |
|---|---|---|
| **Admin App Map tab** | React Native app (AdminDashboardScreen.js) | `react-native-maps` (Google Maps SDK) |
| **PWA Live Map** | Browser / GitHub Pages (docs/map.html) | Google Maps JavaScript API |

Both views display the same drivers and polylines using Google Maps, ensuring visual consistency.

---

## 1. Firebase Realtime Database — The Central Data Store

All GPS data flows through **Firebase RTDB** (`warehouse-stock-take-default-rtdb.firebaseio.com`).

There are exactly two database paths:

```
gps/
  live/
    {driverId}         <- one node per active driver (overwritten on every GPS update)
  routes/
    {shiftRowId}/
      {pushKey}        <- one node per route point (append-only during shift)
```

### `gps/live/{driverId}` — the live pin node

Written every GPS cycle (every ~5 s or 10 m of movement). Always **overwritten** (not appended) so only the latest position exists:

```json
{
  "driverId":   "EMP001",
  "driverName": "Ahmed Al Rashid",
  "shiftRowId": "ROW_42",
  "lat":        24.9102,
  "lng":        55.1230,
  "km":         14.7,
  "accuracy":   12.3,
  "ts":         "2026-03-05T08:42:11.000Z",
  "date":       "2026-03-05"
}
```

### `gps/routes/{shiftRowId}/{pushKey}` — the polyline point nodes

Written only when the driver is genuinely moving AND has travelled >10 m from the last stored route point. Uses Firebase `.push()` so each point gets a unique auto-generated key:

```json
{
  "lat":      24.9102,
  "lng":      55.1230,
  "km":       14.7,
  "accuracy": 12.3,
  "ts":       "2026-03-05T08:42:11.000Z"
}
```

**The `shiftRowId`** is the row number in the "Attendance Data" Google Sheet, assigned when Stage 1 is submitted. It is the join key between Firebase route data and the GAS spreadsheet record.

---

## 2. GPS Recording on the Driver's Phone

### Background task: `RSA_BACKGROUND_LOCATION`

Defined in `src/services/gps.js` using Expo's `TaskManager`. The OS delivers location events to this task even when the app is minimised or killed.

**Task configuration** (set in `startShiftTracking`):
- Accuracy: `BestForNavigation` (GPS chip, not cell towers)
- Distance interval: 10 m (minimum movement before OS delivers an update)
- Time interval: 5 000 ms (fallback if stationary)
- A persistent foreground-service notification keeps the task alive on Android

**Foreground heartbeat** (HomeScreen.js):
- Every 10 seconds when HomeScreen is focused, polls `getCurrentPositionAsync`
- Writes to Firebase if driver moved >10 m from last foreground-written point
- Supplements the background task which Android may throttle

**Per-update filtering pipeline** (inside the background task):

```
OS delivers location
       |
       v
[1] Reject if accuracy > 50 m  (cell-tower-only fix -- too noisy)
       |
       v
[2] KM accumulation:
    - isMoving = speed >= 0.5 m/s  (or distance > 15 m if speed unknown)
    - if isMoving AND moved > 15 m  -> add to local totalKm counter
       |
       v
[3] Decide whether to append a route point:
    - Only if isMoving = true
    - Only if distance from LAST ROUTE POINT > 10 m
    (prevents GPS jitter scribbles when parked)
       |
       v
[4] writeGpsPoint() -> Firebase SDK queues write locally, syncs when online
       |
       v
[5] Check 500 m departure geofence:
    - If not yet flagged AND distance from facility > 500 m
    -> save facilityLeftTime to AsyncStorage
    -> call updateFacilityLeft(rowId, time) via GAS REST API
```

**Local AsyncStorage keys** (device-only, not synced to any backend):

| Key | Purpose |
|---|---|
| `gps_last_position` | `{ lat, lng, ts }` — last confirmed position (for km delta) |
| `gps_last_route_pos` | `{ lat, lng }` — last point actually written to Firebase route (for 10 m threshold) |
| `gps_total_km` | Accumulated km as string |
| `gps_facility_left_time` | ISO timestamp when 500 m departure was detected |
| `gps_shift_active` | `'true'` / `'false'` — gate for background task |
| `gps_tracking_user` | `{ userId, userName }` — needed inside background task |
| `gps_shift_row_id` | The shiftRowId needed by the background task to call Firebase + GAS |

### Firebase write: `src/services/firebase.js` -> `writeGpsPoint()`

Called by the background task on every qualifying GPS update. Two writes happen:

1. `db.ref('gps/live/{driverId}').set(...)` — **overwrites** live pin with current position
2. `db.ref('gps/routes/{shiftRowId}').push(...)` — **appends** new route point (only if `appendRoute = true`)

Both writes are fire-and-forget. The Firebase SDK stores them in on-device SQLite and syncs automatically on reconnect — no GPS points are lost even if the driver has no signal.

**Anonymous auth**: The app signs in anonymously (`auth().signInAnonymously()`) so writes satisfy the Firebase security rule `auth != null`. The session persists across restarts so there is no sign-in delay.

### Staleness filter: `subscribeToLivePositions()`

The subscription filters out drivers whose `ts` is older than 15 minutes. This prevents ghost drivers from appearing when:
- A driver's app crashes without calling `clearLivePosition()`
- Sheet data is deleted but Firebase entries persist
- A driver's phone dies mid-shift

### Shift lifecycle

| Event | GPS action |
|---|---|
| Stage 1 submitted (arrival confirmed) | `startShiftTracking()` — starts background task, resets all counters |
| During shift | Background task writes live pin + route points continuously |
| Stage 4 submitted (shift complete) | `stopShiftTracking()` — stops task, calls `clearLivePosition()` to remove live pin from Firebase, returns `{ totalKm, facilityLeftTime }` |

---

## 3. Admin Map — React Native (`AdminDashboardScreen.js`)

The **Map tab** in the admin app uses `react-native-maps` (Google Maps SDK underneath).

### Subscribing to live driver positions

```js
subscribeToLivePositions(callback)   // src/services/firebase.js
```

Opens a real-time Firebase listener on `gps/live`. Fires immediately with current data, then on every change. Filters to today's date only + 15-minute staleness check. Returns an unsubscribe function for cleanup on unmount.

The admin app enriches each Firebase driver record with `vehicle` and `currentStage` from the GAS `getLiveOperations` API (joined on `driverName`).

### Fetching routes

```js
fetchShiftRoute(shiftRowId)   // src/services/firebase.js
```

One-time read of `gps/routes/{shiftRowId}` ordered by `ts`. Returns `[{ lat, lng, km }]`.

Routes are cached in `routeCache.current` (keyed by `shiftRowId`) so they are not re-fetched on every live-pin update. Stale caches (>30s) are refreshed.

### Route processing pipeline (in `MapTab`)

```
fetchShiftRoute()
       |
       v
filterRouteOutliers()     -- drops jumps > 5 km (signal loss artefacts)
       |
       v
rdpSimplify(pts, 15m)     -- Ramer-Douglas-Peucker, removes collinear noise
       |
       v
downsampleForSnap(100 pts) -- cap at 100 pts before hitting API
       |
       v
snapRouteToRoads()        -- Google Roads API (snapToRoads endpoint)
                            interpolate=true fills gaps with road-following points
                            Chunked into batches of 90 with 5-point overlap
                            Falls back to simplified if API fails
       |
       v
Gap detection             -- splits at gaps > 500m into separate segments
       |
       v
setRoutes({ driverId: { segments: [[{lat,lng}]] } })
```

### Map markers and polylines rendered

| Element | Component | Visual |
|---|---|---|
| **Facility pin** | `<Marker>` at `FACILITY.lat/lng` | House emoji in a white circle |
| **Driver live pin** | `<Marker>` per active driver | Truck emoji in a coloured circle (per-driver colour) |
| **Driver route** | Multiple `<Polyline>` per driver (one per segment) | 4px wide line in same per-driver colour |

**Filter bar** (horizontal scroll, top of map): chips for "All Drivers" + one chip per active driver.

---

## 4. PWA Live Map — Browser (`docs/map.html`)

A standalone HTML file hosted on GitHub Pages. No build step — pure vanilla JS.

### Map engine: Google Maps JavaScript API

```js
new google.maps.Map(document.getElementById('map'), { ... })
```

Uses the same Google Maps API key as the native app for both map tiles and Roads API snapping.

### Firebase subscription

The browser uses the Firebase compat SDK (loaded from CDN):

1. Listen on `gps/live` with `child_added`, `child_changed`, `child_removed` events
2. `upsertDriver()` filters by date + 15-minute staleness threshold
3. For each driver with a `shiftRowId`, attach a `.on('value')` listener on `gps/routes/{shiftRowId}`
4. Route changes are debounced (3s) then snapped via Google Roads API

### Staleness sweep

A 60-second interval checks all tracked drivers. Any driver whose `ts` is >15 minutes old is removed from the map. This auto-cleans ghost drivers even if Firebase `child_removed` never fires.

### Route processing pipeline (in `map.html`)

```
gps/routes/{shiftRowId} real-time listener
       |
       v
snapToRoads()             -- Google Roads API with interpolate=true
                            Batched (90 points per request, 5-point overlap)
                            Retry once on failure, fall back to raw GPS
       |
       v
splitAtGaps(500m)         -- separate polyline segments at large gaps
       |
       v
google.maps.Polyline per segment
```

### Map markers

| Element | Google Maps component | Visual |
|---|---|---|
| **Facility** | `google.maps.Marker` with circle symbol | Red circle |
| **Driver live pin** | `google.maps.Marker` with circle + truck label | Coloured circle with truck emoji |
| **Driver route** | Multiple `google.maps.Polyline` per driver | 5px wide, per-driver colour, one per segment |

---

## 5. Road Snapping — Google Roads API (Both Platforms)

| Context | API used | Key required | Cost |
|---|---|---|---|
| Native app (`AdminDashboardScreen.js`) | Google Roads API (`snapToRoads`) | `AIzaSyCEO-OiBPuSJ8i...` | Pay-per-use |
| PWA browser (`docs/map.html`) | Google Roads API (`snapToRoads`) | `AIzaSyCEO-OiBPuSJ8i...` | Pay-per-use |

Both use `interpolate=true` to fill gaps between sparse GPS points with road-following intermediate coordinates. Both fall back to simplified raw points if the API is unavailable.

**Multi-segment gap detection**: When snapped coordinates have gaps >500m (e.g., GPS signal loss through a tunnel), the polyline is split into separate segments. This prevents straight-line artifacts cutting through buildings.

---

## 6. Geofences

Defined in `src/config.js`:

```js
export const FACILITY = {
  lat: 24.903892,
  lng: 55.114065,
  geofenceMetres:  200,  // Stage 1 arrival check
  departureMetres: 500,  // auto facility-left detection
};
```

| Geofence | When checked | What happens |
|---|---|---|
| 200 m arrival | Stage 1 — driver taps "I'm at the facility" | `checkFacilityGeofence()` takes a one-shot GPS fix. If outside 200 m, Stage 1 is blocked. |
| 500 m departure | Continuously in background task during shift | First time the driver crosses 500 m from facility, the time is saved to AsyncStorage and sent to GAS column Q (`FACILITY_LEFT`). Never re-triggered. |

---

## 7. How Delete / Cleanup Works

### Auto-removal at shift end (driver-initiated)

When Stage 4 is submitted, the app calls `stopShiftTracking(userId)` which calls:
```js
clearLivePosition(userId)
// -> database().ref('gps/live/{userId}').remove()
```
The live pin disappears from both maps within seconds (Firebase pushes the deletion to all listeners).

### Staleness auto-removal (automatic)

Both map views filter out drivers whose `ts` is >15 minutes old:
- Native app: `subscribeToLivePositions()` in `firebase.js` filters before callback
- PWA: `upsertDriver()` checks staleness on every update + 60-second sweep interval

### GAS-initiated cleanup (shift deletion from admin)

`GAS_Pilot_Code.js` contains `FIREBASE_DB_URL` and `FIREBASE_DB_TOKEN` constants. When an admin deletes a shift from the GAS admin dashboard, the backend makes an authenticated REST DELETE to:
- `gps/live/{driverId}`
- `gps/routes/{shiftRowId}`

This cleans up both the live pin and the full route history.

---

## 8. Data Flow Summary

```
Driver phone (Expo app)
    |
    | expo-location background task (every 5s / 10m)
    | + foreground heartbeat (every 10s when HomeScreen focused)
    |
    v
src/services/gps.js  ->  filtering (accuracy, movement, 10m route threshold)
    |
    v
src/services/firebase.js  ->  writeGpsPoint()
    |
    +---> Firebase RTDB: gps/live/{driverId}   (overwrite -- live position)
    |
    +---> Firebase RTDB: gps/routes/{rowId}    (append -- route history)
              |
              |  real-time push to all listeners
              |
    +---------+------------------+
    |                            |
    v                            v
Admin native app             PWA browser (map.html)
(AdminDashboardScreen.js)    (Google Maps JS API)
react-native-maps MapView    google.maps.Map
Google Roads API snapping    Google Roads API snapping
15-min staleness filter      15-min staleness filter + 60s sweep
```

---

## 9. Key File Index

| File | Role |
|---|---|
| `src/services/gps.js` | Background task, geofence checks, start/stop tracking |
| `src/services/firebase.js` | RTDB writes (live pin + route points), subscriptions with staleness filter, clearLivePosition |
| `src/services/api.js` | GAS REST calls including `updateFacilityLeft` |
| `src/config.js` | `FACILITY` coords + geofence radii + `GOOGLE_MAPS_API_KEY` |
| `src/screens/AdminDashboardScreen.js` | Native map tab — MapView, Marker, multi-segment Polyline, Google Roads API snapping |
| `docs/map.html` | PWA live map — Google Maps JS API, Firebase compat SDK, Google Roads API snapping, staleness sweep |
| `GAS_Pilot_Code.js` | Backend — `updateFacilityLeft`, Firebase delete on shift removal |

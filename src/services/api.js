// =============================================================================
// RSA Driver Pilot — GAS REST API Service
// =============================================================================
import { GAS_URL } from '../config';

// Helper: GET request
async function get(action, params) {
  let url = `${GAS_URL}?action=${action}`;
  if (params) {
    Object.keys(params).forEach(k => {
      if (params[k] !== undefined && params[k] !== null) {
        url += `&${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`;
      }
    });
  }
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

// Helper: POST request
async function post(action, payload) {
  const body = JSON.stringify({ action, ...payload });
  const response = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

// =============================================================================
// Authentication
// =============================================================================
export async function authenticateUser(userId, password) {
  return get('authenticateUser', { userId, password });
}

// =============================================================================
// Dropdown data (drivers, helpers, vehicles, destinations, customers)
// =============================================================================
export async function fetchDropdowns() {
  return get('getDropdowns');
}

// =============================================================================
// Active drivers helpers (still used internally by GAS stage queries)
// =============================================================================
export async function fetchActiveDrivers() {
  const result = await get('getActiveDrivers');
  return result.drivers || [];
}

export async function fetchStage1PendingDrivers() {
  const result = await get('getStage1PendingDrivers');
  return result.drivers || [];
}

export async function fetchStage3PendingDrivers() {
  const result = await get('getStage3PendingDrivers');
  return result.drivers || [];
}

// =============================================================================
// Stage 1 — Save shift start (arrival only — minimal data)
// data: { userId, userName, shiftStartTime, arrivalLat?, arrivalLng? }
// =============================================================================
export async function saveShiftStart(data) {
  return post('saveShiftStart', { data });
}

// =============================================================================
// Stage 2 — Save departure (now includes all vehicle/helper details)
// data: { rowId, departureTime, helperName?, helperId?, helperCompany?,
//         vehicleNumber, startOdometer, startPhotoBase64, fuelTaken?,
//         destinationEmirate?, primaryCustomer?, totalDrops,
//         autoFacilityLeftTime? }
// =============================================================================
export async function saveDeparture(data) {
  return post('saveDeparture', { data });
}

// =============================================================================
// Stage 3 — Save last drop
// data: { rowId, lastDropTime, lastDropPhotoBase64?, failedDrops }
// =============================================================================
export async function saveLastDrop(data) {
  return post('saveLastDrop', { data });
}

// =============================================================================
// Stage 4 — Save shift end (includes GPS data)
// data: { rowId, endOdometer, endPhotoBase64, shiftCompleteTime, gpsKm? }
// =============================================================================
export async function saveShiftEnd(data) {
  return post('saveShiftEnd', { data });
}

// =============================================================================
// Driver Dashboard
// =============================================================================
export async function fetchDriverDashboard(userId, month) {
  return get('getDriverDashboard', { userId, month });
}

// =============================================================================
// Admin Dashboard
// =============================================================================
export async function fetchAdminDashboard(date) {
  return get('getAdminDashboard', { date });
}

export async function fetchLiveOperations() {
  return get('getLiveOperations');
}

// =============================================================================
// GPS Tracking — Live map endpoints
// =============================================================================
export async function saveGpsPoint(driverId, driverName, lat, lng, kmTotal) {
  return post('saveGpsPoint', { data: { driverId, driverName, lat, lng, kmTotal } });
}

// Push auto-detected facility-left time (500m) to Column Q in GAS
// Called from GPS background task when departure is detected AFTER Stage 2 submission
export async function updateFacilityLeft(rowId, facilityLeftTime) {
  return post('updateFacilityLeft', { data: { rowId, facilityLeftTime } });
}

export async function fetchActiveDriversLive() {
  return get('getActiveDriversLive');
}

export async function fetchDriverRoute(driverId, date) {
  return get('getDriverRoute', { driverId, date });
}

// =============================================================================
// RSA Driver Pilot — App Configuration
// =============================================================================

// ⚠️ FILL IN YOUR PILOT GAS DEPLOYMENT URL AFTER DEPLOYING THE BACKEND ⚠️
// Steps:
//   1. Complete the GAS_Pilot_Code.js setup (paste into new GAS project, deploy)
//   2. Copy the /exec URL from GAS and paste it below
export const GAS_URL = 'https://script.google.com/macros/s/AKfycbyFz0vqYmZZkuBDktzQ0G2ElvVeGBC6zxA873oSv49-oZ7ir_cwM3a10tGvPM_kiyqjYg/exec';

// Facility GPS coordinates (24.903892, 55.114065)
// Used for: geofence arrival check + facility departure detection
export const FACILITY = {
  lat: 24.903892,
  lng: 55.114065,
  geofenceMetres:  200,    // driver must be within this radius to mark arrival
  departureMetres: 500,  // auto-capture departure time when driver leaves beyond this radius
};

// Google Maps API key (Roads API + Maps JavaScript API)
export const GOOGLE_MAPS_API_KEY = 'AIzaSyCEO-OiBPuSJ8iGZuR8nXIJ9tGL-uVby1c';

// App theme colours (matching original PWA)
export const COLORS = {
  primary:    '#0D47A1',
  primaryDark:'#0A3880',
  accent:     '#1976D2',
  success:    '#2E7D32',
  warning:    '#F57F17',
  error:      '#C62828',
  white:      '#FFFFFF',
  lightGray:  '#F5F5F5',
  borderGray: '#E0E0E0',
  textDark:   '#1A1A2E',
  textMid:    '#555555',
  textLight:  '#888888',
};

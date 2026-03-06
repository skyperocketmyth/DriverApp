// =============================================================================
// RSA Driver Pilot — App.js
// Root component: Navigation stack + Context provider + ErrorBoundary
//
// IMPORTANT: The background GPS task (BACKGROUND_LOCATION_TASK) is defined
// at the top level of src/services/gps.js via TaskManager.defineTask().
// It must be imported here so it is registered before the app mounts.
// =============================================================================
import 'react-native-gesture-handler';
import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import * as Updates from 'expo-updates';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createStackNavigator } from '@react-navigation/stack';

// Import GPS service early so TaskManager.defineTask is registered at launch
import './src/services/gps';
import { writeGpsPoint } from './src/services/firebase';
import { distanceMetres } from './src/utils/haversine';

import { AppProvider } from './src/store/AppContext';
import { COLORS } from './src/config';

// Screens
import AuthScreen            from './src/screens/AuthScreen';
import HomeScreen            from './src/screens/HomeScreen';
import LoginScreen           from './src/screens/LoginScreen';   // Stage 1 — GPS arrival
import Stage2Screen          from './src/screens/Stage2Screen';
import Stage3Screen          from './src/screens/Stage3Screen';
import Stage4Screen          from './src/screens/Stage4Screen';
import SuccessScreen         from './src/screens/SuccessScreen';
import DriverDashboardScreen from './src/screens/DriverDashboardScreen';
import AdminDashboardScreen  from './src/screens/AdminDashboardScreen';

const Stack = createStackNavigator();

// =============================================================================
// ErrorBoundary — catches any unhandled component errors and shows a recovery
// screen instead of crashing the app with the "app has a bug" Android dialog.
// =============================================================================
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: error?.message || 'Unknown error' };
  }

  componentDidCatch(error, info) {
    console.warn('[ErrorBoundary] Caught error:', error.message, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={errStyles.container}>
          <Text style={errStyles.emoji}>⚠️</Text>
          <Text style={errStyles.title}>Something went wrong</Text>
          <Text style={errStyles.message}>{this.state.errorMessage}</Text>
          <TouchableOpacity
            style={errStyles.btn}
            onPress={() => this.setState({ hasError: false, errorMessage: '' })}
          >
            <Text style={errStyles.btnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const errStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#FFF' },
  emoji:     { fontSize: 48, marginBottom: 16 },
  title:     { fontSize: 20, fontWeight: '800', color: '#C62828', marginBottom: 8 },
  message:   { fontSize: 13, color: '#555', textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  btn:       { backgroundColor: COLORS.primary, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 14 },
  btnText:   { color: '#FFF', fontWeight: '700', fontSize: 15 },
});

// =============================================================================
// Foreground GPS Heartbeat
// Runs a 15s GPS poll whenever the app is in the foreground and a shift is active.
// Supplements the background task which is the only thing running when screen locks.
// Stops when app goes to background to avoid duplicate writes with background task.
// =============================================================================
function ForegroundGpsHeartbeat() {
  const intervalRef = useRef(null);
  const lastFgPos   = useRef(null);

  useEffect(() => {
    function startHeartbeat() {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(async () => {
        try {
          const active = await AsyncStorage.getItem('gps_shift_active');
          if (active !== 'true') return;

          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
            timeout: 10000,
          });
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const acc = pos.coords.accuracy;
          if (acc != null && acc > 50) return;

          let shouldAppend = false;
          if (!lastFgPos.current) {
            shouldAppend = true;
          } else {
            shouldAppend = distanceMetres(lastFgPos.current.lat, lastFgPos.current.lng, lat, lng) > 10;
          }
          if (shouldAppend) lastFgPos.current = { lat, lng };

          const userStr    = await AsyncStorage.getItem('gps_tracking_user');
          const shiftRowId = await AsyncStorage.getItem('gps_shift_row_id');
          const totalKmStr = await AsyncStorage.getItem('gps_total_km');
          if (!userStr) return;
          const user = JSON.parse(userStr);

          writeGpsPoint({
            driverId:    user.userId,
            driverName:  user.userName,
            shiftRowId:  shiftRowId || '',
            lat, lng,
            km:          totalKmStr ? parseFloat(totalKmStr) : 0,
            accuracy:    acc || 0,
            appendRoute: shouldAppend,
          });
        } catch (_) {}
      }, 15000);
    }

    function stopHeartbeat() {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      lastFgPos.current = null;
    }

    // Start immediately if app is active
    if (AppState.currentState === 'active') startHeartbeat();

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') startHeartbeat();
      else stopHeartbeat();
    });

    return () => {
      stopHeartbeat();
      sub.remove();
    };
  }, []);

  return null;
}

// =============================================================================
// Main App
// =============================================================================
export default function App() {
  useEffect(() => {
    if (!__DEV__) {
      (async () => {
        try {
          const update = await Updates.checkForUpdateAsync();
          if (update.isAvailable) {
            await Updates.fetchUpdateAsync();
            await Updates.reloadAsync();
          }
        } catch (_) {
          // Ignore — OTA failure should never block app startup
        }
      })();
    }
  }, []);

  return (
    <ErrorBoundary>
      <AppProvider>
        <ForegroundGpsHeartbeat />
        <StatusBar style="light" backgroundColor={COLORS.primary} />
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="Auth"
            screenOptions={{
              headerStyle:            { backgroundColor: COLORS.primary },
              headerTintColor:        COLORS.white,
              headerTitleStyle:       { fontWeight: '700', fontSize: 17 },
              headerBackTitleVisible: false,
            }}
          >
            <Stack.Screen
              name="Auth"
              component={AuthScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={{ headerShown: false }}
            />
            {/* Stage 1 — GPS arrival (LoginScreen repurposed) */}
            <Stack.Screen
              name="Stage1Arrival"
              component={LoginScreen}
              options={{ title: 'Stage 1 — Mark Arrival' }}
            />
            <Stack.Screen
              name="Stage2"
              component={Stage2Screen}
              options={{ title: 'Stage 2 — Departure Details' }}
            />
            <Stack.Screen
              name="Stage3"
              component={Stage3Screen}
              options={{ title: 'Stage 3 — Last Drop' }}
            />
            <Stack.Screen
              name="Stage4"
              component={Stage4Screen}
              options={{ title: 'Stage 4 — Shift Complete' }}
            />
            <Stack.Screen
              name="Success"
              component={SuccessScreen}
              options={{ title: 'Saved', headerLeft: () => null }}
            />
            <Stack.Screen
              name="DriverDashboard"
              component={DriverDashboardScreen}
              options={{ title: 'My Dashboard' }}
            />
            <Stack.Screen
              name="AdminDashboard"
              component={AdminDashboardScreen}
              options={{ title: 'Admin Dashboard' }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </AppProvider>
    </ErrorBoundary>
  );
}

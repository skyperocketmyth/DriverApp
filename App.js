// =============================================================================
// RSA Driver Pilot — App.js
// Root component: Navigation stack + Context provider + ErrorBoundary
//
// IMPORTANT: The background GPS task (BACKGROUND_LOCATION_TASK) is defined
// at the top level of src/services/gps.js via TaskManager.defineTask().
// It must be imported here so it is registered before the app mounts.
// =============================================================================
import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import * as Updates from 'expo-updates';
import { createStackNavigator } from '@react-navigation/stack';

// Import GPS service early so TaskManager.defineTask is registered at launch
import './src/services/gps';

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

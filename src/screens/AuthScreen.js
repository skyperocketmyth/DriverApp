// =============================================================================
// AuthScreen — Login with UserID + Password
// Validates credentials against Google Sheet "Usernames" tab via GAS.
// =============================================================================
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useAppContext } from '../store/AppContext';
import { authenticateUser } from '../services/api';
import { COLORS } from '../config';

export default function AuthScreen({ navigation }) {
  const { setCurrentUser } = useAppContext();

  const [userId,   setUserId]   = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [showPass, setShowPass] = useState(false);

  async function handleLogin() {
    const uid = userId.trim();
    const pwd = password.trim();

    if (!uid || !pwd) {
      Alert.alert('Login Required', 'Please enter your User ID and Password.');
      return;
    }

    setLoading(true);
    try {
      const result = await authenticateUser(uid, pwd);

      if (!result.success) {
        Alert.alert('Login Failed', result.error || 'Invalid credentials. Please try again.');
        return;
      }

      await setCurrentUser({
        userId:   result.userId,
        userName: result.userName,
        isAdmin:  result.isAdmin,
      });

      navigation.replace('Home');
    } catch (err) {
      Alert.alert('Connection Error', 'Could not connect to server. Please check your internet connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Logo / Header ── */}
        <View style={styles.logoSection}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoEmoji}>🚚</Text>
          </View>
          <Text style={styles.appName}>RSA Driver Pilot</Text>
          <Text style={styles.appTagline}>Driver Operations Management</Text>
        </View>

        {/* ── Login card ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign In</Text>

          {/* User ID */}
          <Text style={styles.label}>User ID</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your User ID"
            placeholderTextColor={COLORS.textLight}
            value={userId}
            onChangeText={setUserId}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />

          {/* Password */}
          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder="Enter your Password"
              placeholderTextColor={COLORS.textLight}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPass(v => !v)}>
              <Text style={styles.eyeIcon}>{showPass ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          {/* Login button */}
          <TouchableOpacity
            style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.loginBtnText}>Sign In</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer note */}
        <Text style={styles.footer}>
          Contact your supervisor if you don't have login credentials.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex:      { flex: 1, backgroundColor: COLORS.primary },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },

  logoSection: { alignItems: 'center', marginBottom: 36 },
  logoCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoEmoji:   { fontSize: 44 },
  appName:     { fontSize: 26, fontWeight: '900', color: COLORS.white, letterSpacing: 0.5 },
  appTagline:  { fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 4 },

  card: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textDark,
    marginBottom: 24,
    textAlign: 'center',
  },

  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textDark,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.borderGray,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: COLORS.textDark,
    marginBottom: 18,
    backgroundColor: '#FAFAFA',
  },

  passwordRow:  { position: 'relative' },
  passwordInput: { paddingRight: 52 },
  eyeBtn: {
    position: 'absolute',
    right: 14,
    top: 12,
    padding: 4,
  },
  eyeIcon: { fontSize: 20 },

  loginBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 6,
  },
  loginBtnDisabled: { backgroundColor: COLORS.textLight },
  loginBtnText: { fontSize: 17, fontWeight: '800', color: COLORS.white, letterSpacing: 0.3 },

  footer: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    marginTop: 28,
    paddingHorizontal: 20,
  },
});

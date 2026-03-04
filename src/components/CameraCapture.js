// =============================================================================
// CameraCapture — Camera component for odometer photos
// Uses expo-camera. Shows live preview, capture button, preview + retake.
// =============================================================================
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Image, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { COLORS } from '../config';

export default function CameraCapture({ label, onPhoto, required, rtl }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [active, setActive]   = useState(false);   // camera is open
  const [photo, setPhoto]     = useState(null);     // captured base64
  const [loading, setLoading] = useState(false);
  const cameraRef             = useRef(null);

  async function openCamera() {
    if (!permission || !permission.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Permission needed', 'Camera permission is required to take odometer photos.');
        return;
      }
    }
    setActive(true);
  }

  async function capture() {
    if (!cameraRef.current || loading) return;
    setLoading(true);
    try {
      const result = await cameraRef.current.takePictureAsync({
        base64:  true,
        quality: 0.6,   // balance quality vs upload size
      });
      const base64 = 'data:image/jpeg;base64,' + result.base64;
      setPhoto(base64);
      onPhoto(base64);
      setActive(false);
    } catch (err) {
      Alert.alert('Camera error', err.message);
    } finally {
      setLoading(false);
    }
  }

  function retake() {
    setPhoto(null);
    onPhoto(null);
    setActive(true);
  }

  // Camera open state
  if (active) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
        />
        <View style={styles.cameraControls}>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setActive(false)}>
            <Text style={styles.cancelBtnText}>✕ Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.captureBtn} onPress={capture} disabled={loading}>
            {loading
              ? <ActivityIndicator color={COLORS.white} />
              : <View style={styles.captureInner} />}
          </TouchableOpacity>
          <View style={{ width: 80 }} />
        </View>
      </View>
    );
  }

  // Captured photo preview
  if (photo) {
    return (
      <View style={styles.container}>
        {label ? (
          <Text style={[styles.label, rtl && styles.rtlText]}>
            {label}{required ? <Text style={styles.asterisk}> *</Text> : null}
          </Text>
        ) : null}
        <View style={styles.previewBox}>
          <Image source={{ uri: photo }} style={styles.preview} resizeMode="cover" />
          <View style={styles.capturedBadge}>
            <Text style={styles.capturedText}>✓ Photo captured</Text>
          </View>
          <TouchableOpacity style={styles.retakeBtn} onPress={retake}>
            <Text style={styles.retakeBtnText}>⟳ Retake</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Default state — take photo button
  return (
    <View style={styles.container}>
      {label ? (
        <Text style={[styles.label, rtl && styles.rtlText]}>
          {label}{required ? <Text style={styles.asterisk}> *</Text> : null}
        </Text>
      ) : null}
      <TouchableOpacity style={styles.takePhotoBtn} onPress={openCamera}>
        <Text style={styles.cameraIcon}>📷</Text>
        <Text style={styles.takePhotoBtnText}>Take Photo</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textDark,
    marginBottom: 6,
  },
  asterisk: { color: COLORS.error },
  rtlText:  { textAlign: 'right' },

  takePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.accent,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 18,
    backgroundColor: '#EBF3FB',
    gap: 10,
  },
  cameraIcon:       { fontSize: 22 },
  takePhotoBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.accent },

  // Camera view
  cameraContainer: {
    height: 380,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 14,
    backgroundColor: '#000',
  },
  camera: { flex: 1 },
  cameraControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  cancelBtn:     { padding: 10 },
  cancelBtnText: { color: COLORS.white, fontSize: 15, fontWeight: '600' },
  captureBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 3,
    borderColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  captureInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.white,
  },

  // Preview
  previewBox: {
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  preview:      { width: '100%', height: 180 },
  capturedBadge: {
    backgroundColor: COLORS.success,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  capturedText: { color: COLORS.white, fontWeight: '700', fontSize: 13 },
  retakeBtn: {
    backgroundColor: COLORS.lightGray,
    alignItems: 'center',
    paddingVertical: 10,
  },
  retakeBtnText: { color: COLORS.accent, fontWeight: '600', fontSize: 14 },
});

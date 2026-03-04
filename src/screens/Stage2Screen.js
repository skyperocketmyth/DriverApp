// =============================================================================
// Stage2Screen — Departure Details
// Captures: helper, vehicle, start odometer, photo, fuel, destination,
// customer, total drops, user-entered leaving time.
// Also shows auto-detected GPS departure time (500m from facility).
// =============================================================================
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useAppContext } from '../store/AppContext';
import AutocompleteInput from '../components/AutocompleteInput';
import CameraCapture from '../components/CameraCapture';
import DateTimePicker from '../components/DateTimePicker';
import GpsBanner from './GpsBanner';
import { saveDeparture } from '../services/api';
import { getAutoFacilityLeftTime } from '../services/gps';
import { COLORS } from '../config';
import { t, isRTL } from '../i18n/translations';

function getDubaiNowLocal() {
  const now     = new Date();
  const dubaiMs = now.getTime() + (4 * 60 * 60 * 1000);
  const d       = new Date(dubaiMs);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function formatLocalTime(isoStr) {
  if (!isoStr) return 'Not detected yet';
  try {
    return new Date(isoStr).toLocaleString('en-GB', {
      timeZone: 'Asia/Dubai',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch (_) { return isoStr; }
}

export default function Stage2Screen({ navigation }) {
  const {
    language, currentUser, shiftProgress, setShiftProgress,
    helpers, vehicles, destinations, customers, helperCompanies,
    dropdownsLoaded, loadDropdowns,
  } = useAppContext();
  const rtl = isRTL(language);

  // Helper mode
  const [helperMode,      setHelperMode]      = useState('search');
  const [selectedHelper,  setSelectedHelper]  = useState(null);
  const [manualHelperName, setManualHelperName] = useState('');
  const [manualHelperId,   setManualHelperId]   = useState('');
  const [manualHelperCo,   setManualHelperCo]   = useState('');

  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [startOdo,        setStartOdo]        = useState('');
  const [startPhoto,      setStartPhoto]      = useState(null);
  const [fuel,            setFuel]            = useState('');
  const [destination,     setDestination]     = useState('');
  const [customer,        setCustomer]        = useState(null);
  const [totalDrops,      setTotalDrops]      = useState('');
  const [departureTime,   setDepartureTime]   = useState(getDubaiNowLocal());

  const [autoGpsLeftTime, setAutoGpsLeftTime] = useState(null);
  const [saving,          setSaving]          = useState(false);
  const [errors,          setErrors]          = useState({});

  // Load dropdowns if not yet loaded; poll auto GPS time every 10s
  useEffect(() => {
    if (!dropdownsLoaded) loadDropdowns();
    loadAutoGpsTime();
    const poll = setInterval(loadAutoGpsTime, 10000);
    return () => clearInterval(poll);
  }, []);

  async function loadAutoGpsTime() {
    try {
      const t = await getAutoFacilityLeftTime();
      setAutoGpsLeftTime(t);
    } catch (_) {}
  }

  function validate() {
    const e = {};
    if (!selectedVehicle)    e.vehicle   = true;
    if (!startOdo.trim())    e.startOdo  = true;
    if (!startPhoto)         e.startPhoto = true;
    if (!departureTime)      e.departure  = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) {
      Alert.alert(t('error', language), 'Please fill in all required fields.');
      return;
    }
    if (!shiftProgress?.rowId) {
      Alert.alert(t('error', language), 'No active shift found. Please complete Stage 1 first.');
      return;
    }

    setSaving(true);
    try {
      const helperData = helperMode === 'search' && selectedHelper
        ? { helperId: selectedHelper.id, helperName: selectedHelper.name, helperCompany: selectedHelper.company }
        : helperMode === 'manual' && manualHelperName.trim()
        ? { helperId: manualHelperId.trim(), helperName: manualHelperName.trim(), helperCompany: manualHelperCo.trim() }
        : {};

      const payload = {
        rowId:              shiftProgress.rowId,
        departureTime:      departureTime,
        ...helperData,
        vehicleNumber:      selectedVehicle.number,
        startOdometer:      startOdo.trim(),
        startPhotoBase64:   startPhoto,
        fuelTaken:          fuel.trim(),
        destinationEmirate: destination,
        primaryCustomer:    customer?.name || '',
        totalDrops:         totalDrops.trim() || '0',
        autoFacilityLeftTime: autoGpsLeftTime || undefined,
      };

      const result = await saveDeparture(payload);

      if (!result.success) {
        Alert.alert(t('error', language), result.error || t('errServer', language));
        return;
      }

      // Update shift progress
      const progress = { ...shiftProgress, stage2Done: true };
      await setShiftProgress(progress);

      navigation.navigate('Success', {
        stage:         2,
        message:       'Departure details saved! GPS tracking continues.',
        driverName:    currentUser?.userName,
        departureTime: result.departureTime,
      });
    } catch (err) {
      Alert.alert(t('error', language), err.message || t('errServer', language));
    } finally {
      setSaving(false);
    }
  }

  if (!shiftProgress?.stage1Done) {
    return (
      <View style={styles.centred}>
        <Text style={styles.errorText}>⚠ Complete Stage 1 (Arrival) first.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="always">

      <View style={styles.headerCard}>
        <Text style={styles.stageTag}>STAGE 2</Text>
        <Text style={styles.headerTitle}>Departure Details</Text>
        <Text style={styles.headerSub}>{currentUser?.userName}</Text>
      </View>

      <GpsBanner language={language} />

      {/* Auto GPS departure time display */}
      <View style={autoGpsLeftTime ? styles.gpsDetectedBox : styles.gpsWaitingBox}>
        <Text style={styles.gpsDetectedLabel}>
          {autoGpsLeftTime ? '📍 Auto GPS Departure Detected' : '⏳ Waiting for GPS Departure Detection (500m)…'}
        </Text>
        {autoGpsLeftTime && (
          <Text style={styles.gpsDetectedTime}>{formatLocalTime(autoGpsLeftTime)}</Text>
        )}
        {!autoGpsLeftTime && (
          <Text style={styles.gpsWaitingNote}>
            System will auto-record when you travel 500m from facility.
          </Text>
        )}
      </View>

      <View style={styles.card}>

        {/* ── Helper section ── */}
        <Text style={styles.sectionTitle}>Helper Details</Text>
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeBtn, helperMode === 'search' && styles.modeBtnActive]}
            onPress={() => setHelperMode('search')}
          >
            <Text style={[styles.modeBtnText, helperMode === 'search' && styles.modeBtnTextActive]}>
              Search
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, helperMode === 'manual' && styles.modeBtnActive]}
            onPress={() => setHelperMode('manual')}
          >
            <Text style={[styles.modeBtnText, helperMode === 'manual' && styles.modeBtnTextActive]}>
              Manual
            </Text>
          </TouchableOpacity>
        </View>

        {helperMode === 'search' ? (
          <AutocompleteInput
            label={t('helperNameLabel', language)}
            placeholder="Search helper…"
            items={helpers}
            displayKey="name"
            valueKey="id"
            secondaryKey="id"
            value={selectedHelper?.id}
            onSelect={setSelectedHelper}
            rtl={rtl}
          />
        ) : (
          <>
            <TextInput
              style={styles.textInput}
              placeholder="Helper Name"
              placeholderTextColor={COLORS.textLight}
              value={manualHelperName}
              onChangeText={setManualHelperName}
            />
            <TextInput
              style={styles.textInput}
              placeholder="Helper ID (optional)"
              placeholderTextColor={COLORS.textLight}
              value={manualHelperId}
              onChangeText={setManualHelperId}
            />
            <AutocompleteInput
              label="Helper Company"
              placeholder="Select company…"
              items={helperCompanies.map(c => ({ label: c, value: c }))}
              displayKey="label"
              valueKey="value"
              value={manualHelperCo}
              onSelect={v => setManualHelperCo(v?.value || v || '')}
              rtl={rtl}
            />
          </>
        )}

        {/* ── Vehicle ── */}
        <AutocompleteInput
          label={t('vehicleLabel', language)}
          placeholder="Search vehicle number…"
          items={vehicles}
          displayKey="number"
          valueKey="number"
          value={selectedVehicle?.number}
          onSelect={setSelectedVehicle}
          required
          rtl={rtl}
        />
        {errors.vehicle && <Text style={styles.errText}>{t('errRequired', language)}</Text>}

        {/* ── Start Odometer ── */}
        <Text style={styles.fieldLabel}>{t('startOdoLabel', language)} <Text style={styles.asterisk}>*</Text></Text>
        <TextInput
          style={[styles.textInput, errors.startOdo && styles.inputError]}
          placeholder="e.g. 45230"
          placeholderTextColor={COLORS.textLight}
          value={startOdo}
          onChangeText={setStartOdo}
          keyboardType="numeric"
        />

        {/* ── Start Photo ── */}
        <CameraCapture
          label={t('startPhotoLabel', language)}
          onPhoto={setStartPhoto}
          required
          rtl={rtl}
        />
        {errors.startPhoto && <Text style={styles.errText}>{t('errRequired', language)}</Text>}

        {/* ── Fuel ── */}
        <Text style={styles.fieldLabel}>Fuel Taken (litres)</Text>
        <TextInput
          style={styles.textInput}
          placeholder="e.g. 40"
          placeholderTextColor={COLORS.textLight}
          value={fuel}
          onChangeText={setFuel}
          keyboardType="numeric"
        />

        {/* ── Destination ── */}
        <AutocompleteInput
          label={t('destinationLabel', language)}
          placeholder="Select emirate…"
          items={destinations.map(d => ({ label: d, value: d }))}
          displayKey="label"
          valueKey="value"
          value={destination}
          onSelect={v => setDestination(v?.value || v || '')}
          rtl={rtl}
        />

        {/* ── Customer ── */}
        <AutocompleteInput
          label={t('customerLabel', language)}
          placeholder="Search customer…"
          items={customers}
          displayKey="name"
          valueKey="name"
          value={customer?.name}
          onSelect={setCustomer}
          rtl={rtl}
        />

        {/* ── Total Drops ── */}
        <Text style={styles.fieldLabel}>{t('totalDropsLabel', language)}</Text>
        <TextInput
          style={styles.textInput}
          placeholder="e.g. 12"
          placeholderTextColor={COLORS.textLight}
          value={totalDrops}
          onChangeText={setTotalDrops}
          keyboardType="numeric"
        />

        {/* ── Facility Leaving Time (user entry) ── */}
        <DateTimePicker
          label="Facility Leaving Time"
          value={departureTime}
          onChange={setDepartureTime}
          required
          rtl={rtl}
        />
        {errors.departure && <Text style={styles.errText}>{t('errRequired', language)}</Text>}

        <View style={styles.noteBox}>
          <Text style={styles.noteText}>
            ℹ️ Enter the time you left the facility. The GPS auto-detected time above will also be saved for cross-validation.
          </Text>
        </View>

        {/* ── Save button ── */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color={COLORS.white} />
            : <Text style={styles.saveBtnText}>Save Departure Details</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: COLORS.lightGray },
  content: { padding: 16, paddingBottom: 40 },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

  headerCard: {
    backgroundColor: '#6A1B9A',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
  },
  stageTag: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: COLORS.white },
  headerSub:   { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 4 },

  gpsDetectedBox: {
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.success,
  },
  gpsWaitingBox: {
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
  },
  gpsDetectedLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textMid, marginBottom: 4 },
  gpsDetectedTime:  { fontSize: 15, fontWeight: '800', color: COLORS.success },
  gpsWaitingNote:   { fontSize: 12, color: '#E65100', marginTop: 2 },

  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMid,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },

  modeToggle: {
    flexDirection: 'row',
    backgroundColor: COLORS.lightGray,
    borderRadius: 10,
    padding: 3,
    marginBottom: 14,
  },
  modeBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  modeBtnActive: { backgroundColor: COLORS.white, elevation: 2 },
  modeBtnText:   { fontSize: 13, color: COLORS.textMid, fontWeight: '500' },
  modeBtnTextActive: { color: '#6A1B9A', fontWeight: '700' },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textDark, marginBottom: 6 },
  asterisk:   { color: COLORS.error },
  textInput: {
    borderWidth: 1.5,
    borderColor: COLORS.borderGray,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.textDark,
    marginBottom: 14,
    backgroundColor: COLORS.white,
  },
  inputError: { borderColor: COLORS.error },
  errText: { color: COLORS.error, fontSize: 12, marginTop: -10, marginBottom: 10 },

  noteBox: {
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  noteText: { fontSize: 12, color: COLORS.accent, lineHeight: 18 },

  saveBtn: {
    backgroundColor: '#6A1B9A',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnDisabled: { backgroundColor: COLORS.textLight },
  saveBtnText: { fontSize: 16, fontWeight: '800', color: COLORS.white },

  errorText: { color: COLORS.error, fontSize: 15, textAlign: 'center', marginBottom: 16 },
  backBtn: { backgroundColor: COLORS.primary, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  backBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
});

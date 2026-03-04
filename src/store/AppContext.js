// =============================================================================
// RSA Driver Pilot — Global App State (React Context)
// =============================================================================
import React, { createContext, useContext, useReducer, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchDropdowns } from '../services/api';

const STORAGE_KEY_USER     = 'auth_user';
const STORAGE_KEY_SHIFT    = 'shift_progress';
const STORAGE_KEY_LANGUAGE = 'app_language';

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------
const initialState = {
  // Auth (restored from AsyncStorage on mount)
  currentUser: null,
  // currentUser shape: { userId, userName, isAdmin }

  // Dropdown data loaded from GAS
  drivers:         [],
  helpers:         [],
  vehicles:        [],
  destinations:    [],
  customers:       [],
  helperCompanies: [],
  dropdownsLoaded: false,
  dropdownsError:  null,

  // Shift progress (per logged-in user, persisted across app restarts)
  shiftProgress: null,
  // shiftProgress shape:
  // { stage1Done, stage2Done, stage3Done, stage4Done,
  //   rowId, arrivalTime, startLat, startLng }

  // Language ('en' | 'hi' | 'ar' | 'ur')
  language: 'en',
};

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------
function reducer(state, action) {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, currentUser: action.payload };
    case 'CLEAR_USER':
      return { ...state, currentUser: null, shiftProgress: null };
    case 'SET_DROPDOWNS':
      return {
        ...state,
        drivers:         action.payload.drivers         || [],
        helpers:         action.payload.helpers         || [],
        vehicles:        action.payload.vehicles        || [],
        destinations:    action.payload.destinations    || [],
        customers:       action.payload.customers       || [],
        helperCompanies: action.payload.helperCompanies || [],
        dropdownsLoaded: true,
        dropdownsError:  null,
      };
    case 'SET_DROPDOWNS_ERROR':
      return { ...state, dropdownsLoaded: false, dropdownsError: action.payload };
    case 'SET_SHIFT_PROGRESS':
      return { ...state, shiftProgress: action.payload };
    case 'CLEAR_SHIFT_PROGRESS':
      return { ...state, shiftProgress: null };
    // Legacy — keep for any code that still references activeShift
    case 'SET_ACTIVE_SHIFT':
      return {
        ...state,
        shiftProgress: {
          ...(state.shiftProgress || {}),
          stage1Done: true,
          rowId:       action.payload.rowId,
          arrivalTime: action.payload.arrivalTime,
          startLat:    action.payload.startLat,
          startLng:    action.payload.startLng,
        },
      };
    case 'CLEAR_ACTIVE_SHIFT':
      return { ...state, shiftProgress: null };
    case 'SET_LANGUAGE':
      return { ...state, language: action.payload };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Restore persisted state on mount
  useEffect(() => {
    restorePersistedState();
  }, []);

  // Load dropdowns when user is set (and not admin)
  useEffect(() => {
    if (state.currentUser && !state.currentUser.isAdmin) {
      loadDropdowns();
    }
  }, [state.currentUser]);

  async function restorePersistedState() {
    try {
      const [userJson, shiftJson, lang] = await AsyncStorage.multiGet([
        STORAGE_KEY_USER,
        STORAGE_KEY_SHIFT,
        STORAGE_KEY_LANGUAGE,
      ]);

      if (userJson[1]) {
        const user = JSON.parse(userJson[1]);
        dispatch({ type: 'SET_USER', payload: user });
      }
      if (shiftJson[1]) {
        const shift = JSON.parse(shiftJson[1]);
        dispatch({ type: 'SET_SHIFT_PROGRESS', payload: shift });
      }
      if (lang[1]) {
        dispatch({ type: 'SET_LANGUAGE', payload: lang[1] });
      }
    } catch (_) {
      // Ignore restore errors — fresh state is fine
    }
  }

  async function loadDropdowns() {
    try {
      const data = await fetchDropdowns();
      dispatch({ type: 'SET_DROPDOWNS', payload: data });
    } catch (err) {
      dispatch({ type: 'SET_DROPDOWNS_ERROR', payload: err.message });
    }
  }

  async function setCurrentUser(user) {
    dispatch({ type: 'SET_USER', payload: user });
    try {
      await AsyncStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    } catch (_) {}
  }

  async function clearCurrentUser() {
    dispatch({ type: 'CLEAR_USER' });
    try {
      await AsyncStorage.multiRemove([STORAGE_KEY_USER, STORAGE_KEY_SHIFT]);
    } catch (_) {}
  }

  async function setShiftProgress(progress) {
    dispatch({ type: 'SET_SHIFT_PROGRESS', payload: progress });
    try {
      if (progress) {
        await AsyncStorage.setItem(STORAGE_KEY_SHIFT, JSON.stringify(progress));
      } else {
        await AsyncStorage.removeItem(STORAGE_KEY_SHIFT);
      }
    } catch (_) {}
  }

  async function clearShiftProgress() {
    dispatch({ type: 'CLEAR_SHIFT_PROGRESS' });
    try {
      await AsyncStorage.removeItem(STORAGE_KEY_SHIFT);
    } catch (_) {}
  }

  // Legacy helpers kept for backward compat with existing stage screens
  function setActiveShift(shiftData) {
    dispatch({ type: 'SET_ACTIVE_SHIFT', payload: shiftData });
    const updated = {
      ...(state.shiftProgress || {}),
      stage1Done:  true,
      rowId:       shiftData.rowId,
      arrivalTime: shiftData.arrivalTime,
      startLat:    shiftData.startLat,
      startLng:    shiftData.startLng,
    };
    AsyncStorage.setItem(STORAGE_KEY_SHIFT, JSON.stringify(updated)).catch(() => {});
  }

  function clearActiveShift() {
    dispatch({ type: 'CLEAR_ACTIVE_SHIFT' });
    AsyncStorage.removeItem(STORAGE_KEY_SHIFT).catch(() => {});
  }

  async function setLanguage(lang) {
    dispatch({ type: 'SET_LANGUAGE', payload: lang });
    try {
      await AsyncStorage.setItem(STORAGE_KEY_LANGUAGE, lang);
    } catch (_) {}
  }

  // Derived: activeShift for backward-compat with GpsBanner / SuccessScreen
  const activeShift = state.shiftProgress?.stage1Done ? {
    rowId:       state.shiftProgress.rowId,
    driverId:    state.currentUser?.userId,
    driverName:  state.currentUser?.userName,
    arrivalTime: state.shiftProgress.arrivalTime,
    startLat:    state.shiftProgress.startLat,
    startLng:    state.shiftProgress.startLng,
  } : null;

  return (
    <AppContext.Provider value={{
      ...state,
      activeShift,
      loadDropdowns,
      setCurrentUser,
      clearCurrentUser,
      setShiftProgress,
      clearShiftProgress,
      setActiveShift,
      clearActiveShift,
      setLanguage,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}

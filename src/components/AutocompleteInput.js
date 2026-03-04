// =============================================================================
// AutocompleteInput — Searchable dropdown component
// Replicates the web app's autocomplete behaviour in React Native.
// =============================================================================
import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, I18nManager,
} from 'react-native';
import { COLORS } from '../config';

export default function AutocompleteInput({
  label,
  placeholder,
  items,         // Array of items — can be strings or objects
  displayKey,    // If items are objects, which key to display (e.g. 'name')
  valueKey,      // If items are objects, which key is the value (e.g. 'id')
  secondaryKey,  // Optional secondary display key (e.g. 'id' shown in grey)
  value,         // Currently selected value (the valueKey value)
  onSelect,      // (item) => void  — called when user selects an item
  required,
  disabled,
  rtl,
}) {
  const [query, setQuery]       = useState('');
  const [showList, setShowList] = useState(false);

  // Display text for the selected value
  const selectedLabel = useMemo(() => {
    if (!value) return '';
    if (!displayKey) return String(value);
    const found = items.find(i => i[valueKey] === value);
    return found ? found[displayKey] : String(value);
  }, [value, items, displayKey, valueKey]);

  // Filtered suggestions
  const suggestions = useMemo(() => {
    if (!query.trim()) return items.slice(0, 8);
    const q = query.toLowerCase();
    return items.filter(item => {
      const display = displayKey ? String(item[displayKey] || '') : String(item);
      const secondary = secondaryKey ? String(item[secondaryKey] || '') : '';
      return display.toLowerCase().includes(q) || secondary.toLowerCase().includes(q);
    }).slice(0, 8);
  }, [query, items, displayKey, secondaryKey]);

  function handleFocus() {
    setQuery('');
    setShowList(true);
  }

  function handleSelect(item) {
    onSelect(item);
    setQuery('');
    setShowList(false);
  }

  function handleChangeText(text) {
    setQuery(text);
    setShowList(true);
    if (!text) onSelect(null);
  }

  const displayValue = showList ? query : selectedLabel;

  return (
    <View style={styles.container}>
      {label ? (
        <Text style={[styles.label, rtl && styles.rtlText]}>
          {label}{required ? <Text style={styles.asterisk}> *</Text> : null}
        </Text>
      ) : null}

      <TextInput
        style={[styles.input, disabled && styles.inputDisabled, rtl && styles.rtlInput]}
        placeholder={placeholder || ''}
        placeholderTextColor={COLORS.textLight}
        value={displayValue}
        onChangeText={handleChangeText}
        onFocus={handleFocus}
        onBlur={() => setTimeout(() => setShowList(false), 150)}
        editable={!disabled}
        textAlign={rtl ? 'right' : 'left'}
      />

      {showList && suggestions.length > 0 && (
        <View style={styles.dropdown}>
          <FlatList
            data={suggestions}
            keyExtractor={(item, idx) => (valueKey ? String(item[valueKey]) : String(item)) + idx}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const displayText = displayKey ? item[displayKey] : item;
              const secondaryText = secondaryKey ? item[secondaryKey] : null;
              return (
                <TouchableOpacity
                  style={styles.item}
                  onPress={() => handleSelect(item)}
                >
                  <Text style={[styles.itemText, rtl && styles.rtlText]} numberOfLines={1}>
                    {displayText}
                  </Text>
                  {secondaryText ? (
                    <Text style={[styles.itemSecondary, rtl && styles.rtlText]}>
                      {secondaryText}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}
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
  asterisk: {
    color: COLORS.error,
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.borderGray,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.textDark,
    backgroundColor: COLORS.white,
  },
  inputDisabled: {
    backgroundColor: COLORS.lightGray,
    color: COLORS.textLight,
  },
  rtlInput: {
    textAlign: 'right',
  },
  dropdown: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.borderGray,
    borderRadius: 10,
    maxHeight: 220,
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 6,
  },
  item: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  itemText: {
    fontSize: 15,
    color: COLORS.textDark,
  },
  itemSecondary: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
});

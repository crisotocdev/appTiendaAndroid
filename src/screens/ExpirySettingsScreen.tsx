// src/screens/ExpirySettingsScreen.tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import {
  getExpirySettings,
  setExpirySettings,
  EXPIRY_DEFAULTS,
} from '../settings/expirySettings';
import { refreshExpiryNotifications } from '../notifications';

type Props = NativeStackScreenProps<any>;

const MIN_SOON = 1;
const MAX_SOON = 60;
const MIN_OK = 2;
const MAX_OK = 365;

export default function ExpirySettingsScreen({ navigation }: Props) {
  const t = useTheme();

  const [soon, setSoon] = useState<number>(EXPIRY_DEFAULTS.soonThresholdDays);
  const [ok, setOk] = useState<number>(EXPIRY_DEFAULTS.okThresholdDays);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: 'Ajustes de vencimiento' });

    (async () => {
      try {
        const s = await getExpirySettings();
        setSoon(s.soonThresholdDays);
        setOk(s.okThresholdDays);
      } finally {
        setLoading(false);
      }
    })();
  }, [navigation]);

  const clamp = (n: number, min: number, max: number) =>
    Math.max(min, Math.min(max, Math.round(n)));

  const adjustSoon = useCallback((d: number) => {
    setSoon(prev => clamp(prev + d, MIN_SOON, MAX_SOON));
  }, []);

  const adjustOk = useCallback((d: number) => {
    setOk(prev => clamp(prev + d, MIN_OK, MAX_OK));
  }, []);

  const onSave = useCallback(async () => {
    // coherencia: ok > soon
    const safeSoon = clamp(soon, MIN_SOON, MAX_SOON);
    let safeOk = clamp(ok, MIN_OK, MAX_OK);
    if (safeOk <= safeSoon) safeOk = Math.min(Math.max(safeSoon + 1, MIN_OK), MAX_OK);

    try {
      setSaving(true);
      await setExpirySettings({
        soonThresholdDays: safeSoon,
        okThresholdDays: safeOk,
      });
      await refreshExpiryNotifications();
      Alert.alert(
        'Guardado',
        `“Por vencer”: ${safeSoon} día(s) • “OK” hasta: ${safeOk} día(s).`
      );
      navigation.goBack();
    } catch {
      Alert.alert('Error', 'No se pudieron guardar los ajustes.');
    } finally {
      setSaving(false);
    }
  }, [soon, ok, navigation]);

  const reset = useCallback(() => {
    setSoon(EXPIRY_DEFAULTS.soonThresholdDays);
    setOk(EXPIRY_DEFAULTS.okThresholdDays);
  }, []);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: t.colors.background ?? '#020617' },
      ]}
    >
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Cargando ajustes…</Text>
        </View>
      ) : (
        <>
          {/* Card: POR VENCER */}
          <View style={styles.card}>
            <Text style={styles.title}>“Por vencer” (días)</Text>
            <Text style={styles.subtitle}>
              Muestra la etiqueta POR VENCER cuando falten ≤ este número de días.
            </Text>

            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.circleBtn, { opacity: soon <= MIN_SOON ? 0.4 : 1 }]}
                onPress={() => adjustSoon(-1)}
                disabled={soon <= MIN_SOON}
              >
                <Text style={styles.circleBtnText}>−</Text>
              </TouchableOpacity>

              <View style={styles.valueBox}>
                <Text style={styles.valueNumber}>{soon}</Text>
                <Text style={styles.valueLabel}>día(s) antes</Text>
              </View>

              <TouchableOpacity
                style={[styles.circleBtn, { opacity: soon >= MAX_SOON ? 0.4 : 1 }]}
                onPress={() => adjustSoon(+1)}
                disabled={soon >= MAX_SOON}
              >
                <Text style={styles.circleBtnText}>＋</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionLabel}>Atajos rápidos</Text>
            <View style={styles.chipsRow}>
              {[1, 3, 7, 14, 30].map(v => (
                <TouchableOpacity
                  key={`soon-${v}`}
                  style={[styles.chip, soon === v && styles.chipActive]}
                  onPress={() => setSoon(v)}
                >
                  <Text style={[styles.chipText, soon === v && styles.chipTextActive]}>
                    {v === 1 ? '1 día' : `${v} días`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.helper}>Rango permitido: {MIN_SOON}–{MAX_SOON} días.</Text>
          </View>

          {/* Card: OK HASTA */}
          <View style={styles.card}>
            <Text style={styles.title}>“OK” hasta (días)</Text>
            <Text style={styles.subtitle}>
              Hasta este umbral se mostrará OK; sobre este valor se mostrará LEJOS.
            </Text>

            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.circleBtn, { opacity: ok <= MIN_OK ? 0.4 : 1 }]}
                onPress={() => adjustOk(-1)}
                disabled={ok <= MIN_OK}
              >
                <Text style={styles.circleBtnText}>−</Text>
              </TouchableOpacity>

              <TextInput
                value={String(ok)}
                onChangeText={t => setOk(clamp(Number(t.replace(/[^\d]/g, '') || '0'), MIN_OK, MAX_OK))}
                keyboardType="numeric"
                style={styles.input}
                placeholderTextColor="rgba(255,255,255,0.5)"
              />

              <TouchableOpacity
                style={[styles.circleBtn, { opacity: ok >= MAX_OK ? 0.4 : 1 }]}
                onPress={() => adjustOk(+1)}
                disabled={ok >= MAX_OK}
              >
                <Text style={styles.circleBtnText}>＋</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionLabel}>Atajos rápidos</Text>
            <View style={styles.chipsRow}>
              {[14, 30, 45, 60, 90].map(v => (
                <TouchableOpacity
                  key={`ok-${v}`}
                  style={[styles.chip, ok === v && styles.chipActive]}
                  onPress={() => setOk(v)}
                >
                  <Text style={[styles.chipText, ok === v && styles.chipTextActive]}>
                    {v} días
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.helper}>
              Rango permitido: {MIN_OK}–{MAX_OK} días. Siempre debe ser mayor que “Por vencer”.
            </Text>
          </View>

          {/* Acciones */}
          <View style={styles.actionsRow}>
            <TouchableOpacity style={[styles.secondaryBtn]} onPress={reset} disabled={saving}>
              <Text style={styles.secondaryBtnText}>Restablecer</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onSave}
              disabled={saving}
              style={[styles.saveBtn, { opacity: saving ? 0.6 : 1 }]}
            >
              <Text style={styles.saveBtnText}>{saving ? 'Guardando…' : 'Guardar ajustes'}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 8, color: '#e5e7eb' },

  card: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: 'rgba(15,23,42,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.6)',
    marginBottom: 14,
  },
  title: { fontSize: 18, fontWeight: '800', color: '#e5e7eb', marginBottom: 6 },
  subtitle: { fontSize: 13, color: '#cbd5f5', marginBottom: 12 },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  circleBtn: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.8)', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.9)',
  },
  circleBtnText: { color: '#e5e7eb', fontSize: 22, fontWeight: '900' },

  valueBox: { alignItems: 'center', justifyContent: 'center' },
  valueNumber: { fontSize: 28, fontWeight: '900', color: '#4ade80' },
  valueLabel: { marginTop: 4, fontSize: 12, color: '#cbd5f5' },

  input: {
    flex: 1,
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.7)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#e5e7eb',
    backgroundColor: 'rgba(15,23,42,0.9)',
    textAlign: 'center',
  },

  sectionLabel: { marginTop: 14, marginBottom: 6, fontSize: 13, fontWeight: '700', color: '#e5e7eb' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 8, marginBottom: 8 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.7)', backgroundColor: 'rgba(15,23,42,0.9)',
  },
  chipActive: { backgroundColor: 'rgba(34,197,94,0.25)', borderColor: 'rgba(34,197,94,0.9)' },
  chipText: { color: '#cbd5f5', fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: '#e5e7eb' },

  helper: { marginTop: 8, fontSize: 12, color: '#9ca3af' },

  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  saveBtn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', backgroundColor: '#0ea5e9' },
  saveBtnText: { color: '#fff', fontWeight: '800', letterSpacing: 0.3 },

  secondaryBtn: {
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(148,163,184,0.7)',
  },
  secondaryBtnText: { color: '#e5e7eb', fontWeight: '800', letterSpacing: 0.3 },
});

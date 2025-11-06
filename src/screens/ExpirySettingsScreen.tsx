// src/screens/ExpirySettingsScreen.tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { getExpiryWarningDays, setExpiryWarningDays } from '../settings/expirySettings';
import { refreshExpiryNotifications } from '../notifications';

type Props = NativeStackScreenProps<any>;

export default function ExpirySettingsScreen({ navigation }: Props) {
  const t = useTheme();
  const [days, setDays] = useState<number>(7);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: 'Ajustes de vencimiento' });

    (async () => {
      try {
        const current = await getExpiryWarningDays();
        setDays(current);
      } catch {
        // fallback 7
        setDays(7);
      } finally {
        setLoading(false);
      }
    })();
  }, [navigation]);

  const adjustDays = useCallback((delta: number) => {
    setDays((prev) => {
      const next = Math.min(60, Math.max(1, prev + delta));
      return next;
    });
  }, []);

  const onSave = useCallback(async () => {
    try {
      setSaving(true);
      await setExpiryWarningDays(days);
      // reprogramar notificaciones con el nuevo umbral
      await refreshExpiryNotifications();
      Alert.alert('Guardado', `Te avisaré ${days} día(s) antes de que venzan los productos.`);
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar los ajustes.');
    } finally {
      setSaving(false);
    }
  }, [days, navigation]);

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
          <View style={styles.card}>
            <Text style={styles.title}>Avisos de vencimiento</Text>
            <Text style={styles.subtitle}>
              Define con cuántos días de anticipación quieres recibir una alerta
              cuando un producto esté cerca de vencer.
            </Text>

            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.circleBtn, { opacity: days <= 1 ? 0.4 : 1 }]}
                onPress={() => adjustDays(-1)}
                disabled={days <= 1}
              >
                <Text style={styles.circleBtnText}>−</Text>
              </TouchableOpacity>

              <View style={styles.daysBox}>
                <Text style={styles.daysNumber}>{days}</Text>
                <Text style={styles.daysLabel}>día(s) antes</Text>
              </View>

              <TouchableOpacity
                style={[styles.circleBtn, { opacity: days >= 60 ? 0.4 : 1 }]}
                onPress={() => adjustDays(+1)}
                disabled={days >= 60}
              >
                <Text style={styles.circleBtnText}>＋</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.helper}>
              Rango permitido: entre 1 y 60 días. Solo se notificarán productos con
              fecha de vencimiento conocida.
            </Text>
          </View>

          <TouchableOpacity
            onPress={onSave}
            disabled={saving}
            style={[
              styles.saveBtn,
              { opacity: saving ? 0.6 : 1 },
            ]}
          >
            <Text style={styles.saveBtnText}>
              {saving ? 'Guardando…' : 'Guardar ajustes'}
            </Text>
          </TouchableOpacity>
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
  },
  title: { fontSize: 18, fontWeight: '800', color: '#e5e7eb', marginBottom: 6 },
  subtitle: { fontSize: 13, color: '#cbd5f5', marginBottom: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  circleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.9)',
  },
  circleBtnText: {
    color: '#e5e7eb',
    fontSize: 22,
    fontWeight: '900',
  },
  daysBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  daysNumber: {
    fontSize: 28,
    fontWeight: '900',
    color: '#4ade80',
  },
  daysLabel: {
    marginTop: 4,
    fontSize: 12,
    color: '#cbd5f5',
  },
  helper: {
    marginTop: 16,
    fontSize: 12,
    color: '#9ca3af',
  },
  saveBtn: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#0ea5e9',
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});

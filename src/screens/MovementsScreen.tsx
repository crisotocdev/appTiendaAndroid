// src/screens/MovementsScreen.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Alert, RefreshControl } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import 'dayjs/locale/es';
import { useApp } from '../ui/providers/AppProvider';

type Props = NativeStackScreenProps<any>;

type MovementVM = {
  id: string;
  productId: string;
  type: 'IN' | 'OUT' | 'ADJUST';
  qty: number;
  note: string | null;
  createdAt: string | null; // ISO
};

// === Helpers para casos de uso (preservan this) ===
const invoke = async (uc: any, payload?: any) => {
  if (!uc) return undefined;
  if (typeof uc === 'function') return await uc(payload);
  if (typeof uc.execute === 'function') return await uc.execute.call(uc, payload);
  if (typeof uc.run === 'function') return await uc.run.call(uc, payload);
  return undefined;
};

const invokeFirst = async (candidates: any[], payload?: any) => {
  for (const c of candidates) {
    const res = await invoke(c, payload);
    if (res !== undefined) return res;
  }
  return undefined;
};

export default function MovementsScreen({ route }: Props) {
  const { productId, productName } = route.params;
  const { usecases } = useApp();

  const [data, setData] = useState<MovementVM[]>([]);
  const [loading, setLoading] = useState(false);

  const toVM = useCallback(
    (m: any): MovementVM => {
      const p = m?.props ?? m ?? {};
      return {
        id: String(p.id ?? `${p.type ?? 'ADJUST'}-${p.createdAt ?? Date.now()}`),
        productId: String(p.productId ?? productId),
        type: (p.type ?? 'ADJUST') as MovementVM['type'],
        qty: Number(p.qty ?? 0),
        note: p.note ?? null,
        createdAt: p.createdAt ?? null,
      };
    },
    [productId]
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const u: any = usecases as any;

      // Candidatos típicos de UC para listar movimientos por producto
      const candidates = [
        u?.getMovementsByProduct,
        u?.movements?.byProduct,
        u?.listMovementsByProduct,
        u?.movements?.listByProduct,
        u?.movements?.listForProduct,
      ];

      // Probar primero con string (id) y si no, con objeto { productId }
      const rows =
        (await invokeFirst(candidates, String(productId))) ??
        (await invokeFirst(candidates, { productId: String(productId) }));

      if (!rows) throw new Error('No se encontró un caso de uso para listar movimientos.');

      const list = (rows ?? []).map(toVM);

      list.sort((a, b) => {
        const da = a.createdAt ? Date.parse(a.createdAt) : 0;
        const db = b.createdAt ? Date.parse(b.createdAt) : 0;
        return db - da;
      });

      setData(list);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo cargar el historial.');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [productId, toVM, usecases]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => {};
    }, [load])
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Historial — {productName}</Text>
      <FlatList
        data={data}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        keyExtractor={(it) => it.id}
        ListEmptyComponent={<Text style={styles.empty}>Sin movimientos</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text
              style={[
                styles.type,
                item.type === 'IN' ? styles.in : item.type === 'OUT' ? styles.out : styles.adjust,
              ]}
            >
              {item.type}
            </Text>
            <Text style={styles.qty}>x{item.qty}</Text>
            <Text style={styles.date}>
              {item.createdAt ? dayjs(item.createdAt).locale('es').format('DD/MM/YYYY HH:mm') : '—'}
            </Text>
            {!!item.note && <Text style={styles.note}>{item.note}</Text>}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 10 },
  empty: { textAlign: 'center', color: '#6b7280', marginTop: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  type: { fontWeight: '700', width: 70, textAlign: 'center' },
  in: { color: '#065f46' },
  out: { color: '#991b1b' },
  adjust: { color: '#1f2937' },
  qty: { width: 60 },
  date: { flex: 1, color: '#374151' },
  note: { color: '#6b7280' },
});

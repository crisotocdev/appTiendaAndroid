// src/screens/MovementsScreen.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import 'dayjs/locale/es';

import { MovementRepoSQLite } from '../infrastructure/persistence/sqlite/MovementRepoSQLite';

type Props = NativeStackScreenProps<any>;

type MovementVM = {
  id: string;
  productId: string;
  type: 'IN' | 'OUT' | 'ADJUST';
  qty: number;
  note: string | null;
  createdAt: string | null; // ISO
};

const movementRepo = new MovementRepoSQLite();

export default function MovementsScreen({ route, navigation }: Props) {
  const { productId, productName } = route.params ?? {};

  const [rows, setRows] = useState<MovementVM[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    try {
      const list = await movementRepo.listByProduct(String(productId));

      const mapped: MovementVM[] = (list ?? []).map((m: any) => {
        const p = m?.props ?? m ?? {};
        return {
          id: String(p.id),
          productId: String(p.productId ?? productId),
          type: (p.type ?? 'ADJUST') as MovementVM['type'],
          qty: Number(p.qty ?? 0),
          note: p.note ?? null,
          createdAt: p.createdAt ?? null,
        };
      });

      // Ordenar del más reciente al más antiguo
      mapped.sort((a, b) => {
        const da = a.createdAt ? Date.parse(a.createdAt) : 0;
        const db = b.createdAt ? Date.parse(b.createdAt) : 0;
        return db - da;
      });

      setRows(mapped);
    } catch (e) {
      console.log('[MovementsScreen] load error', e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    navigation.setOptions({
      title: productName ? `Historial — ${productName}` : 'Historial de movimientos',
    });
  }, [navigation, productName]);

  useFocusEffect(
    useCallback(() => {
      load();
      return undefined;
    }, [load])
  );

  const renderItem = ({ item }: { item: MovementVM }) => {
    const sign = item.type === 'OUT' ? '-' : item.type === 'IN' ? '+' : '';
    const badgeLabel =
      item.type === 'IN'
        ? 'ENTRADA'
        : item.type === 'OUT'
        ? 'SALIDA'
        : 'AJUSTE';

    const dateLabel = item.createdAt
      ? dayjs(item.createdAt).locale('es').format('DD/MM/YYYY HH:mm')
      : '—';

    return (
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.date}>{dateLabel}</Text>
          <Text style={styles.qty}>
            {sign}
            {item.qty}
          </Text>
          {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
        </View>
        <Text
          style={[
            styles.badge,
            item.type === 'IN'
              ? styles.inBadge
              : item.type === 'OUT'
              ? styles.outBadge
              : styles.adjustBadge,
          ]}
        >
          {badgeLabel}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {rows.length === 0 && !loading ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>
            Todavía no hay movimientos para este producto.
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(it) => it.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={load} />
          }
          contentContainerStyle={
            rows.length === 0
              ? { flex: 1, justifyContent: 'center' }
              : { paddingVertical: 8 }
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#08141A',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#E5E7EB',
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(24, 50, 66, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(94, 231, 255, 0.35)',
    marginBottom: 8,
    alignItems: 'center',
  },
  date: {
    color: '#CFE8FF',
    fontSize: 12,
    marginBottom: 4,
  },
  qty: {
    color: '#EFFFFB',
    fontSize: 15,
    fontWeight: '700',
  },
  note: {
    color: '#CFE8CF',
    fontSize: 11,
    marginTop: 2,
    opacity: 0.9,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: '800',
    overflow: 'hidden',
  },
  inBadge: {
    backgroundColor: 'rgba(16,185,129,0.20)',
    color: '#6EE7B7',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.7)',
  },
  outBadge: {
    backgroundColor: 'rgba(248,113,113,0.20)',
    color: '#FCA5A5',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.7)',
  },
  adjustBadge: {
    backgroundColor: 'rgba(59,130,246,0.20)',
    color: '#BFDBFE',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.7)',
  },
});

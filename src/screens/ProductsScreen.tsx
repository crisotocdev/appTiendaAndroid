// src/screens/ProductsScreen.tsx
import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl, Alert, Image } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeProvider';
import type { RootStackParamList } from '../navigation';

// SQLite repo fallback (si no hay usecases)
let Repo: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('../infrastructure/persistence/sqlite/ProductRepoSQLite');
  const maybeInstance = mod?.default && typeof mod.default === 'object' ? mod.default : null;
  Repo = maybeInstance ?? (mod?.ProductRepoSQLite ? new mod.ProductRepoSQLite() : null);
} catch {
  Repo = null;
}

type Props = NativeStackScreenProps<RootStackParamList, 'Products'>;

type ProductVM = {
  id: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  sku?: string | null;
  photoUrl?: string | null;
  qty?: number | null;
};

const oneLine = (v: any): string =>
  String(v ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ').replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, '').replace(/\s{2,}/g, ' ').trim();

export default function ProductsScreen({ navigation }: Props) {
  const t = useTheme();
  const [items, setItems] = useState<ProductVM[]>([]);
  const [loading, setLoading] = useState(false);

  const LOW_STOCK = 3;
  const warnColor = ((t.colors as any).warning as string) ?? '#f59e0b';

  const listProducts = useCallback(async (): Promise<ProductVM[]> => {
    if (!Repo?.getAll) return [];
    const rows = await Repo.getAll();
    return (rows ?? []).map((r: any) => {
      const p = r?.props ?? r ?? {};
      return {
        id: String(p.id),
        name: oneLine(p.name ?? p.title ?? 'Producto'),
        brand: oneLine(p.brand ?? ''),
        category: oneLine(p.category ?? ''),
        sku: oneLine(p.sku ?? ''),
        photoUrl: p.photoUrl ?? p.photoURL ?? p.photo ?? p.imageUrl ?? p.photoUri ?? null,
        qty: Number(p.qty ?? 0),
      };
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listProducts();
      setItems(list);
    } catch (e: any) {
      console.error('[Products] load error:', e);
      Alert.alert('Error', e?.message ?? 'No se pudo cargar el inventario.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [listProducts]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onAdjust = async (id: string, delta: number) => {
    try {
      if (!Repo?.adjustStock) throw new Error('adjustStock no disponible');
      await Repo.adjustStock(id, delta);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo ajustar el stock.');
    }
  };

  const onDelete = (id: string, name: string) => {
    Alert.alert('Eliminar', `¿Eliminar "${name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            if (!Repo?.remove) throw new Error('remove no disponible');
            await Repo.remove(String(id));
            await load();
          } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'No se pudo eliminar el producto.');
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: t.colors.background }]}>
      <FlatList
        data={items}
        keyExtractor={(it) => String(it.id)}
        renderItem={({ item }) => {
          const qty = Number(item.qty ?? 0);
          const canDec = qty > 0;
          const isLow = qty <= LOW_STOCK;
          return (
            <View style={{ marginBottom: 12 }}>
              <View style={styles.row}>
                {item.photoUrl ? (
                  <Image source={{ uri: item.photoUrl }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, { backgroundColor: '#eee' }]} />
                )}

                <View style={styles.info}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {item.brand || '—'} · {item.category || '—'} · SKU {item.sku || '—'}
                  </Text>
                </View>

                <View style={styles.actions}>
                  <TouchableOpacity style={[styles.btn, styles.btnGreen]} onPress={() => onAdjust(item.id, +1)}>
                    <Text style={styles.btnTxt}>+1</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, canDec ? styles.btnRed : styles.btnDisabled]}
                    onPress={() => canDec && onAdjust(item.id, -1)}
                    disabled={!canDec}
                  >
                    <Text style={styles.btnTxt}>-1</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text
                style={{
                  marginTop: 6,
                  marginHorizontal: 6,
                  color: isLow ? warnColor : t.colors.textMuted,
                  fontWeight: isLow ? '700' : '400',
                }}
                numberOfLines={1}
              >
                Stock: {qty} {isLow ? '(Bajo stock)' : ''}
              </Text>
            </View>
          );
        }}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={load}
            colors={[t.colors.primary]}
            progressBackgroundColor={t.colors.surface}
          />
        }
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={<Text style={{ textAlign: 'center', color: t.colors.textMuted, marginTop: 80 }}>Sin productos aún. Agrega alguno.</Text>}
      />

      <TouchableOpacity
        style={[styles.fab, { right: 24, bottom: 28, backgroundColor: t.colors.secondary }]}
        onPress={() => (navigation as any).navigate('AddProduct')}
        activeOpacity={0.9}
      >
        <Text style={styles.fabTxt}>＋</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 10, backgroundColor: '#fff',
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4,
  },
  thumb: { width: 42, height: 42, borderRadius: 6, marginRight: 10 },
  info: { flex: 1, width: 0, minWidth: 0, flexShrink: 1 },
  name: { fontSize: 16, fontWeight: '700', color: '#111827', flexShrink: 1, maxWidth: '100%' },
  meta: { fontSize: 12, color: '#6b7280', marginTop: 2, flexShrink: 1, maxWidth: '100%' },
  actions: { flexDirection: 'row', flexShrink: 0, marginLeft: 8 },
  btn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, marginLeft: 6 },
  btnTxt: { color: '#fff', fontWeight: '700' },
  btnGreen: { backgroundColor: '#10b981' },
  btnRed: { backgroundColor: '#ef4444' },
  btnDisabled: { backgroundColor: '#9ca3af' },
  fab: { position: 'absolute', width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', elevation: 6 },
  fabTxt: { color: '#fff', fontSize: 28, lineHeight: 28, marginBottom: 2 },
});

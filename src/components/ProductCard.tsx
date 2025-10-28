// src/components/ProductCard.tsx
import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';

type Props = { item: any };

export default function ProductCard({ item }: Props) {
  const nav = useNavigation() as any;

  // Normaliza shape
  const p = item?.props ?? item ?? {};
  const id: string = String(p.id ?? p.productId ?? '');
  const name: string = String(p.name ?? p.title ?? 'Producto');
  const brand: string | null = p.brand ?? p.marca ?? null;
  const category: string | null = p.category ?? p.categoria ?? null;
  const sku: string | null = p.sku ?? null;
  const unit: string | null = p.unit ?? null;

  const qtyNum: number = Number(p.qty ?? p.totalQty ?? p.stock ?? p.quantity ?? 0);
  const daysToExpiry: number | null =
    typeof p.daysToExpiry === 'number' ? p.daysToExpiry : null;

  const photo: string | null =
    p.photoUrl ?? p.photoURL ?? p.photoUri ?? p.photo ?? p.imageUrl ?? null;

  // Deriva status si no viene
  let status: 'expired' | 'expiring' | 'low' | 'ok' =
    p.status ?? ((): 'expired' | 'expiring' | 'low' | 'ok' => {
      if (daysToExpiry != null && daysToExpiry <= 0) return 'expired';
      if (daysToExpiry != null && daysToExpiry <= 7) return 'expiring';
      if (qtyNum <= 3) return 'low';
      return 'ok';
    })();

  const badgeColor =
    status === 'expired'
      ? '#ef4444'
      : status === 'expiring'
      ? '#f59e0b'
      : status === 'low'
      ? '#3b82f6'
      : '#10b981';

  const badgeText =
    status === 'expired'
      ? 'Vencido'
      : status === 'expiring'
      ? (daysToExpiry != null ? `Vence en ${daysToExpiry}d` : 'Por vencer')
      : status === 'low'
      ? 'Stock bajo'
      : 'OK';

  return (
    <View style={styles.card}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.photo} />
      ) : (
        <View style={[styles.photo, styles.placeholder]} />
      )}

      {/* Columna de texto — CLAVES: flex:1 + minWidth:0 y los Text con flexShrink:1 */}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
          {name}
        </Text>

        <Text style={styles.meta} numberOfLines={1} ellipsizeMode="tail">
          {(brand ?? '—')} · {(category ?? '—')} · SKU {(sku ?? '—')}
        </Text>

        <Text style={styles.qty} numberOfLines={1} ellipsizeMode="tail">
          Stock: {qtyNum} {unit ?? ''}
        </Text>
      </View>

      {/* Columna derecha — ancho fijo + flexShrink:0 para no aplastar el texto */}
      <View style={styles.aside}>
        <View style={[styles.badge, { backgroundColor: badgeColor }]}>
          <Text style={styles.badgeText} numberOfLines={1} ellipsizeMode="clip">
            {badgeText}
          </Text>
        </View>

        {/* Si prefieres NO tener este botón (porque ya tienes el "Hist." azul afuera),
            puedes comentar este bloque. */}
        <TouchableOpacity
          onPress={() =>
            nav.navigate('Movements', { productId: id, productName: name })
          }
          style={styles.histBtn}
          activeOpacity={0.9}
        >
          <Text style={styles.histBtnText}>Historial</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const RIGHT_BOX_WIDTH = 110;

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    marginBottom: 10,
  },
  photo: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#eee',
    marginRight: 10, // en vez de gap
  },
  placeholder: { backgroundColor: '#f3f4f6' },

  info: { flex: 1, minWidth: 0 }, // imprescindible

  name: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    flexShrink: 1,            // <-- fuerza elipsis si falta ancho
    maxWidth: '100%',
  },
  meta: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
    flexShrink: 1,            // <-- idem
    maxWidth: '100%',
  },
  qty: {
    fontSize: 13,
    color: '#374151',
    marginTop: 6,
    flexShrink: 1,            // <-- idem
    maxWidth: '100%',
  },

  // Columna derecha con ancho fijo
  aside: {
    width: RIGHT_BOX_WIDTH,
    marginLeft: 8,
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-end',
    maxWidth: '100%',
  },
  badgeText: { color: 'white', fontWeight: '700', fontSize: 12 },

  histBtn: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  histBtnText: { fontWeight: '600', color: '#111827', fontSize: 12 },
});

// src/screens/AddProductScreen.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  Image, Alert, ScrollView, ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useApp } from '../ui/providers/AppProvider';

// Repos locales
// eslint-disable-next-line @typescript-eslint/no-var-requires
const RepoMod = require('../infrastructure/persistence/sqlite/ProductRepoSQLite');
const Repo = RepoMod?.default ?? RepoMod;

let SQL: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  SQL = require('../infrastructure/persistence/sqlite/SQLiteClient');
} catch { SQL = null; }

type Props = NativeStackScreenProps<any>;

export default function AddProductScreen({ navigation, route }: Props) {
  const { usecases } = useApp() as any;
  const editingId: string | undefined = route?.params?.productId;

  const [loading, setLoading] = useState(false);
  const [supportsExpiry, setSupportsExpiry] = useState<boolean | null>(null);

  // Campos
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [sku, setSku] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [minStock, setMinStock] = useState('0');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('0');
  const [expiryDate, setExpiryDate] = useState(''); // UI; se guarda si la columna existe

  // ===== Helpers =====
  const toInt = (v: string, def = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  };

  // normaliza DD-MM-YYYY / DD/MM/YYYY / ISO a 'YYYY-MM-DD'
  const normalizeExpiryInput = (raw: string): string | null => {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    const m = s.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
    if (m) {
      const [, dd, mm, yyyy] = m;
      return `${yyyy}-${mm}-${dd}`;
    }
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const askGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Otorga permiso a la galería para seleccionar una imagen.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: false });
    if (!res.canceled) setPhotoUri(res.assets[0].uri);
  };

  const askCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Otorga permiso a la cámara.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false });
    if (!res.canceled) setPhotoUri(res.assets[0].uri);
  };

  const mapFromRow = (r: any) => {
    const p = r?.props ?? r ?? {};
    setName(String(p.name ?? ''));
    setBrand(String(p.brand ?? ''));
    setCategory(String(p.category ?? ''));
    setSku(String(p.sku ?? ''));
    setUnit(String(p.unit ?? 'pcs'));
    setMinStock(String(p.minStock ?? p.minstock ?? 0));
    setPhotoUri(p.photoUrl ?? p.photoUri ?? p.photo_url ?? null);
    setQuantity(String(p.qty ?? 0));
    // vencimiento se rellena aparte desde SQL (si existe columna)
  };

  const detectSupportsExpiry = useCallback(() => {
    try {
      if (!SQL?.all) return false;
      const cols = SQL.all?.(`PRAGMA table_info(products)`) ?? [];
      const names = (cols as any[]).map((c) => String(c.name ?? '').toLowerCase());
      // aceptamos next_expiry o nextExpiry
      return names.includes('next_expiry') || names.includes('nextexpiry');
    } catch {
      return false;
    }
  }, []);

  const loadExpiryFromSQL = useCallback((id: string) => {
    try {
      if (!SQL?.one || !supportsExpiry) return;
      // lee ambas variantes de columna por si acaso
      const row =
        SQL.one?.(
          `SELECT next_expiry as d1, nextExpiry as d2
           FROM products WHERE id=?`,
          [String(id)]
        ) ?? null;
      const val = row?.d1 ?? row?.d2 ?? null;
      if (val) {
        // mostramos en formato YYYY-MM-DD para mantener coherencia
        const norm = normalizeExpiryInput(String(val));
        if (norm) setExpiryDate(norm);
      }
    } catch {
      // ignorar
    }
  }, [supportsExpiry]);

  const loadForEdit = useCallback(async () => {
    if (!editingId) return;
    try {
      setLoading(true);
      const row = (await Repo.getById?.(String(editingId))) ?? null;
      if (!row) {
        Alert.alert('Aviso', 'No se encontró el producto.');
        return;
      }
      mapFromRow(row);
      // si hay columna de vencimiento, precargarla
      if (supportsExpiry) loadExpiryFromSQL(String(editingId));
    } catch (e: any) {
      console.error('[AddProduct] load error:', e);
      Alert.alert('Error', e?.message ?? 'No se pudo cargar el producto.');
    } finally {
      setLoading(false);
    }
  }, [editingId, supportsExpiry, loadExpiryFromSQL]);

  useEffect(() => {
    const ok = detectSupportsExpiry();
    setSupportsExpiry(ok);
  }, [detectSupportsExpiry]);

  useEffect(() => {
    loadForEdit();
  }, [loadForEdit]);

  // ===== Guardado vía UC o Repo (opción C) =====
  const tryUsecaseSave = useCallback(async (payload: any) => {
    const u: any = usecases;
    const candidates = [
      u?.products?.upsert,
      u?.upsertProduct,
      u?.createProduct,
      u?.products?.create,
    ].filter(Boolean);

    for (const c of candidates) {
      try {
        if (typeof c === 'function') {
          const res = await c(payload);
          return res?.id ?? payload.id ?? null;
        }
        if (typeof c?.execute === 'function') {
          const res = await c.execute.call(c, payload);
          return res?.id ?? payload.id ?? null;
        }
      } catch {
        // probar siguiente
      }
    }
    return null;
  }, [usecases]);

  const persistExpiryIfPossible = useCallback(async (id: string, input: string) => {
    if (!supportsExpiry || !SQL?.run) return;
    const norm = normalizeExpiryInput(input);
    if (!norm) return;
    try {
      SQL.run?.(
        `UPDATE products
           SET next_expiry = ?,
               updatedAt = COALESCE(updatedAt, CURRENT_TIMESTAMP)
         WHERE id = ?`,
        [norm, String(id)]
      );
    } catch (e) {
      // si falla, no bloqueamos el flujo
      console.warn('[AddProduct] persistExpiry failed:', e);
    }
  }, [supportsExpiry]);

  const onSave = async () => {
    try {
      const trimmed = name.trim();
      if (!trimmed) {
        Alert.alert('Falta nombre', 'Ingresa el nombre del producto');
        return;
      }
      setLoading(true);

      const qtyVal = toInt(quantity, 0);
      const payload: any = {
        id: editingId ?? undefined,
        name: trimmed,
        brand: brand.trim() || null,
        category: category.trim() || null,
        sku: sku.trim() || null,
        unit: unit.trim() || null,
        minStock: toInt(minStock, 0),
        photoUrl: photoUri,
        qty: qtyVal,
      };

      // 1) intentar via usecase
      let savedId: string | null = await tryUsecaseSave(payload);

      // 2) repo local
      if (!savedId) {
        if (typeof Repo.upsert === 'function') {
          const saved = await Repo.upsert(payload);
          savedId = String(saved?.id ?? payload.id ?? '');
        } else if (typeof Repo.createProduct === 'function') {
          const newId: string = await Repo.createProduct(payload);
          if (qtyVal !== 0 && typeof Repo.updateProductQty === 'function') {
            await Repo.updateProductQty(newId, Math.max(0, qtyVal));
          }
          savedId = newId;
        } else {
          throw new Error('No hay método disponible para guardar (upsert/createProduct).');
        }
      }

      // 3) si existe columna, persistir vencimiento
      if (savedId) {
        await persistExpiryIfPossible(savedId, expiryDate);
      }

      console.log('[AddProduct] guardado id=', savedId ?? editingId);
      Alert.alert('OK', editingId ? 'Cambios guardados' : 'Producto creado');
      navigation.goBack();
    } catch (e: any) {
      console.error('[AddProduct] error:', e);
      Alert.alert('Error', e?.message ?? 'No se pudo guardar el producto.');
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async () => {
    if (!editingId) return;
    Alert.alert('Eliminar', '¿Eliminar este producto?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            setLoading(true);
            if (typeof Repo.remove === 'function') {
              await Repo.remove(String(editingId));
            } else if (usecases?.deleteProduct) {
              const del = usecases.deleteProduct;
              if (typeof del === 'function') await del(String(editingId));
              else if (typeof del?.execute === 'function') await del.execute.call(del, String(editingId));
            }
            Alert.alert('OK', 'Eliminado');
            navigation.goBack();
          } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'No se pudo eliminar.');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const headerTitle = useMemo(
    () => (editingId ? 'Editar producto' : 'Nuevo producto'),
    [editingId]
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>{headerTitle}</Text>

      <Text style={styles.section}>Datos del producto</Text>
      <TextInput style={styles.input} placeholder="Nombre *" value={name} onChangeText={setName} />
      <TextInput style={styles.input} placeholder="Marca" value={brand} onChangeText={setBrand} />
      <TextInput style={styles.input} placeholder="Categoría" value={category} onChangeText={setCategory} />
      <TextInput style={styles.input} placeholder="SKU / Código" value={sku} onChangeText={setSku} />
      <TextInput style={styles.input} placeholder="Unidad (pcs, kg, lt…)" value={unit} onChangeText={setUnit} />
      <TextInput
        style={styles.input}
        placeholder="Stock mínimo (alerta)"
        keyboardType="numeric"
        value={minStock}
        onChangeText={setMinStock}
      />

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
        <TouchableOpacity style={styles.photoBtn} onPress={askCamera} disabled={loading}>
          <Text style={styles.photoBtnTxt}>{photoUri ? 'Cambiar (Cámara)' : 'Tomar foto'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.photoBtn, { backgroundColor: '#374151' }]} onPress={askGallery} disabled={loading}>
          <Text style={styles.photoBtnTxt}>Elegir de galería</Text>
        </TouchableOpacity>
      </View>

      {photoUri ? <Image source={{ uri: photoUri }} style={styles.photo} /> : null}

      <Text style={styles.section}>Stock</Text>
      <TextInput
        style={styles.input}
        placeholder="Cantidad"
        keyboardType="numeric"
        value={quantity}
        onChangeText={setQuantity}
      />

      <Text style={styles.section}>
        Vencimiento {supportsExpiry === false ? '(no se persistirá — falta columna)' : ''}
      </Text>
      <TextInput
        style={styles.input}
        placeholder={supportsExpiry === false
          ? 'DD-MM-YYYY / DD/MM/YYYY / ISO (solo muestra)'
          : 'DD-MM-YYYY / DD/MM/YYYY / ISO'
        }
        value={expiryDate}
        onChangeText={setExpiryDate}
      />

      <TouchableOpacity
        style={[styles.saveBtn, loading && { opacity: 0.6 }]}
        onPress={onSave}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveTxt}>{editingId ? 'Guardar cambios' : 'Guardar'}</Text>}
      </TouchableOpacity>

      {editingId ? (
        <TouchableOpacity
          style={[styles.deleteBtn, loading && { opacity: 0.6 }]}
          onPress={onDelete}
          disabled={loading}
        >
          <Text style={styles.deleteTxt}>Eliminar</Text>
        </TouchableOpacity>
      ) : null}

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#fff' },
  header: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 6 },
  section: { fontSize: 15, fontWeight: '700', marginTop: 10, marginBottom: 6, color: '#111827' },
  input: { backgroundColor: '#f3f4f6', padding: 12, borderRadius: 10, marginBottom: 10 },
  photoBtn: { backgroundColor: '#111827', padding: 12, borderRadius: 10, alignItems: 'center', flex: 1 },
  photoBtnTxt: { color: '#fff', fontWeight: '700' },
  photo: { width: 128, height: 128, borderRadius: 10, marginTop: 10, alignSelf: 'flex-start' },
  saveBtn: { backgroundColor: '#2563eb', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 16 },
  saveTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  deleteBtn: { backgroundColor: '#ef4444', padding: 12, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  deleteTxt: { color: '#fff', fontWeight: '800' },
});

// src/screens/ProductForm.tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ScrollView,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useTheme } from '../theme/ThemeProvider';
import { useApp } from '../ui/providers/AppProvider';
import { refreshExpiryNotifications } from '../notifications';

// Evitamos fricciones de tipos con navigate/route por ahora
type Props = NativeStackScreenProps<any>;

const oneLine = (v: any): string =>
  String(v ?? '')
    .replace(/[\r\n\u2028\u2029]+/g, ' ')
    .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

// ===== helpers para UCs (preservan this) =====
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

// Toma el primer valor definido/truey
const firstDefined = (...xs: any[]) => xs.find(Boolean);

// Guarda la imagen en un directorio propio (documentDirectory si existe; si no, cacheDirectory)
async function persistImage(uri: string): Promise<string> {
  try {
    const baseDir =
      ((FileSystem as any).documentDirectory as string | undefined) ??
      ((FileSystem as any).cacheDirectory as string | undefined);

    if (!baseDir) return uri; // fallback duro si no hay rutas disponibles

    const dir = `${baseDir}images/`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
    const name = (uri.split('/').pop() || `img_${Date.now()}.jpg`).replace(/\?.*$/, '');
    const dest = dir + name;

    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  } catch {
    return uri; // si algo falla, usa la original
  }
}

// Lee la fecha de vencimiento desde el objeto producto y la normaliza a "YYYY-MM-DD"
function pickExpiryFromProduct(p: any): string {
  const raw =
    p?.nextExpiry ??
    p?.next_expiry ??
    p?.expiry ??
    p?.expirationDate ??
    p?.expiryDate ??
    p?.vence ??
    p?.fechaVencimiento ??
    null;

  if (!raw) return '';

  if (raw instanceof Date) {
    return raw.toISOString().slice(0, 10);
  }

  const s = String(raw).trim();
  if (!s) return '';

  // Si viene con hora: "2025-11-30T00:00:00...", me quedo solo con la fecha
  const base = s.split(/[T\s]/)[0];

  // DD/MM/YYYY o DD-MM-YYYY → YYYY-MM-DD
  const m = base.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm}-${dd}`;
  }

  return base; // ej: "2025-11-30"
}

export default function ProductForm({ route, navigation }: Props) {
  const t = useTheme();
  const { usecases } = useApp();

  const productId: string | undefined = route?.params?.productId;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [sku, setSku] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [expiry, setExpiry] = useState(''); // YYYY-MM-DD o vacío

  const isEdit = !!productId;

  // Cargar si edita
  const loadProduct = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    try {
      const u: any = usecases as any;
      const res = await invokeFirst(
        [u?.getProductById, u?.getProduct, u?.products?.get, u?.products?.byId],
        String(productId)
      );
      if (res === undefined)
        throw new Error('No se encontró un caso de uso para obtener producto por ID.');

      const p = (res?.props ?? res) ?? {};
      setName(oneLine(p.name ?? p.title ?? ''));
      setBrand(oneLine(p.brand ?? p.marca ?? ''));
      setCategory(oneLine(p.category ?? p.categoria ?? ''));
      setSku(oneLine(p.sku ?? ''));
      // ⬇️ incluye photoUri además de otros alias
      setPhotoUrl(
        p.photoUrl ?? p.photoURL ?? p.photo ?? p.imageUrl ?? p.photoUri ?? null
      );
      // Fecha de vencimiento (normalizada a YYYY-MM-DD para mostrarla)
      setExpiry(pickExpiryFromProduct(p));
    } catch (e) {
      Alert.alert('Error', (e as Error)?.message ?? 'No se pudo cargar el producto.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [productId, usecases, navigation]);

  useEffect(() => {
    navigation.setOptions({ title: isEdit ? 'Editar producto' : 'Nuevo producto' });
    loadProduct();
  }, [isEdit, loadProduct, navigation]);

  // Imagen: galería
  const pickImage = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesito acceso a tus fotos.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      quality: 0.85,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (!res.canceled && res.assets?.[0]?.uri) {
      const local = await persistImage(res.assets[0].uri);
      setPhotoUrl(local);
    }
  }, []);

  // Imagen: cámara
  const takePhoto = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesito acceso a la cámara.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.85,
    });
    if (!res.canceled && res.assets?.[0]?.uri) {
      const local = await persistImage(res.assets[0].uri);
      setPhotoUrl(local);
    }
  }, []);

  const onSave = useCallback(async () => {
    try {
      if (!oneLine(name)) {
        Alert.alert('Completa el nombre', 'El nombre es obligatorio.');
        return;
      }
      setSaving(true);

      const u: any = usecases as any;

      // normalizamos un poco la fecha para el payload (puede ir vacía)
      const expiryStr = oneLine(expiry);      // '' o '2025-12-31'
      const expiryOrNull = expiryStr || null; // null si está vacía

      // payload súper compatible (mapea alias comunes)
      const payload = {
        id: productId ?? undefined,
        name: oneLine(name),
        title: oneLine(name),
        brand: oneLine(brand),
        marca: oneLine(brand),
        category: oneLine(category),
        categoria: oneLine(category),
        sku: oneLine(sku),
        photoUrl: photoUrl ?? null,
        photoURL: photoUrl ?? null,
        photoUri: photoUrl ?? null,
        photo: photoUrl ?? null,

        // 👇 vencimiento con los alias que el repo entiende
        nextExpiry: expiryOrNull,
        next_expiry: expiryOrNull,
        expiry: expiryOrNull,
        expirationDate: expiryOrNull,
        expiryDate: expiryOrNull,
      };

      console.log('[ProductForm.onSave] payload =', payload);

      if (isEdit) {
        // Intento UPDATE explícito; si no existe, upsert/save o última instancia create
        const updateUC = firstDefined(
          u?.updateProduct,
          u?.products?.update,
          u?.editProduct,
          u?.saveProduct,
          u?.upsertProduct,
          u?.setProduct,
          u?.putProduct
        );

        if (updateUC) {
          await invoke(updateUC, payload);
        } else {
          const upsertOrCreate =
            firstDefined(
              u?.upsertProduct,
              u?.saveProduct,
              u?.createOrUpdateProduct,
              u?.addOrUpdateProduct,
              u?.products?.upsert,
              u?.products?.save
            ) ||
            firstDefined(
              u?.createProduct,
              u?.products?.create,
              u?.addProduct,
              u?.products?.add
            );

          if (!upsertOrCreate) throw new Error('No hay caso de uso para actualizar producto.');
          await invoke(upsertOrCreate, payload);
        }
      } else {
        // Crear
        const createUC = firstDefined(
          u?.createProduct,
          u?.products?.create,
          u?.addProduct,
          u?.products?.add,
          u?.saveProduct,     // algunos repos usan "save" para crear
          u?.upsertProduct
        );
        if (!createUC) throw new Error('No hay caso de uso para crear producto.');
        await invoke(createUC, payload);
      }

      // 👇 Reprogramar notificaciones con los datos actuales
      try {
        await refreshExpiryNotifications();
      } catch (err) {
        console.log('[ProductForm] error al refrescar notificaciones', err);
      }

      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', (e as Error)?.message ?? 'No se pudo guardar el producto.');
    } finally {
      setSaving(false);
    }
  }, [isEdit, productId, name, brand, category, sku, photoUrl, expiry, usecases, navigation]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: t.colors.background }]}
      contentContainerStyle={{ padding: 16 }}
    >
      <Text style={styles.title}>{isEdit ? 'Editar producto' : 'Nuevo producto'}</Text>

      {/* Foto */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={styles.photo} />
        ) : (
          <View style={[styles.photo, { backgroundColor: '#e5e7eb' }]} />
        )}
        <View style={{ gap: 8 }}>
          <TouchableOpacity onPress={pickImage} style={[styles.btn, { backgroundColor: '#dc2626' }]}>
            <Text style={styles.btnTxt}>{photoUrl ? 'Cambiar foto' : 'Agregar foto'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={takePhoto} style={[styles.btn, { backgroundColor: '#0ea5e9' }]}>
            <Text style={styles.btnTxt}>Tomar foto</Text>
          </TouchableOpacity>
          {!!photoUrl && (
            <TouchableOpacity onPress={() => setPhotoUrl(null)} style={[styles.btn, { backgroundColor: '#6b7280' }]}>
              <Text style={styles.btnTxt}>Quitar</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Campos */}
      <Text style={styles.label}>Nombre *</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        style={styles.input}
        placeholder="Ej. Café en grano"
      />

      <Text style={styles.label}>Marca</Text>
      <TextInput
        value={brand}
        onChangeText={setBrand}
        style={styles.input}
        placeholder="Opcional"
      />

      <Text style={styles.label}>Categoría</Text>
      <TextInput
        value={category}
        onChangeText={setCategory}
        style={styles.input}
        placeholder="Opcional"
      />

      <Text style={styles.label}>SKU</Text>
      <TextInput
        value={sku}
        onChangeText={setSku}
        style={styles.input}
        placeholder="Opcional"
      />

      {/* Fecha de vencimiento */}
      <Text style={styles.label}>Fecha de vencimiento</Text>
      <TextInput
        value={expiry}
        onChangeText={setExpiry}
        style={styles.input}
        placeholder="YYYY-MM-DD (opcional)"
      />

      {/* Botones */}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
        <TouchableOpacity
          onPress={onSave}
          disabled={saving || loading}
          style={[styles.btnBig, { backgroundColor: '#0ea5e9', opacity: saving || loading ? 0.6 : 1 }]}
        >
          <Text style={styles.btnTxt}>Guardar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.btnBig, { backgroundColor: '#6b7280' }]}
        >
          <Text style={styles.btnTxt}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  label: { marginTop: 10, marginBottom: 6, color: '#374151', fontWeight: '600' },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  photo: { width: 96, height: 96, borderRadius: 12 },
  btn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  btnBig: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  btnTxt: { color: '#fff', fontWeight: '700' },
});

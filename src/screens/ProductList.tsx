// src/screens/ProductList.tsx
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Image,
  Modal,
  TextInput,
  Platform,
  ScrollView,
  Pressable,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../ui/providers/AppProvider';
import productRepo from '../infrastructure/persistence/sqlite/ProductRepoSQLite';
import * as ImagePicker from 'expo-image-picker';

type Props = NativeStackScreenProps<any>;

type ProductVM = {
  id: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  sku?: string | null;
  photoUrl?: string | null;
  qty?: number | null;
  nextExpiry?: string | null;
  daysToExpiry?: number | null;
};

const SKELETON_COUNT = 5;

/** Utils **/
const oneLine = (v: any): string =>
  String(v ?? '').replace(/[\r\n\u2028\u2029]/g, ' ').trim();

function pickExpiry(q: any): string | null {
  const keys = [
    'nextExpiry','expiry','expiresAt','expirationDate',
    'vence','fechaVencimiento','expiry_date','expDate','bestBefore'
  ];
  for (const k of keys) {
    const v = q?.[k];
    if (typeof v === 'string' && v) return v;
    if (v instanceof Date) return v.toISOString();
  }
  return null;
}

function daysTo(dateIso?: string | null) {
  if (!dateIso) return null;
  const d = new Date(dateIso); if (isNaN(+d)) return null;
  const today = new Date();
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((+b - +a) / 86400000);
}

/** Colores para el pill de vencimiento (sin dependencias) **/
type ExpiryColors = { bg: string; border: string };
function expiryColors(n: number): ExpiryColors {
  if (n < 0)  return { bg: 'rgba(255,0,0,0.18)',    border: 'rgba(255,0,0,0.35)'    }; // vencido
  if (n === 0) return { bg: 'rgba(255,165,0,0.22)', border: 'rgba(255,165,0,0.45)' }; // hoy
  if (n <= 7)  return { bg: 'rgba(255,215,0,0.18)', border: 'rgba(255,215,0,0.35)' }; // < 1 semana
  return { bg: 'rgba(16,185,129,0.20)', border: 'rgba(16,185,129,0.45)' };            // ok
}

// Badge completo (label + colores), siempre devuelve algo
function badgeFor(days: number | null) {
  if (days == null) {
    return { label: 'Sin vencimiento', bg: 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.18)', accent: 'rgba(255,255,255,0.12)' };
  }
  if (days < 0) {
    return { label: `Vencido ${Math.abs(days)}d`, bg: 'rgba(255,0,0,0.18)', border: 'rgba(255,0,0,0.35)', accent: 'rgba(255,99,99,0.50)' };
  }
  if (days === 0) {
    return { label: 'Vence hoy', bg: 'rgba(255,165,0,0.22)', border: 'rgba(255,165,0,0.45)', accent: 'rgba(255,165,0,0.55)' };
  }
  if (days <= 7) {
    return { label: `Vence en ${days}d`, bg: 'rgba(255,215,0,0.18)', border: 'rgba(255,215,0,0.35)', accent: 'rgba(255,215,0,0.50)' };
  }
  return { label: `Vence en ${days}d`, bg: 'rgba(16,185,129,0.20)', border: 'rgba(16,185,129,0.45)', accent: 'rgba(16,185,129,0.50)' };
}

// Ejecuta funciones o métodos en objetos { execute/run/call/... }
function methodRunner(u: any): ((arg?: any) => Promise<any>) | null {
  if (typeof u === 'function') return (arg?: any) => u(arg);
  if (u && typeof u === 'object') {
    const m = ['execute', 'run', 'call', 'handler', 'invoke', 'mutate', 'perform'].find(
      (k) => typeof (u as any)[k] === 'function'
    );
    if (m) return (arg?: any) => (u as any)[m](arg);
  }
  return null;
}

/** Creación **/
function pickCreateFn(app: any) {
  const uc = app?.usecases;
  const candidates = [
    app?.createProduct, app?.actions?.createProduct,
    app?.addProduct, app?.actions?.addProduct,
    app?.upsertProduct, app?.actions?.upsertProduct,
    uc?.createProduct, uc?.addProduct, uc?.upsertProduct,
    uc?.products?.create, uc?.products?.add, uc?.products?.upsert,
    uc?.product?.create, uc?.product?.add,
    app?.products?.create, app?.repo?.products?.create,
    app?.repositories?.products?.create,
    app?.service?.products?.create, app?.api?.products?.create, app?.db?.products?.create,
  ];
  for (const c of candidates) {
    const r = methodRunner(c);
    if (r) return r;
  }
  function walk(obj: any, depth = 0): any {
    if (!obj || typeof obj !== 'object' || depth > 3) return null;
    for (const [k, v] of Object.entries(obj)) {
      if (/create|add|upsert/i.test(k) && /product/i.test(k)) {
        const r = methodRunner(v); if (r) return r;
      }
      if (v && typeof v === 'object') { const w = walk(v, depth + 1); if (w) return w; }
    }
    return null;
  }
  return walk(uc) || null;
}

/** Guardar (update/upsert) **/
function pickSaveFn(app: any) {
  const uc = app?.usecases;
  const candidates = [
    app?.upsertProduct, app?.updateProduct,
    app?.actions?.upsertProduct, app?.actions?.updateProduct,
    uc?.upsertProduct, uc?.updateProduct,
    uc?.products?.upsert, uc?.products?.update,
    app?.products?.upsert, app?.products?.update,
    app?.repo?.products?.upsert, app?.repositories?.products?.upsert,
  ];
  for (const c of candidates) {
    const r = methodRunner(c);
    if (r) return r;
  }
  function walk(obj: any, depth = 0): any {
    if (!obj || typeof obj !== 'object' || depth > 3) return null;
    for (const [k, v] of Object.entries(obj)) {
      if (/(upsert|update)/i.test(k) && /product/i.test(k)) {
        const r = methodRunner(v); if (r) return r;
      }
      if (v && typeof v === 'object') { const w = walk(v, depth + 1); if (w) return w; }
    }
    return null;
  }
  return walk(uc) || null;
}

/** Listado **/
function pickListFn(app: any) {
  const uc = app?.usecases;
  const candidates = [
    uc?.listProducts, uc?.getProducts, uc?.fetchProducts,
    uc?.products?.list, uc?.products?.getAll, uc?.products?.fetchAll,
    uc?.product?.list, uc?.inventory?.listProducts,
    app?.listProducts, app?.fetchProducts,
    app?.repo?.products?.list, app?.repositories?.products?.list,
  ];
  for (const c of candidates) {
    const r = methodRunner(c);
    if (r) return r;
  }
  function walk(obj: any, depth = 0): any {
    if (!obj || typeof obj !== 'object' || depth > 3) return null;
    for (const [k, v] of Object.entries(obj)) {
      if (/(list|get|fetch)/i.test(k) && /product/i.test(k)) {
        const r = methodRunner(v); if (r) return r;
      }
      if (v && typeof v === 'object') { const w = walk(v, depth + 1); if (w) return w; }
    }
    return null;
  }
  return walk(uc) || null;
}

function extractList(res: any): any[] {
  if (Array.isArray(res)) return res;
  const flats = [res?.items, res?.products, res?.rows, res?.results, res?.list, res?.value, res?.values, res?.payload, res?.data];
  for (const a of flats) if (Array.isArray(a)) return a;
  const d = res?.data;
  if (d) {
    const nested = [d?.items, d?.products, d?.rows, d?.results, d?.list, d?.value, d?.values, d?.payload];
    for (const a of nested) if (Array.isArray(a)) return a;
  }
  if (res && typeof res === 'object') {
    if (Array.isArray(res?.value)) return res.value;
    if (Array.isArray(res?.result)) return res.result;
    if (res?.count && Array.isArray(res?.items)) return res.items;
  }
  if (res && typeof res === 'object') {
    for (const v of Object.values(res)) {
      if (Array.isArray(v)) return v;
      if (v && typeof v === 'object') {
        for (const vv of Object.values(v)) {
          if (Array.isArray(vv)) return vv;
        }
      }
    }
  }
  return [];
}

function preview10(obj: any) {
  if (!obj || typeof obj !== 'object') return obj;
  const o: any = {};
  Object.keys(obj).slice(0, 10).forEach(k => (o[k] = (obj as any)[k]));
  return o;
}

async function tryListWithPayloads(fn: Function) {
  const trials: any[] = [undefined, {}, { limit: 200 }, { page: 1 }, null];
  let last: any = null;
  for (const t of trials) {
    try {
      // @ts-ignore
      const res = t === undefined ? await fn() : await fn(t);
      const arr = extractList(res);
      console.log('[ProductList] list returned len=', Array.isArray(arr) ? arr.length : 'n/a', 'sample0=', preview10(arr?.[0]));
      if (Array.isArray(arr)) return arr;
    } catch (e) { last = e; }
  }
  throw last ?? new Error('No pude obtener la lista de productos');
}

/** Stock (ajuste delta / set qty) **/
function pickUpdateQtyFn(app: any) {
  const uc = app?.usecases;
  const c = [
    uc?.updateProduct, uc?.products?.update, uc?.product?.update,
    uc?.products?.setQty, uc?.product?.setQty,
    uc?.inventory?.setQty, uc?.stock?.set,
    app?.updateProduct, app?.products?.update,
    app?.repo?.products?.update, app?.repositories?.products?.update,
  ];
  for (const cand of c) { const r = methodRunner(cand); if (r) return r; }
  function walk(o: any, d = 0): any {
    if (!o || typeof o !== 'object' || d > 3) return null;
    for (const [k, v] of Object.entries(o)) {
      if (/(update|set)/i.test(k) && /(product|stock|qty|quantity)/i.test(k)) {
        const r = methodRunner(v); if (r) return r;
      }
      if (v && typeof v === 'object') { const w = walk(v, d + 1); if (w) return w; }
    }
    return null;
  }
  return walk(uc) || null;
}

async function tryUpdateQtyWithPayloads(
  run: (a?: any) => Promise<any>,
  id: string,
  qty: number,
  row?: any
) {
  const base = row?.props ?? row ?? {};
  const trials = [
    { id, qty }, { productId: id, qty },
    { id, quantity: qty }, { productId: id, quantity: qty },
    { id, stock: qty }, { product: { id, qty } },
    { ...base, id, qty },
  ];
  let last: any = null;
  for (const t of trials) { try { await run(t); return; } catch (e) { last = e; } }
  throw last ?? new Error('No pude actualizar qty con los formatos probados');
}

/** Componente **/
export default function ProductList({ navigation }: Props) {
  const app = useApp() as any;

  // Estado local - listado
  const [listState, setListState] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Overlay de borrados
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  // Estado local - modal de creación
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBrand, setNewBrand] = useState('');
  const [newSku, setNewSku] = useState('');
  const [newQty, setNewQty] = useState<string>('0');
  const [newExpiry, setNewExpiry] = useState(''); // YYYY-MM-DD
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Estado local - modal de edición
  const [showEdit, setShowEdit] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editBrand, setEditBrand] = useState('');
  const [editSku, setEditSku] = useState('');
  const [editQty, setEditQty] = useState<string>('0');
  const [editExpiry, setEditExpiry] = useState('');
  const [editPhotoUri, setEditPhotoUri] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Fallbacks expuestos por provider
  const reload =
    app?.reloadProducts ??
    app?.refreshProducts ??
    app?.actions?.reloadProducts ??
    app?.actions?.refreshProducts ??
    app?.fetchProducts;

  // Fuente de datos “segura”
  const rawProducts: any[] =
    (Array.isArray(listState) && listState.length > 0) ? listState
    : Array.isArray(app?.products) ? app.products
    : Array.isArray(app?.state?.products) ? app.state.products
    : [];

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const listFn = pickListFn(app);
      if (typeof listFn === 'function') {
        const arr = await tryListWithPayloads(listFn);
        setListState(arr || []);
      } else if (typeof reload === 'function') {
        await reload();
        const fallback =
          Array.isArray(app?.products) ? app.products :
          Array.isArray(app?.state?.products) ? app.state.products : [];
        setListState(fallback);
      } else {
        const fallback =
          Array.isArray(app?.products) ? app.products :
          Array.isArray(app?.state?.products) ? app.state.products : [];
        setListState(fallback);
      }
    } catch (e) {
      console.log('[ProductList] fetch error', e);
      Alert.alert('Error', 'No se pudieron cargar los productos.');
    } finally {
      setLoading(false);
    }
  }, [app, reload]);

  useFocusEffect(
    useCallback(() => {
      fetch();
      navigation.setOptions({
        title: 'Inventario',
        headerRight: () => (
          <TouchableOpacity
            accessibilityLabel="Agregar producto"
            onPress={() => setShowAdd(true)}
            style={{ paddingHorizontal: 12, paddingVertical: 4, flexDirection: 'row', alignItems: 'center' }}
          >
            <Text style={{ fontSize: 22, color: '#0a8f3c' }}>＋</Text>
            <Text style={styles.smallBtnText}>⏱ +5d</Text>
          </TouchableOpacity>
        ),
      });
      return undefined;
    }, [fetch, navigation])
  );

  const data: Array<ProductVM & { __skeleton?: boolean }> = useMemo(() => {
    const mapped =
      (rawProducts ?? [])
        .map((p: any) => {
          const q = p?.props ?? p;
          const id = String(q?.id ?? q?.uuid ?? q?._id ?? q?.product_id ?? q?.pk ?? '');
          const nameRaw = q?.name ?? q?.title ?? q?.nombre ?? q?.product_name ?? q?.productName ?? '';
          const name = oneLine(nameRaw) || (id ? `Producto ${id}` : 'Producto s/n');
          const nextExpiry = pickExpiry(q);

          // ⬇️ Cálculo robusto de daysToExpiry (acepta number/string o calcula desde nextExpiry)
          const dte = (() => {
            const r = q?.daysToExpiry;
            if (typeof r === 'number' && Number.isFinite(r)) return r;
            const n = Number(r);
            if (Number.isFinite(n)) return n;
            return daysTo(nextExpiry ?? null);
          })();

          return {
            id,
            name,
            brand: oneLine(q?.brand ?? q?.marca ?? ''),
            category: oneLine(q?.category ?? q?.categoria ?? ''),
            sku: oneLine(q?.sku ?? q?.codigo ?? q?.code ?? ''),
            photoUrl: q?.photoUrl ?? q?.photo ?? q?.imageUrl ?? q?.imagenUrl ?? q?.photoUri ?? null,
            qty: typeof q?.qty === 'number' ? q?.qty : Number(q?.qty ?? q?.cantidad ?? q?.stock ?? 0) || 0,
            nextExpiry,
            daysToExpiry: dte,
          } as ProductVM;
        })
        .filter((it: ProductVM) => !!it.id) || [];

    // Oculta los borrados
    const filtered = mapped.filter(it => !deletedIds.has(String(it.id)));

    if (SKELETON_COUNT > 0 && loading && filtered.length === 0) {
      return Array.from({ length: SKELETON_COUNT }).map((_, i) => ({
        id: `skeleton-${i}`,
        name: '',
        __skeleton: true,
      })) as any[];
    }
    return filtered;
  }, [rawProducts, loading, deletedIds]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetch();
    setRefreshing(false);
  }, [fetch]);

  const onDelta = useCallback(async (id: string, delta: number) => {
    const currentRow = (data || []).find((x) => String(x.id) === String(id));
    const currentQty = Number(currentRow?.qty ?? 0);
    const nextQty = Math.max(0, currentQty + delta);

    // Optimista
    setListState((prev) => {
      const base = (Array.isArray(prev) && prev.length ? prev : rawProducts) || [];
      return base.map((row: any) => {
        const q = row?.props ?? row;
        if (String(q?.id) !== String(id)) return row;
        const newProps = { ...q, qty: nextQty };
        return row?.props ? { ...row, props: newProps } : newProps;
      });
    });

    try {
      const runUpdate = pickUpdateQtyFn(app);
      if (typeof runUpdate === 'function') {
        await tryUpdateQtyWithPayloads(runUpdate, id, nextQty, currentRow);
      } else if (typeof (productRepo as any)?.updateProductQty === 'function') {
        await (productRepo as any).updateProductQty(id, nextQty);
      } else if (typeof (productRepo as any)?.adjustStock === 'function') {
        await (productRepo as any).adjustStock(id, nextQty - currentQty);
      }
      // opcional refresco
      // await fetch();
    } catch (e) {
      // Revertir
      setListState((prev) => {
        const base = (Array.isArray(prev) && prev.length ? prev : rawProducts) || [];
        return base.map((row: any) => {
          const q = row?.props ?? row;
          if (String(q?.id) !== String(id)) return row;
          const newProps = { ...q, qty: currentQty };
          return row?.props ? { ...row, props: newProps } : newProps;
        });
      });
      Alert.alert('No se pudo ajustar el stock', 'Se revirtió el cambio local.');
    }
  }, [app, data, rawProducts]);

  // Chips para fecha (crear)
  const setExpiryOffset = useCallback((days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const ymd = d.toISOString().slice(0, 10);
    setNewExpiry(ymd);
  }, []);

  // Chips para fecha (editar)
  const setEditExpiryOffset = useCallback((days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const ymd = d.toISOString().slice(0, 10);
    setEditExpiry(ymd);
  }, []);

  // Foto: helpers
  const pickFromLibrary = useCallback(async (setUri: (u: string) => void) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Se necesita permiso para acceder a la galería.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
    });
    if (!res.canceled && res.assets?.[0]?.uri) {
      setUri(res.assets[0].uri);
    }
  }, []);

  const takePhoto = useCallback(async (setUri: (u: string) => void) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Se necesita permiso para usar la cámara.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: true,
    });
    if (!res.canceled && res.assets?.[0]?.uri) {
      setUri(res.assets[0].uri);
    }
  }, []);

  // Guardar producto nuevo
  const onSaveNewProduct = useCallback(async () => {
    const name = (newName || '').trim();
    if (!name) {
      Alert.alert('Falta el nombre', 'Escribe un nombre para el producto.');
      return;
    }
    const qtyNum = Math.max(0, Number.isFinite(Number(newQty)) ? Number(newQty) : 0);

    const payload = {
      name,
      brand: newBrand?.trim() || null,
      sku: newSku?.trim() || null,
      qty: qtyNum,
      nextExpiry: newExpiry?.trim() || null,
      photoUrl: photoUri || null,
      photoUri: photoUri || null,
    };

    const createFn = pickCreateFn(app);

    try {
      setSaving(true);

      if (typeof createFn === 'function') {
        await createFn(payload);
      } else if (typeof (productRepo as any)?.upsert === 'function') {
        await (productRepo as any).upsert(payload);
      } else if (typeof (productRepo as any)?.createProduct === 'function') {
        await (productRepo as any).createProduct(payload);
      } else {
        const id = String(Date.now());
        setListState(prev => ([...(prev || []), { id, ...payload } as any]));
      }

      setShowAdd(false);
      setNewName(''); setNewBrand(''); setNewSku('');
      setNewQty('0'); setNewExpiry(''); setPhotoUri(null);
      await fetch();
    } catch (e) {
      console.log('[ProductList] crear error', e);
      Alert.alert('Error', 'No se pudo crear el producto.');
    } finally {
      setSaving(false);
    }
  }, [app, newName, newBrand, newSku, newQty, newExpiry, photoUri, fetch]);

  // Abrir editor con datos del item
  const openEdit = useCallback((item: ProductVM) => {
    setEditId(item.id);
    setEditName(item.name || '');
    setEditBrand(item.brand || '');
    setEditSku(item.sku || '');
    setEditQty(String(Number.isFinite(Number(item.qty)) ? item.qty : 0));
    setEditExpiry(item.nextExpiry || '');
    setEditPhotoUri(item.photoUrl || null);
    setShowEdit(true);
  }, []);

  // Guardar cambios (editar)
  const onSaveEdit = useCallback(async () => {
    const id = editId;
    const name = (editName || '').trim();
    if (!id) return;
    if (!name) {
      Alert.alert('Falta el nombre', 'Escribe un nombre para el producto.');
      return;
    }
    const qtyNum = Math.max(0, Number.isFinite(Number(editQty)) ? Number(editQty) : 0);

    const payload = {
      id,
      name,
      brand: editBrand?.trim() || null,
      sku: editSku?.trim() || null,
      qty: qtyNum,
      nextExpiry: editExpiry?.trim() || null,
      photoUrl: editPhotoUri || null,
      photoUri: editPhotoUri || null,
    };

    const saveFn = pickSaveFn(app);

    try {
      setUpdating(true);

      if (typeof saveFn === 'function') {
        await saveFn(payload);
      } else if (typeof (productRepo as any)?.upsert === 'function') {
        await (productRepo as any).upsert(payload);
      } else {
        // Optimista sin backend
        setListState(prev => {
          const base = Array.isArray(prev) ? prev : [];
          return base.map((row: any) => {
            const q = row?.props ?? row;
            if (String(q?.id) !== String(id)) return row;
            const newProps = { ...q, ...payload };
            return row?.props ? { ...row, props: newProps } : newProps;
          });
        });
      }

      setShowEdit(false);
      await fetch();
    } catch (e) {
      console.log('[ProductList] update error', e);
      Alert.alert('Error', 'No se pudo guardar el producto.');
    } finally {
      setUpdating(false);
    }
  }, [app, editId, editName, editBrand, editSku, editQty, editExpiry, editPhotoUri, fetch]);

  // Eliminar (persistente con SQLite)
  const onDelete = useCallback(async (id: string) => {
    try {
      setDeleting(true);

      // 1) Borrado persistente directo en tu repo
      if (typeof (productRepo as any)?.remove === 'function') {
        await (productRepo as any).remove(id);
      } else {
        // Si por alguna razón no existe, avisamos
        throw new Error('productRepo.remove no disponible');
      }

      // 2) Overlay inmediato
      setDeletedIds(prev => {
        const s = new Set(prev);
        s.add(String(id));
        return s;
      });

      // 3) Limpieza local de listState
      setListState(prev => {
        if (!Array.isArray(prev) || prev.length === 0) return prev;
        return prev.filter((r: any) => String((r?.props ?? r)?.id) !== String(id));
      });

      setShowEdit(false);

      // 4) Refresco desde DB para alinear
      await fetch();
    } catch (e) {
      console.log('[ProductList] delete error', e);
      Alert.alert('Error', 'No se pudo eliminar el producto.');
    } finally {
      setDeleting(false);
    }
  }, [fetch]);

  const confirmDelete = useCallback((id: string) => {
    Alert.alert('Eliminar producto', '¿Seguro que quieres eliminar este producto?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => onDelete(id) },
    ]);
  }, [onDelete]);

  // Acciones rápidas por card (Editar / Eliminar)
  const showItemActions = useCallback((item: ProductVM) => {
    Alert.alert(
      item.name || 'Producto',
      'Acciones',
      [
        { text: 'Editar', onPress: () => openEdit(item) },
        { text: 'Eliminar', style: 'destructive', onPress: () => confirmDelete(item.id) },
        { text: 'Cancelar', style: 'cancel' },
      ],
      { cancelable: true }
    );
  }, [openEdit, confirmDelete]);

  const renderItem = ({ item }: { item: any }) => {
    if (item.__skeleton) return <SkeletonCard />;

    // Coerción robusta para días (number | string | null)
    const d: number | null = (() => {
      if (typeof item.daysToExpiry === 'number' && Number.isFinite(item.daysToExpiry)) return item.daysToExpiry;
      const n = Number(item.daysToExpiry);
      if (Number.isFinite(n)) return n;
      return daysTo(item.nextExpiry ?? null);
    })();

    const b = badgeFor(d); // siempre devuelve label + colores

    return (
      <Pressable
        onPress={() => openEdit(item)}
        onLongPress={() => showItemActions(item)}
        delayLongPress={350}
        style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1 }]}
      >
        <View style={styles.card}>
          <View style={styles.row}>
            {item.photoUrl ? (
              <Image source={{ uri: item.photoUrl }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]} />
            )}
            <View style={{ width: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>
                {[item.brand, item.category, item.sku].filter(Boolean).join(' · ') || '—'}
              </Text>

              {/* 🔔 Siempre muestra la pill (incluye "Sin vencimiento") */}
              <View
                style={[
                  styles.expiryPill,
                  { backgroundColor: b.bg, borderColor: b.border },
                ]}
              >
                <Text style={styles.expiryPillText}>{b.label}</Text>
              </View>
            </View>

            <View style={styles.qtyControls}>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => onDelta(item.id, -1)}>
                <Text style={styles.qtyBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={[styles.qty, { marginHorizontal: 8 }]}>{item.qty ?? 0}</Text>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => onDelta(item.id, +1)}>
                <Text style={styles.qtyBtnText}>＋</Text>
              </TouchableOpacity>

              {/* Botón "⋮" para abrir acciones por tap */}
              <TouchableOpacity
                style={styles.moreBtn}
                onPress={() => showItemActions(item)}
                accessibilityLabel="Más opciones"
              >
                <Text style={styles.moreBtnText}>⋮</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  const EmptyState = () => (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>No hay productos</Text>
      <Text style={styles.emptySubtitle}>Agrega el primero para comenzar.</Text>
      <TouchableOpacity style={[styles.addButton, styles.primary]} onPress={() => setShowAdd(true)}>
        <Text style={styles.addButtonText}>Agregar producto</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={data}
        keyExtractor={(it) => String(it.id)}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={!loading ? <EmptyState /> : null}
        contentContainerStyle={
          data.length === 0 ? { flex: 1, justifyContent: 'center', alignItems: 'center' } : undefined
        }
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)} accessibilityLabel="Nuevo producto">
        <Text style={styles.fabIcon}>＋</Text>
      </TouchableOpacity>

      {/* Modal: alta completa */}
      <Modal visible={showAdd} transparent animationType="fade" onRequestClose={() => setShowAdd(false)}>
        <View style={styles.modal}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Nuevo producto</Text>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
              {/* Foto */}
              <View style={styles.photoRow}>
                <View style={styles.photoPreviewWrap}>
                  {photoUri
                    ? <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                    : <View style={[styles.photoPreview, styles.thumbEmpty]} />}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row' }}>
                    <TouchableOpacity style={[styles.smallChip, styles.secondary]} onPress={() => pickFromLibrary(setPhotoUri)}>
                      <Text style={styles.smallChipText}>Galería</Text>
                    </TouchableOpacity>
                    <View style={{ width: 8 }} />
                    <TouchableOpacity style={[styles.smallChip, styles.secondary]} onPress={() => takePhoto(setPhotoUri)}>
                      <Text style={styles.smallChipText}>Cámara</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Campos */}
              <TextInput
                placeholder="Nombre *"
                value={newName}
                onChangeText={setNewName}
                autoFocus
                style={styles.input}
                placeholderTextColor="rgba(255,255,255,0.5)"
              />
              <TextInput
                placeholder="Marca"
                value={newBrand}
                onChangeText={setNewBrand}
                style={styles.input}
                placeholderTextColor="rgba(255,255,255,0.5)"
              />
              <TextInput
                placeholder="SKU (opcional)"
                value={newSku}
                onChangeText={setNewSku}
                autoCapitalize="characters"
                style={styles.input}
                placeholderTextColor="rgba(255,255,255,0.5)"
              />
              <TextInput
                placeholder="Stock inicial (número)"
                value={newQty}
                onChangeText={setNewQty}
                keyboardType="numeric"
                style={styles.input}
                placeholderTextColor="rgba(255,255,255,0.5)"
              />
              <TextInput
                placeholder="Fecha de vencimiento (AAAA-MM-DD)"
                value={newExpiry}
                onChangeText={setNewExpiry}
                style={styles.input}
                placeholderTextColor="rgba(255,255,255,0.5)"
              />
              <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                <TouchableOpacity style={[styles.smallChip, styles.secondary]} onPress={() => setExpiryOffset(0)}>
                  <Text style={styles.smallChipText}>Hoy</Text>
                </TouchableOpacity>
                <View style={{ width: 8 }} />
                <TouchableOpacity style={[styles.smallChip, styles.secondary]} onPress={() => setExpiryOffset(7)}>
                  <Text style={styles.smallChipText}>+7d</Text>
                </TouchableOpacity>
                <View style={{ width: 8 }} />
                <TouchableOpacity style={[styles.smallChip, styles.secondary]} onPress={() => setExpiryOffset(30)}>
                  <Text style={styles.smallChipText}>+30d</Text>
                </TouchableOpacity>
                <View style={{ width: 8 }} />
                <TouchableOpacity style={[styles.smallChip, styles.secondary]} onPress={() => setNewExpiry('')}>
                  <Text style={styles.smallChipText}>Limpiar</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            {/* Acciones */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setShowAdd(false)}
                style={[styles.addButton, styles.secondary, { marginRight: 8 }]}
                disabled={saving}
              >
                <Text style={styles.addButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onSaveNewProduct}
                style={[styles.addButton, styles.primary]}
                disabled={saving}
              >
                <Text style={styles.addButtonText}>{saving ? 'Guardando…' : 'Guardar'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: edición */}
      <Modal visible={showEdit} transparent animationType="fade" onRequestClose={() => setShowEdit(false)}>
        <View style={styles.modal}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Editar producto</Text>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
              {/* Foto */}
              <View style={styles.photoRow}>
                <View style={styles.photoPreviewWrap}>
                  {editPhotoUri
                    ? <Image source={{ uri: editPhotoUri }} style={styles.photoPreview} />
                    : <View style={[styles.photoPreview, styles.thumbEmpty]} />}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row' }}>
                    <TouchableOpacity style={[styles.smallChip, styles.secondary]} onPress={() => pickFromLibrary(setEditPhotoUri)}>
                      <Text style={styles.smallChipText}>Galería</Text>
                    </TouchableOpacity>
                    <View style={{ width: 8 }} />
                    <TouchableOpacity style={[styles.smallChip, styles.secondary]} onPress={() => takePhoto(setEditPhotoUri)}>
                      <Text style={styles.smallChipText}>Cámara</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Campos */}
              <TextInput
                placeholder="Nombre *"
                value={editName}
                onChangeText={setEditName}
                autoFocus
                style={styles.input}
                placeholderTextColor="rgba(255,255,255,0.5)"
              />
              <TextInput
                placeholder="Marca"
                value={editBrand}
                onChangeText={setEditBrand}
                style={styles.input}
                placeholderTextColor="rgba(255,255,255,0.5)"
              />
              <TextInput
                placeholder="SKU (opcional)"
                value={editSku}
                onChangeText={setEditSku}
                autoCapitalize="characters"
                style={styles.input}
                placeholderTextColor="rgba(255,255,255,0.5)"
              />
              <TextInput
                placeholder="Stock (número)"
                value={editQty}
                onChangeText={setEditQty}
                keyboardType="numeric"
                style={styles.input}
                placeholderTextColor="rgba(255,255,255,0.5)"
              />
              <TextInput
                placeholder="Fecha de vencimiento (AAAA-MM-DD)"
                value={editExpiry}
                onChangeText={setEditExpiry}
                style={styles.input}
                placeholderTextColor="rgba(255,255,255,0.5)"
              />
              <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                <TouchableOpacity style={[styles.smallChip, styles.secondary]} onPress={() => setEditExpiryOffset(0)}>
                  <Text style={styles.smallChipText}>Hoy</Text>
                </TouchableOpacity>
                <View style={{ width: 8 }} />
                <TouchableOpacity style={[styles.smallChip, styles.secondary]} onPress={() => setEditExpiryOffset(7)}>
                  <Text style={styles.smallChipText}>+7d</Text>
                </TouchableOpacity>
                <View style={{ width: 8 }} />
                <TouchableOpacity style={[styles.smallChip, styles.secondary]} onPress={() => setEditExpiryOffset(30)}>
                  <Text style={styles.smallChipText}>+30d</Text>
                </TouchableOpacity>
                <View style={{ width: 8 }} />
                <TouchableOpacity style={[styles.smallChip, styles.secondary]} onPress={() => setEditExpiry('')}>
                  <Text style={styles.smallChipText}>Limpiar</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            {/* Acciones edición */}
            <View style={[styles.modalActions, { justifyContent: 'space-between' }]}>
              <TouchableOpacity
                onPress={() => editId && confirmDelete(editId)}
                style={[styles.addButton, { borderColor: 'rgba(255,100,100,0.5)', backgroundColor: 'rgba(255,80,80,0.18)' }]}
                disabled={deleting}
              >
                <Text style={[styles.addButtonText]}>Eliminar</Text>
              </TouchableOpacity>

              <View style={{ flexDirection: 'row' }}>
                <TouchableOpacity
                  onPress={() => setShowEdit(false)}
                  style={[styles.addButton, styles.secondary, { marginRight: 8 }]}
                  disabled={updating}
                >
                  <Text style={styles.addButtonText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={onSaveEdit}
                  style={[styles.addButton, styles.primary]}
                  disabled={updating}
                >
                  <Text style={styles.addButtonText}>{updating ? 'Guardando…' : 'Guardar'}</Text>
                </TouchableOpacity>
              </View>
            </View>

          </View>
        </View>
      </Modal>
    </View>
  );
}

function SkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={[styles.thumb, styles.thumbEmpty]} />
        <View style={{ width: 12 }} />
        <View style={{ flex: 1 }}>
          <View style={styles.skelLine} />
          <View style={[styles.skelLine, { width: '50%' }]} />
        </View>
        <View style={{ width: 12 }} />
        <View style={styles.skelDot} />
      </View>
    </View>
  );
}

/** Styles **/
const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, backgroundColor: '#08141A' },

  card: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    backgroundColor: 'rgba(24, 50, 66, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(94, 231, 255, 0.35)',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },

  row: { flexDirection: 'row', alignItems: 'center' },

  thumb: {
    width: 54, height: 54, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(170, 230, 255, 0.25)',
  },
  thumbEmpty: { backgroundColor: 'rgba(255,255,255,0.06)' },

  name: {
    fontWeight: '800', fontSize: 18, color: '#EFFFFB', letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
    includeFontPadding: false,
  },
  meta: {
    fontSize: 12, color: '#BFE7F2', opacity: 0.95, marginTop: 2, letterSpacing: 0.2,
    includeFontPadding: false,
  },
  qty: {
    fontWeight: '800', fontSize: 17, color: '#9FFFAF',
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
    includeFontPadding: false,
  },

  // Empty state
  emptyWrap: { alignItems: 'center' },
  emptyTitle: { color: '#EFFFFB', fontSize: 16, fontWeight: '800', marginBottom: 4, marginTop: 8 },
  emptySubtitle: { color: '#CFE8CF', opacity: 0.85, marginBottom: 12 },

  // Botones
  addButton: {
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  addButtonText: { color: '#EFFFFB', fontWeight: '800', letterSpacing: 0.2 },
  primary: { backgroundColor: 'rgba(0,170,140,0.28)', borderColor: 'rgba(0,220,180,0.55)' },
  secondary:{ backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.22)' },

  // Skeleton
  skelLine: { height: 10, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.10)', marginVertical: 3 },
  skelDot:  { width: 30, height: 18, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.10)' },

  // FAB
  fab: {
    position: 'absolute', right: 18, bottom: 18, width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#05A86D', borderWidth: 1, borderColor: 'rgba(180,255,220,0.6)',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  fabIcon: { fontSize: 30, color: 'white', lineHeight: 30, fontWeight: '800' },

  // Modal
  modal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalCard: {
    borderRadius: 16, backgroundColor: 'rgba(10, 28, 36, 0.95)',
    borderWidth: 1, borderColor: 'rgba(94, 231, 255, 0.35)', padding: 16,
  },
  modalTitle: { color: '#EFFFFB', fontWeight: '800', fontSize: 18, marginBottom: 10, letterSpacing: 0.2 },
  input: {
    borderWidth: 1, borderColor: 'rgba(170, 230, 255, 0.30)', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, color: 'white', marginBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end' },

  // Controles de cantidad
  qtyControls: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  qtyBtn: {
    width: 34, height: 34, borderRadius: 17, borderWidth: 1,
    borderColor: 'rgba(170, 230, 255, 0.35)',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  qtyBtnText: { color: '#EFFFFB', fontSize: 18, lineHeight: 20, fontWeight: '900', textAlign: 'center' },

  // Pill de vencimiento
  expiryPill: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  expiryPillText: { color: '#EFFFFB', fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },

  // Chips y foto (modales)
  smallChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(170,230,255,0.30)',
  },
  smallChipText: { color: '#EFFFFB', fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
  smallBtnText: { marginLeft: 6, color: '#9FE8FF', fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },

  photoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  photoPreviewWrap: {
    width: 64, height: 64, borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(170, 230, 255, 0.30)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  photoPreview: { width: '100%', height: '100%' },

  // Botón “⋮” en cada card
  moreBtn: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(170, 230, 255, 0.25)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  moreBtnText: {
    color: '#EFFFFB',
    fontSize: 16,
    fontWeight: '900',
    includeFontPadding: false,
  },
});

export {};

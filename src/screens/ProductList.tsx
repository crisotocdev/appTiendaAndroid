// src/screens/ProductList.tsx
import React, {
  useCallback,
  useMemo,
  useState,
  useLayoutEffect,
  useEffect,
} from 'react';
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
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../ui/providers/AppProvider';
import productRepo from '../infrastructure/persistence/sqlite/ProductRepoSQLite';
import * as ImagePicker from 'expo-image-picker';
import { getExpiryInfo } from '../utils/expiry';
import {
  refreshExpiryNotifications,
  notifyStockAlert,
} from '../notifications';
import {
  getExpirySettings,
  EXPIRY_DEFAULTS,
} from '../settings/expirySettings';

// ✅ Import único desde exporters.ts
import {
  saveProductsCSV,
  saveProductsJSON,
  shareProductsCSV,
  shareProductsJSON,
  pickBackupRowsFromJSON,
} from '../utils/exporters';
import { isValidYMD } from '../utils/dateUtils';
// OJO: ruta relativa desde ProductList.tsx
import { MovementRepoSQLite } from '../infrastructure/persistence/sqlite/MovementRepoSQLite';

const movementRepo = new MovementRepoSQLite();

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
  minStock?: number | null;
};

type FilterMode =
  | 'all'
  | 'aboutToExpire'
  | 'expired'
  | 'outOfStock'
  | 'lowStock';

const SKELETON_COUNT = 5;

function getStockStatus(
  qty: number,
  minStock: number
): 'none' | 'low' | 'ok' {
  if (qty <= 0) return 'none';
  if (minStock > 0 && qty <= minStock) return 'low';
  return 'ok';
}

/** Utils **/
const oneLine = (v: any): string =>
  String(v ?? '').replace(/[\r\n\u2028\u2029]/g, ' ').trim();

function pickExpiry(q: any): string | null {
  const raw =
    q?.nextExpiry ??
    q?.next_expiry ??
    q?.expiry ??
    q?.expiresAt ??
    q?.expirationDate ??
    q?.vence ??
    q?.fechaVencimiento ??
    q?.expiry_date ??
    q?.expDate ??
    q?.bestBefore ??
    null;

  if (!raw) return null;

  if (raw instanceof Date) {
    return raw.toISOString().slice(0, 10);
  }

  const s = String(raw).trim();
  if (!s) return null;

  const pure = s.split(/[T\s]/)[0];

  return pure || null;
}

// Ejecuta funciones o métodos en objetos { execute/run/call/... }
function methodRunner(u: any): ((arg?: any) => Promise<any>) | null {
  if (typeof u === 'function') return (arg?: any) => u(arg);
  if (u && typeof u === 'object') {
    const m = [
      'execute',
      'run',
      'call',
      'handler',
      'invoke',
      'mutate',
      'perform',
    ].find((k) => typeof (u as any)[k] === 'function');
    if (m) return (arg?: any) => (u as any)[m](arg);
  }
  return null;
}

/** Creación **/
function pickCreateFn(app: any) {
  const uc = app?.usecases;
  const candidates = [
    app?.createProduct,
    app?.actions?.createProduct,
    app?.addProduct,
    app?.actions?.addProduct,
    app?.upsertProduct,
    app?.actions?.upsertProduct,
    uc?.createProduct,
    uc?.addProduct,
    uc?.upsertProduct,
    uc?.products?.create,
    uc?.products?.add,
    uc?.products?.upsert,
    uc?.product?.create,
    uc?.product?.add,
    app?.products?.create,
    app?.repo?.products?.create,
    app?.repositories?.products?.create,
    app?.service?.products?.create,
    app?.api?.products?.create,
    app?.db?.products?.create,
  ];
  for (const c of candidates) {
    const r = methodRunner(c);
    if (r) return r;
  }
  function walk(obj: any, depth = 0): any {
    if (!obj || typeof obj !== 'object' || depth > 3) return null;
    for (const [k, v] of Object.entries(obj)) {
      if (/create|add|upsert/i.test(k) && /product/i.test(k)) {
        const r = methodRunner(v);
        if (r) return r;
      }
      if (v && typeof v === 'object') {
        const w = walk(v, depth + 1);
        if (w) return w;
      }
    }
    return null;
  }
  return walk(uc) || null;
}

/** Guardar (update/upsert) **/
function pickSaveFn(app: any) {
  const uc = app?.usecases;
  const candidates = [
    app?.upsertProduct,
    app?.updateProduct,
    app?.actions?.upsertProduct,
    app?.actions?.updateProduct,
    uc?.upsertProduct,
    uc?.updateProduct,
    uc?.products?.upsert,
    uc?.products?.update,
    app?.products?.upsert,
    app?.products?.update,
    app?.repo?.products?.upsert,
    app?.repositories?.products?.upsert,
  ];
  for (const c of candidates) {
    const r = methodRunner(c);
    if (r) return r;
  }
  function walk(obj: any, depth = 0): any {
    if (!obj || typeof obj !== 'object' || depth > 3) return null;
    for (const [k, v] of Object.entries(obj)) {
      if (/(upsert|update)/i.test(k) && /product/i.test(k)) {
        const r = methodRunner(v);
        if (r) return r;
      }
      if (v && typeof v === 'object') {
        const w = walk(v, depth + 1);
        if (w) return w;
      }
    }
    return null;
  }
  return walk(uc) || null;
}

/** Listado **/
function pickListFn(app: any) {
  const uc = app?.usecases;
  const candidates = [
    uc?.listProducts,
    uc?.getProducts,
    uc?.fetchProducts,
    uc?.products?.list,
    uc?.products?.getAll,
    uc?.products?.fetchAll,
    uc?.product?.list,
    uc?.inventory?.listProducts,
    app?.listProducts,
    app?.fetchProducts,
    app?.repo?.products?.list,
    app?.repositories?.products?.list,
  ];
  for (const c of candidates) {
    const r = methodRunner(c);
    if (r) return r;
  }
  function walk(obj: any, depth = 0): any {
    if (!obj || typeof obj !== 'object' || depth > 3) return null;
    for (const [k, v] of Object.entries(obj)) {
      if (/(list|get|fetch)/i.test(k) && /product/i.test(k)) {
        const r = methodRunner(v);
        if (r) return r;
      }
      if (v && typeof v === 'object') {
        const w = walk(v, depth + 1);
        if (w) return w;
      }
    }
    return null;
  }
  return walk(uc) || null;
}

function extractList(res: any): any[] {
  if (Array.isArray(res)) return res;
  const flats = [
    res?.items,
    res?.products,
    res?.rows,
    res?.results,
    res?.list,
    res?.value,
    res?.values,
    res?.payload,
    res?.data,
  ];
  for (const a of flats) if (Array.isArray(a)) return a;
  const d = res?.data;
  if (d) {
    const nested = [
      d?.items,
      d?.products,
      d?.rows,
      d?.results,
      d?.list,
      d?.value,
      d?.values,
      d?.payload,
    ];
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

async function tryListWithPayloads(fn: Function) {
  const trials: any[] = [undefined, {}, { limit: 200 }, { page: 1 }, null];
  let last: any = null;
  for (const t of trials) {
    try {
      // @ts-ignore
      const res = t === undefined ? await fn() : await fn(t);
      const arr = extractList(res);
      if (Array.isArray(arr)) return arr;
    } catch (e) {
      last = e;
    }
  }
  throw last ?? new Error('No pude obtener la lista de productos');
}

/** Stock (ajuste delta / set qty) **/
function pickUpdateQtyFn(app: any) {
  const uc = app?.usecases;
  const c = [
    uc?.updateProduct,
    uc?.products?.update,
    uc?.product?.update,
    uc?.products?.setQty,
    uc?.product?.setQty,
    uc?.inventory?.setQty,
    uc?.stock?.set,
    app?.updateProduct,
    app?.products?.update,
    app?.repo?.products?.update,
    app?.repositories?.products?.update,
  ];
  for (const cand of c) {
    const r = methodRunner(cand);
    if (r) return r;
  }
  function walk(o: any, d = 0): any {
    if (!o || typeof o !== 'object' || d > 3) return null;
    for (const [k, v] of Object.entries(o)) {
      if (
        /(update|set)/i.test(k) &&
        /(product|stock|qty|quantity)/i.test(k)
      ) {
        const r = methodRunner(v);
        if (r) return r;
      }
      if (v && typeof v === 'object') {
        const w = walk(v, d + 1);
        if (w) return w;
      }
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
    { id, qty },
    { productId: id, qty },
    { id, quantity: qty },
    { productId: id, quantity: qty },
    { id, stock: qty },
    { product: { id, qty } },
    { ...base, id, qty },
  ];
  let last: any = null;
  for (const t of trials) {
    try {
      await run(t);
      return;
    } catch (e) {
      last = e;
    }
  }
  throw last ?? new Error(
    'No pude actualizar qty con los formatos probados'
  );
}

/** Componente **/
export default function ProductList({ navigation }: Props) {
  const app = useApp() as any;

  // ✅ Estado local para config de vencimiento (por defecto 7/30)
  const [expiryCfg, setExpiryCfg] = useState({
    soonThresholdDays: 7,
    okThresholdDays: 30,
  });

  // Días dinámicos para el atajo +Xd (con fallback seguro)
  const soonDays = useMemo(
    () =>
      Number.isFinite(Number(expiryCfg?.soonThresholdDays))
        ? expiryCfg.soonThresholdDays
        : EXPIRY_DEFAULTS.soonThresholdDays,
    [expiryCfg]
  );

  // Usamos la config para calcular el estado de vencimiento
  const expiryOf = useCallback(
    (date?: string | null) =>
      getExpiryInfo(date, {
        soonThresholdDays: expiryCfg.soonThresholdDays,
        okThresholdDays: expiryCfg.okThresholdDays,
      }),
    [expiryCfg]
  );

  // ✅ Versión recomendada: lee ambos umbrales (soon + ok)
  const loadExpiryCfg = useCallback(async () => {
    try {
      const cfg = await getExpirySettings(); // ← trae { soonThresholdDays, okThresholdDays }
      setExpiryCfg(cfg);
    } catch {
      setExpiryCfg(EXPIRY_DEFAULTS); // ← {7, 30} por defecto
    }
  }, []);

  // Presets de días para chips (únicos y > 0)
  const presetDays = useMemo(
    () =>
      Array.from(
        new Set(
          [expiryCfg.soonThresholdDays, expiryCfg.okThresholdDays].filter(
            (n) => Number.isFinite(n) && n > 0
          )
        )
      ),
    [expiryCfg]
  );

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
  const [newMinStock, setNewMinStock] = useState<string>('3');
  const [newExpiry, setNewExpiry] = useState(''); // YYYY-MM-DD
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newCategory, setNewCategory] = useState(''); // 👈 categoría (alta)

  // Estado local - modal de edición
  const [showEdit, setShowEdit] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editBrand, setEditBrand] = useState('');
  const [editSku, setEditSku] = useState('');
  const [editQty, setEditQty] = useState<string>('0');
  const [editMinStock, setEditMinStock] = useState<string>('0');
  const [editExpiry, setEditExpiry] = useState('');
  const [editPhotoUri, setEditPhotoUri] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editCategory, setEditCategory] = useState(''); // 👈 categoría (edición)

  // Búsqueda y filtros
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Fallbacks expuestos por provider
  const reload =
    app?.reloadProducts ??
    app?.refreshProducts ??
    app?.actions?.reloadProducts ??
    app?.actions?.refreshProducts ??
    app?.fetchProducts;

  // Fuente de datos “segura”
  const rawProducts: any[] =
    Array.isArray(listState) && listState.length > 0
      ? listState
      : Array.isArray(app?.products)
      ? app.products
      : Array.isArray(app?.state?.products)
      ? app.state.products
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
        const fallback = Array.isArray(app?.products)
          ? app.products
          : Array.isArray(app?.state?.products)
          ? app.state.products
          : [];
        setListState(fallback);
      } else {
        const fallback = Array.isArray(app?.products)
          ? app.products
          : Array.isArray(app?.state?.products)
          ? app.state.products
          : [];
        setListState(fallback);
      }
    } catch (e) {
      console.log('[ProductList] fetch error', e);
      Alert.alert('Error', 'No se pudieron cargar los productos.');
    } finally {
      setLoading(false);
    }
  }, [app, reload]);

  // 👆 helper de fecha para el botón del header y chips del modal (alta)
  const setExpiryOffset = useCallback((days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const ymd = d.toISOString().slice(0, 10);
    setNewExpiry(ymd);
  }, []);

  // 1) Solo fetch al enfocar la pantalla
  useFocusEffect(
    useCallback(() => {
      fetch();
      return undefined;
    }, [fetch])
  );

  // 1.b) Cargar/recargar configuración de vencimiento al enfocar (y al montar)
  useFocusEffect(
    useCallback(() => {
      loadExpiryCfg();
      return undefined;
    }, [loadExpiryCfg])
  );
  useEffect(() => {
    // respaldo por si la pantalla no enfoca al inicio
    loadExpiryCfg();
  }, [loadExpiryCfg]);

  // 3) Default de seguridad: propone +{soonThresholdDays}
  useEffect(() => {
    if (showAdd && !newExpiry) {
      setExpiryOffset(expiryCfg.soonThresholdDays);
    }
  }, [showAdd, newExpiry, setExpiryOffset, expiryCfg.soonThresholdDays]);

  // 1) Base: mapeo de productos crudos → ProductVM ordenados
  const baseItems: Array<ProductVM & { __skeleton?: boolean }> = useMemo(() => {
    const mapped =
      (rawProducts ?? [])
        .map((p: any) => {
          const q = p?.props ?? p;

          const id = String(
            q?.id ?? q?.uuid ?? q?._id ?? q?.product_id ?? q?.pk ?? ''
          );

          const nameRaw =
            q?.name ??
            q?.title ??
            q?.nombre ??
            q?.product_name ??
            q?.productName ??
            '';

          const name =
            oneLine(nameRaw) || (id ? `Producto ${id}` : 'Producto s/n');

          const nextExpiry = pickExpiry(q);
          const expiry = expiryOf(nextExpiry ?? null);

          const qty =
            typeof q?.qty === 'number'
              ? q.qty
              : Number(q?.qty ?? q?.cantidad ?? q?.stock ?? 0) || 0;

          const minStock =
            typeof q?.minStock === 'number' && Number.isFinite(q.minStock)
              ? q.minStock
              : typeof q?.min_stock === 'number' && Number.isFinite(q.min_stock)
              ? q.min_stock
              : typeof q?.stockMin === 'number' && Number.isFinite(q.stockMin)
              ? q.stockMin
              : Number.isFinite(
                  Number(q?.minStock ?? q?.min_stock ?? q?.stockMin)
                )
              ? Number(q?.minStock ?? q?.min_stock ?? q?.stockMin)
              : 0;

          return {
            id,
            name,
            brand: oneLine(q?.brand ?? q?.marca ?? ''),
            category: oneLine(q?.category ?? q?.categoria ?? ''), // 👈 IMPORTANTE
            sku: oneLine(q?.sku ?? q?.codigo ?? q?.code ?? ''),
            photoUrl:
              q?.photoUrl ??
              q?.photo ??
              q?.imageUrl ??
              q?.imagenUrl ??
              q?.photoUri ??
              null,
            qty,
            minStock,
            nextExpiry,
            daysToExpiry: expiry.days ?? null,
          } as ProductVM;
        })
        .filter((it: ProductVM) => !!it.id) || [];

    const withoutDeleted = mapped.filter(
      (it) => !deletedIds.has(String(it.id))
    );

    // Skeletons mientras carga y no hay datos
    if (SKELETON_COUNT > 0 && loading && withoutDeleted.length === 0) {
      return Array.from({ length: SKELETON_COUNT }).map((_, i) => ({
        id: `skeleton-${i}`,
        name: '',
        __skeleton: true,
      })) as any[];
    }

    // Orden por estado de vencimiento y días
    const sorted = [...withoutDeleted].sort((a, b) => {
      const ea = expiryOf(a.nextExpiry ?? null);
      const eb = expiryOf(b.nextExpiry ?? null);

      const rank = (e: ReturnType<typeof expiryOf>) => {
        if (e.status === 'expired') return 0;
        if (e.status === 'soon') return 1;
        if (e.status === 'ok') return 2;
        return 3;
      };

      const ra = rank(ea);
      const rb = rank(eb);
      if (ra !== rb) return ra - rb;

      const da = ea.days ?? 9999;
      const db = eb.days ?? 9999;
      return da - db;
    });

    return sorted;
  }, [rawProducts, loading, deletedIds, expiryOf]);

  // 2) Filtros combinados: texto + estado + categoría
  const data: Array<ProductVM & { __skeleton?: boolean }> = useMemo(() => {
    // Si estamos mostrando skeletons, no filtrar (da lo mismo mientras carga)
    if (baseItems.some((it) => (it as any).__skeleton)) {
      return baseItems;
    }

    // 🔍 filtro por texto
    const searchTrim = search.trim().toLowerCase();
    const bySearch = searchTrim
      ? baseItems.filter((p) =>
          `${p.name} ${p.brand ?? ''} ${p.sku ?? ''}`
            .toLowerCase()
            .includes(searchTrim)
        )
      : baseItems;

    // 🎯 filtros rápidos (vencimiento / stock)
    const byFilter = bySearch.filter((p) => {
      if (filter === 'all') return true;

      const info = expiryOf(p.nextExpiry ?? null);
      const qty = Number(p.qty ?? 0);
      const minStockNum =
        typeof p.minStock === 'number' && Number.isFinite(p.minStock)
          ? p.minStock
          : 0;

      switch (filter) {
        case 'aboutToExpire':
          return info.status === 'soon';
        case 'expired':
          return info.status === 'expired';
        case 'outOfStock':
          return qty === 0;
        case 'lowStock':
          return qty > 0 && minStockNum > 0 && qty <= minStockNum;
        default:
          return true;
      }
    });

    // 🏷️ filtro por categoría (si hay una seleccionada)
    const byCategory =
      selectedCategory && selectedCategory !== 'ALL'
        ? byFilter.filter((p) => (p.category || '') === selectedCategory)
        : byFilter;

    return byCategory;
  }, [baseItems, search, filter, expiryOf, selectedCategory]);

  // 👇 Lista de categorías únicas ordenadas (a partir de todo el inventario)
  const categories = useMemo(() => {
    const set = new Set<string>();
    (baseItems || []).forEach((p) => {
      if (!(p as any).__skeleton && p.category) {
        set.add(String(p.category));
      }
    });
    return Array.from(set).sort();
  }, [baseItems]);

  // 📊 Resumen de inventario
  const summary = useMemo(() => {
    const items = (data || []).filter((it) => !it.__skeleton);

    const total = items.length;
    let expSoon = 0;
    let expired = 0;
    let outOfStock = 0;
    let lowStock = 0;

    items.forEach((p) => {
      const info = expiryOf(p.nextExpiry ?? null);
      const qty = Number(p.qty ?? 0);
      const minStock =
        typeof p.minStock === 'number' && Number.isFinite(p.minStock)
          ? p.minStock
          : 0;

      if (info.status === 'soon') expSoon += 1;
      if (info.status === 'expired') expired += 1;

      const stockStatus = getStockStatus(qty, minStock);
      if (stockStatus === 'none') outOfStock += 1;
      else if (stockStatus === 'low') lowStock += 1;
    });

    return { total, expSoon, expired, outOfStock, lowStock };
  }, [data, expiryOf]);

  // ¿Hay productos en bruto (antes de filtros)?
  const hasAnyProducts = useMemo(
    () => (rawProducts ?? []).length > 0,
    [rawProducts]
  );

  // ¿Hay búsqueda / filtros / categoría aplicados?
  const hasActiveFilters = useMemo(
    () =>
      !!search.trim() ||
      filter !== 'all' ||
      (selectedCategory && selectedCategory !== 'ALL'),
    [search, filter, selectedCategory]
  );

  // 🔧 Helper común para armar filas de exportación (CSV/JSON/Backup)
  const buildExportRows = useCallback(() => {
    const items = (data || []).filter(
      (it) => !(it as any).__skeleton
    );

    return items.map((p: any) => {
      const e = expiryOf(p.nextExpiry ?? null);
      return {
        id: p.id,
        name: p.name,
        brand: p.brand ?? '',
        category: p.category ?? '',
        sku: p.sku ?? '',
        qty: Number(p.qty ?? 0),
        minStock:
          typeof p.minStock === 'number' &&
          Number.isFinite(p.minStock)
            ? p.minStock
            : '',
        nextExpiry: p.nextExpiry ?? '',
        daysToExpiry: e.days ?? '',
        expiryStatus: e.status,
      };
    });
  }, [data, expiryOf]);

  // 📤 CSV: guardar o compartir
  const handleExportCSV = useCallback(
    async (mode: 'save' | 'share') => {
      try {
        const rows = buildExportRows();
        if (!rows.length) {
          Alert.alert(
            'Sin datos',
            'No hay productos para exportar.'
          );
          return;
        }

        const uri =
          mode === 'save'
            ? await saveProductsCSV(rows)
            : await shareProductsCSV(rows);

        if (uri.startsWith('clipboard://')) {
          // El mensaje ya lo muestra fallbackClipboard
          return;
        }

        if (mode === 'save') {
          Alert.alert(
            'CSV guardado',
            uri.startsWith('content://')
              ? 'Archivo CSV guardado en la carpeta que elegiste.'
              : `Archivo CSV guardado en: ${uri}`
          );
        } else {
          Alert.alert(
            'CSV compartido',
            'Se abrió el panel para compartir el archivo (WhatsApp, Gmail, Drive, etc.).'
          );
        }
      } catch (e: any) {
        console.log('[ProductList] export CSV error', e);
        Alert.alert(
          'Error',
          `No se pudo exportar el inventario en CSV.\n\n${
            e?.message ?? ''
          }`
        );
      }
    },
    [buildExportRows]
  );

  // 📤 JSON (backup): guardar o compartir usando los otros helpers
  const handleExportJSON = useCallback(
    async (mode: 'save' | 'share') => {
      try {
        const rows = buildExportRows();
        if (!rows.length) {
          Alert.alert(
            'Sin datos',
            'No hay productos para exportar.'
          );
          return;
        }

        const uri =
          mode === 'save'
            ? await saveProductsJSON(rows)
            : await shareProductsJSON(rows);

        if (uri.startsWith('clipboard://')) {
          return;
        }

        if (mode === 'save') {
          Alert.alert(
            'Backup guardado',
            uri.startsWith('content://')
              ? 'Backup JSON guardado en la carpeta que elegiste.'
              : `Backup JSON guardado en: ${uri}`
          );
        } else {
          Alert.alert(
            'Backup compartido',
            'Se abrió el panel para compartir el backup (WhatsApp, Gmail, Drive, etc.).'
          );
        }
      } catch (e: any) {
        console.log('[ProductList] export JSON error', e);
        Alert.alert(
          'Error',
          `No se pudo exportar el backup (JSON).\n\n${
            e?.message ?? ''
          }`
        );
      }
    },
    [buildExportRows]
  );

  const handleRestoreBackup = useCallback(async () => {
    try {
      // 1) Elegir archivo
      const rows = await pickBackupRowsFromJSON();
      if (!rows || rows.length === 0) {
        Alert.alert('Sin datos', 'El archivo de backup no contiene productos.');
        return;
      }

      // 2) Confirmar si hay productos actualmente
      if ((data || []).length > 0) {
        const agree = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Restaurar backup',
            'Esto agregará los productos del backup.\nSi ya tienes productos, se sumarán (no se borran automáticamente).',
            [
              { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Continuar', onPress: () => resolve(true) },
            ],
          );
        });
        if (!agree) return;
      }

      const createFn = pickCreateFn(app);
      let inserted = 0;

      for (const r of rows) {
        const name = String(r.name ?? '').trim();
        if (!name) continue;

        const qtyNum = Math.max(0, Number(r.qty ?? 0) || 0);
        const minStockNum = Math.max(0, Number(r.minStock ?? 0) || 0);
        const nextExpiry =
          typeof r.nextExpiry === 'string' && r.nextExpiry.trim()
            ? r.nextExpiry.trim()
            : null;

        const payload = {
          name,
          brand: (r.brand as string | undefined)?.trim() || null,
          category: (r.category as string | undefined)?.trim() || null,
          sku: (r.sku as string | undefined)?.trim() || null,
          qty: qtyNum,
          minStock: minStockNum,
          nextExpiry,
          photoUrl: null,
          photoUri: null,
        };

        if (typeof createFn === 'function') {
          await createFn(payload);
        } else if (typeof (productRepo as any)?.upsert === 'function') {
          await (productRepo as any).upsert(payload);
        } else if (typeof (productRepo as any)?.createProduct === 'function') {
          await (productRepo as any).createProduct(payload);
        } else {
          // fallback: solo en memoria
          const id = String(Date.now() + inserted);
          setListState((prev) => ([...(prev || []), { id, ...payload } as any]));
        }

        inserted += 1;
      }

      await fetch();
      try {
        await refreshExpiryNotifications();
      } catch (err) {
        console.log('[ProductList] refresh notif after restore error', err);
      }

      Alert.alert('Backup restaurado', `Se restauraron ${inserted} productos.`);
    } catch (e: any) {
      console.log('[ProductList] restore backup error', e);
      Alert.alert(
        'Error',
        `No se pudo restaurar el backup.\n\n${e?.message ?? ''}`,
      );
    }
  }, [app, data, fetch]);

  // 🗄️ Menú: primero elegir CSV/JSON, luego guardar/compartir
  const openExportMenu = useCallback(() => {
    Alert.alert('Exportar / backup', '¿Qué deseas hacer?', [
      {
        text: 'Backup JSON',
        onPress: () => {
          Alert.alert('Backup JSON', '¿Cómo quieres hacerlo?', [
            {
              text: 'Guardar en dispositivo',
              onPress: () => handleExportJSON('save'),
            },
            {
              text: 'Compartir',
              onPress: () => handleExportJSON('share'),
            },
            { text: 'Cancelar', style: 'cancel' },
          ]);
        },
      },
      {
        text: 'Exportar CSV',
        onPress: () => {
          Alert.alert('Exportar CSV', '¿Cómo quieres hacerlo?', [
            {
              text: 'Guardar en dispositivo',
              onPress: () => handleExportCSV('save'),
            },
            {
              text: 'Compartir',
              onPress: () => handleExportCSV('share'),
            },
            { text: 'Cancelar', style: 'cancel' },
          ]);
        },
      },
      {
        text: 'Restaurar backup',
        onPress: () => { void handleRestoreBackup(); },   // 👈 NUEVO
      },
      { text: 'Salir', style: 'cancel' },
    ]);
  }, [handleExportCSV, handleExportJSON, handleRestoreBackup]);

  // Header (＋⏱, Exportar, ⚙️, Backup JSON)
  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'InventarioOp',
      headerRight: () => (
        <View
          style={{ flexDirection: 'row', alignItems: 'center' }}
        >
          {/* ＋ ⏱ */}
          <TouchableOpacity
            accessibilityLabel={`Agregar producto (fecha por defecto +${soonDays}d)`}
            onPress={() => {
              setExpiryOffset(soonDays);
              setShowAdd(true);
            }}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 4,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 22, color: '#0a8f3c' }}>＋</Text>
            <Text style={styles.smallBtnText}>⏱ +{soonDays}d</Text>
          </TouchableOpacity>

          {/* 🗄️ Exportar menú */}
          <TouchableOpacity
            accessibilityLabel="Exportar inventario"
            onPress={openExportMenu}
            style={{
              marginLeft: 8,
              paddingHorizontal: 6,
              paddingVertical: 4,
            }}
          >
            <Text style={{ fontSize: 18 }}>🗄️</Text>
          </TouchableOpacity>

          {/* ⚙️ Ajustes vencimiento */}
          <TouchableOpacity
            accessibilityLabel="Ajustes de vencimiento"
            onPress={() => navigation.navigate('ExpirySettings')}
            style={{
              marginLeft: 8,
              paddingHorizontal: 6,
              paddingVertical: 4,
            }}
          >
            <Text style={{ fontSize: 18 }}>⚙️</Text>
          </TouchableOpacity>

          {/* ☁️ Backup rápido JSON → Guardar / Compartir */}
          <TouchableOpacity
            style={styles.exportButton}
            onPress={() =>
              Alert.alert('Backup JSON', '¿Cómo quieres hacerlo?', [
                {
                  text: 'Guardar en dispositivo',
                  onPress: () => handleExportJSON('save'),
                },
                {
                  text: 'Compartir',
                  onPress: () => handleExportJSON('share'),
                },
                { text: 'Cancelar', style: 'cancel' },
              ])
            }
          >
            <Text style={styles.exportLabel}>☁️</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [
    navigation,
    soonDays,
    openExportMenu,
    setExpiryOffset,
    handleExportJSON,
  ]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetch();
    setRefreshing(false);
  }, [fetch]);

    const onDelta = useCallback(
    async (id: string, delta: number) => {
      if (!delta) return;

      const currentRow = (data || []).find((x) => String(x.id) === String(id));
      const currentQty = Number(currentRow?.qty ?? 0);
      const nextQty = Math.max(0, currentQty + delta);

      const minStock = Number(currentRow?.minStock ?? 0);

      const prevStatus = getStockStatus(currentQty, minStock);
      const nextStatus = getStockStatus(nextQty, minStock);

      // 👇 Actualizamos UI optimistamente
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
        const hasRepoUpdate =
          typeof (productRepo as any)?.updateProductQty === 'function' ||
          typeof (productRepo as any)?.adjustStock === 'function';

        // ❗ Si no hay NINGÚN método para persistir, avisamos y revertimos
        if (!runUpdate && !hasRepoUpdate) {
          throw new Error('No hay repositorio configurado para actualizar el stock.');
        }

        if (typeof runUpdate === 'function') {
          await tryUpdateQtyWithPayloads(runUpdate, id, nextQty, currentRow);
        } else if (typeof (productRepo as any)?.updateProductQty === 'function') {
          await (productRepo as any).updateProductQty(id, nextQty);
        } else if (typeof (productRepo as any)?.adjustStock === 'function') {
          await (productRepo as any).adjustStock(id, nextQty - currentQty);
        }

        // 📝 Registrar movimiento en historial (no rompemos el stock si falla)
        try {
          const type: 'IN' | 'OUT' | 'ADJUST' =
            delta > 0 ? 'IN' : delta < 0 ? 'OUT' : 'ADJUST';

          await movementRepo.register({
            productId: id,
            type,
            qty: Math.abs(delta),
            note: null,
          });
        } catch (err) {
          console.log('[ProductList] error registrando movimiento', err);
        }

        // Notificación de alerta de stock si cambia el estado
        if (prevStatus !== nextStatus && nextStatus !== 'ok') {
          const statusType = nextStatus === 'none' ? 'out' : 'low';
          void notifyStockAlert({
            name: currentRow?.name ?? 'Producto',
            status: statusType,
            qty: nextQty,
            minStock,
          });
        }
      } catch (e: any) {
        // 👇 Revertimos el cambio local si algo falla en la PERSISTENCIA de stock
        setListState((prev) => {
          const base = (Array.isArray(prev) && prev.length ? prev : rawProducts) || [];
          return base.map((row: any) => {
            const q = row?.props ?? row;
            if (String(q?.id) !== String(id)) return row;
            const newProps = { ...q, qty: currentQty };
            return row?.props ? { ...row, props: newProps } : newProps;
          });
        });

        console.log('[ProductList] onDelta error', e);
        Alert.alert(
          'No se pudo ajustar el stock',
          e?.message
            ? `${e.message}\n\nEl cambio se revirtió.`
            : 'Ocurrió un problema al guardar el cambio. El stock se revirtió.'
        );
      }
    },
    [app, data, rawProducts]
  );

  // Chips para fecha (editar)
  const setEditExpiryOffset = useCallback((days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const ymd = d.toISOString().slice(0, 10);
    setEditExpiry(ymd);
  }, []);

  // Foto: helpers
  const pickFromLibrary = useCallback(
    async (setUri: (u: string | null) => void) => {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permiso requerido',
          'Se necesita permiso para acceder a la galería.'
        );
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
    },
    []
  );

  const takePhoto = useCallback(
    async (setUri: (u: string | null) => void) => {
      const { status } =
        await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permiso requerido',
          'Se necesita permiso para usar la cámara.'
        );
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        quality: 0.8,
        allowsEditing: true,
      });
      if (!res.canceled && res.assets?.[0]?.uri) {
        setUri(res.assets[0].uri);
      }
    },
    []
  );

  // Guardar producto nuevo
  const onSaveNewProduct = useCallback(async () => {
    const name = (newName || '').trim();
    if (!name) {
      Alert.alert(
        'Falta el nombre',
        'Escribe un nombre para el producto.'
      );
      return;
    }

    const expiryTrim = newExpiry?.trim() || '';
    if (expiryTrim && !isValidYMD(expiryTrim)) {
      Alert.alert(
        'Fecha inválida',
        'La fecha de vencimiento debe tener el formato AAAA-MM-DD y ser una fecha válida.'
      );
      return;
    }

    const qtyNum = Math.max(
      0,
      Number.isFinite(Number(newQty)) ? Number(newQty) : 0
    );
    const minStockNum = Math.max(
      0,
      Number.isFinite(Number(newMinStock))
        ? Number(newMinStock)
        : 0
    );

    const payload = {
      name,
      brand: newBrand?.trim() || null,
      category: newCategory?.trim() || null,
      sku: newSku?.trim() || null,
      qty: qtyNum,
      minStock: minStockNum,
      nextExpiry: expiryTrim || null,
      photoUrl: photoUri || null,
      photoUri: photoUri || null,
    };

    const createFn = pickCreateFn(app);

    try {
      setSaving(true);

      if (typeof createFn === 'function') {
        await createFn(payload);
      } else if (
        typeof (productRepo as any)?.upsert === 'function'
      ) {
        await (productRepo as any).upsert(payload);
      } else if (
        typeof (productRepo as any)?.createProduct === 'function'
      ) {
        await (productRepo as any).createProduct(payload);
      } else {
        const id = String(Date.now());
        setListState((prev) => [
          ...(prev || []),
          { id, ...payload } as any,
        ]);
      }

      setShowAdd(false);
      setNewName('');
      setNewBrand('');
      setNewCategory('');
      setNewSku('');
      setNewQty('0');
      setNewMinStock('3');
      setNewExpiry('');
      setPhotoUri(null);

      Alert.alert('Listo', 'El producto se creó correctamente.');

      await fetch();

      try {
        await refreshExpiryNotifications();
      } catch (err) {
        console.log(
          '[ProductList] error al refrescar notificaciones (nuevo)',
          err
        );
      }
    } catch (e) {
      console.log('[ProductList] crear error', e);
      Alert.alert('Error', 'No se pudo crear el producto.');
    } finally {
      setSaving(false);
    }
  }, [
    app,
    newName,
    newBrand,
    newCategory,
    newSku,
    newQty,
    newMinStock,
    newExpiry,
    photoUri,
    fetch,
  ]);

  // Abrir editor con datos del item
  const openEdit = useCallback((item: ProductVM) => {
    setEditId(item.id);
    setEditName(item.name || '');
    setEditBrand(item.brand || '');
    setEditCategory(item.category || '');
    setEditSku(item.sku || '');
    setEditQty(
      Number.isFinite(Number(item.qty)) ? String(item.qty) : '0'
    );
    setEditMinStock(
      item.minStock != null &&
        Number.isFinite(Number(item.minStock))
        ? String(item.minStock)
        : '0'
    );
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
      Alert.alert(
        'Falta el nombre',
        'Escribe un nombre para el producto.'
      );
      return;
    }

    const expiryTrim = editExpiry?.trim() || '';
    if (expiryTrim && !isValidYMD(expiryTrim)) {
      Alert.alert(
        'Fecha inválida',
        'La fecha de vencimiento debe tener el formato AAAA-MM-DD y ser una fecha válida.'
      );
      return;
    }

    const qtyNum = Math.max(
      0,
      Number.isFinite(Number(editQty)) ? Number(editQty) : 0
    );
    const minStockNum = Math.max(
      0,
      Number.isFinite(Number(editMinStock))
        ? Number(editMinStock)
        : 0
    );

    const prevRow = (data || []).find(
      (x) => String(x.id) === String(id)
    );
    const prevQty = Number(prevRow?.qty ?? 0);
    const prevMinStock = Number(prevRow?.minStock ?? 0);
    const prevStatus = getStockStatus(prevQty, prevMinStock);
    const nextStatus = getStockStatus(qtyNum, minStockNum);

    const payload = {
      id,
      name,
      brand: editBrand?.trim() || null,
      category: editCategory?.trim() || null,
      sku: editSku?.trim() || null,
      qty: qtyNum,
      minStock: minStockNum,
      nextExpiry: expiryTrim || null,
      photoUrl: editPhotoUri || null,
      photoUri: editPhotoUri || null,
    };

    const saveFn = pickSaveFn(app);

    try {
      setUpdating(true);

      if (typeof saveFn === 'function') {
        await saveFn(payload);
      } else if (
        typeof (productRepo as any)?.upsert === 'function'
      ) {
        await (productRepo as any).upsert(payload);
      } else {
        setListState((prev) => {
          const base = Array.isArray(prev) ? prev : [];
          return base.map((row: any) => {
            const q = row?.props ?? row;
            if (String(q?.id) !== String(id)) return row;
            const newProps = { ...q, ...payload };
            return row?.props
              ? { ...row, props: newProps }
              : newProps;
          });
        });
      }

      setShowEdit(false);
      Alert.alert('Listo', 'Los cambios se guardaron correctamente.');

      await fetch();

      if (prevStatus !== nextStatus && nextStatus !== 'ok') {
        const statusType = nextStatus === 'none' ? 'out' : 'low';
        void notifyStockAlert({
          name,
          status: statusType,
          qty: qtyNum,
          minStock: minStockNum,
        });
      }

      try {
        await refreshExpiryNotifications();
      } catch (err) {
        console.log(
          '[ProductList] error al refrescar notificaciones (editar)',
          err
        );
      }
    } catch (e) {
      console.log('[ProductList] update error', e);
      Alert.alert('Error', 'No se pudo guardar el producto.');
    } finally {
      setUpdating(false);
    }
  }, [
    app,
    data,
    editId,
    editName,
    editBrand,
    editCategory,
    editSku,
    editQty,
    editMinStock,
    editExpiry,
    editPhotoUri,
    fetch,
  ]);

  // Eliminar (persistente con SQLite)
  const onDelete = useCallback(async (id: string) => {
    try {
      setDeleting(true);

      // ❗ Si el repo no está disponible o no tiene remove, avisamos
      if (!productRepo || typeof (productRepo as any)?.remove !== 'function') {
        Alert.alert(
          'Función no disponible',
          'No se pudo acceder a la base de datos para eliminar el producto.\n\n' +
            'Es posible que el repositorio local no esté inicializado correctamente.'
        );
        return;
      }

      await (productRepo as any).remove(id);

      // Marcamos como eliminado en memoria
      setDeletedIds(prev => {
        const s = new Set(prev);
        s.add(String(id));
        return s;
      });

      setListState(prev => {
        if (!Array.isArray(prev) || prev.length === 0) return prev;
        return prev.filter((r: any) => String((r?.props ?? r)?.id) !== String(id));
      });

      setShowEdit(false);
      await fetch();

      try {
        await refreshExpiryNotifications();
      } catch (err) {
        console.log('[ProductList] error al refrescar notificaciones (eliminar)', err);
      }
    } catch (e: any) {
      console.log('[ProductList] delete error', e);
      Alert.alert(
        'Error',
        e?.message
          ? `No se pudo eliminar el producto.\n\n${e.message}`
          : 'No se pudo eliminar el producto.'
      );
    } finally {
      setDeleting(false);
    }
  }, [fetch]);

  const confirmDelete = useCallback(
    (id: string) => {
      Alert.alert(
        'Eliminar producto',
        '¿Seguro que quieres eliminar este producto?',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Eliminar',
            style: 'destructive',
            onPress: () => onDelete(id),
          },
        ]
      );
    },
    [onDelete]
  );

      const renderItem = ({
    item,
  }: {
    item: ProductVM & { __skeleton?: boolean };
  }) => {
    if (item.__skeleton) return <SkeletonCard />;

    const expiry = expiryOf(item.nextExpiry ?? null);
    const qty = Number(item.qty ?? 0);
    const minStock =
      typeof item.minStock === 'number' && Number.isFinite(item.minStock)
        ? item.minStock
        : 0;

    const isOutOfStock = qty === 0;
    const isLowStock = !isOutOfStock && minStock > 0 && qty <= minStock;
    const missingToMin =
      isLowStock && minStock > 0 ? Math.max(0, minStock - qty) : 0;

    return (
      <View style={styles.card}>
        {/* FILA PRINCIPAL: foto + info + qty */}
        <View style={styles.row}>
          {/* Izquierda: abre editor */}
          <TouchableOpacity
            onPress={() => openEdit(item)}
            activeOpacity={0.8}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            {item.photoUrl ? (
              <Image source={{ uri: item.photoUrl }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]} />
            )}

            <View style={{ width: 12 }} />

            <View style={styles.mainCol}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {[item.brand, item.category, item.sku].filter(Boolean).join(' · ') || '—'}
              </Text>

              <View style={styles.pillRow}>
                <View
                  style={[
                    styles.expiryPill,
                    {
                      backgroundColor: expiry.color,
                      borderColor: expiry.color,
                      opacity: expiry.status === 'none' ? 0.4 : 1,
                    },
                  ]}
                >
                  <Text style={styles.expiryPillText}>{expiry.label}</Text>
                </View>

                {isOutOfStock && (
                  <View style={[styles.expiryPill, styles.lowStockPill]}>
                    <Text style={styles.expiryPillText}>SIN STOCK</Text>
                  </View>
                )}

                {isLowStock && (
                  <View style={[styles.expiryPill, styles.lowStockPill]}>
                    <Text style={styles.expiryPillText}>BAJO STOCK</Text>
                  </View>
                )}
              </View>

              {isLowStock && missingToMin > 0 && (
                <Text style={styles.missingText}>
                  Faltan {missingToMin} unidades para el stock mínimo ({minStock})
                </Text>
              )}
            </View>
          </TouchableOpacity>

          {/* Controles de cantidad */}
          <View style={styles.qtyControls}>
            <TouchableOpacity
              style={styles.qtyBtn}
              onPress={() => onDelta(item.id, -1)}
              hitSlop={8}
            >
              <Text style={styles.qtyBtnText}>−</Text>
            </TouchableOpacity>

            <Text
              style={[
                styles.qty,
                (isOutOfStock || isLowStock) && styles.qtyLow,
                { marginHorizontal: 8 },
              ]}
            >
              {qty}
            </Text>

            <TouchableOpacity
              style={styles.qtyBtn}
              onPress={() => onDelta(item.id, +1)}
              hitSlop={8}
            >
              <Text style={styles.qtyBtnText}>＋</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* FILA DE ACCIONES: abajo, no comprime el contenido */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionIconBtn, styles.actionPrimary]}
            onPress={() =>
              navigation.navigate('Movements', {
                productId: item.id,
                productName: item.name,
              })
            }
            accessibilityLabel="Ver movimientos de stock"
          >
            <Text style={styles.actionIconText}>📈</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionIconBtn}
            onPress={() => openEdit(item)}
            accessibilityLabel="Editar producto"
          >
            <Text style={styles.actionIconText}>⋮</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };


  const EmptyState = ({
    hasAnyProducts,
    hasActiveFilters,
    onClearFilters,
    onAddProduct,
  }: {
    hasAnyProducts: boolean;
    hasActiveFilters: boolean;
    onClearFilters: () => void;
    onAddProduct: () => void;
  }) => {
    // Caso 1: no hay ningún producto en el inventario
    if (!hasAnyProducts) {
      return (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>No hay productos</Text>
          <Text style={styles.emptySubtitle}>
            Agrega el primero para comenzar.
          </Text>
          <TouchableOpacity
            style={[styles.addButton, styles.primary]}
            onPress={onAddProduct}
          >
            <Text style={styles.addButtonText}>
              Agregar producto
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Caso 2: sí hay productos, pero los filtros dejan la lista vacía
    if (hasActiveFilters) {
      return (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>Sin resultados</Text>
          <Text style={styles.emptySubtitle}>
            No hay productos que coincidan con la búsqueda
            o filtros actuales.
          </Text>
          <TouchableOpacity
            style={[styles.addButton, styles.secondary]}
            onPress={onClearFilters}
          >
            <Text style={styles.addButtonText}>
              Limpiar filtros
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Fallback raro (por si acaso)
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyTitle}>No hay productos visibles</Text>
        <Text style={styles.emptySubtitle}>
          Puedes ajustar los filtros o agregar un nuevo producto.
        </Text>
        <TouchableOpacity
          style={[styles.addButton, styles.primary]}
          onPress={onAddProduct}
        >
          <Text style={styles.addButtonText}>
            Agregar producto
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* 🔍 Buscador + botón limpiar */}
      <View style={styles.searchBarContainer}>
        <View style={styles.searchInputWrapper}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por nombre, marca o SKU"
            placeholderTextColor="rgba(255,255,255,0.5)"
            style={styles.searchInput}
            autoCorrect={false}
          />
        </View>

        {!!search && (
          <TouchableOpacity
            onPress={() => setSearch('')}
          >
            <Text style={styles.clearSearchText}>
              Limpiar
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 🎯 Filtros rápidos */}
      <View style={styles.filterChipsRow}>
        <TouchableOpacity
          style={[
            styles.filterChip,
            filter === 'all' && styles.filterChipActive,
          ]}
          onPress={() => setFilter('all')}
        >
          <Text
            style={[
              styles.filterChipText,
              filter === 'all' &&
                styles.filterChipTextActive,
            ]}
          >
            Todos
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterChip,
            filter === 'aboutToExpire' &&
              styles.filterChipActive,
          ]}
          onPress={() => setFilter('aboutToExpire')}
        >
          <Text
            style={[
              styles.filterChipText,
              filter === 'aboutToExpire' &&
                styles.filterChipTextActive,
            ]}
          >
            Por vencer
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterChip,
            filter === 'expired' &&
              styles.filterChipActive,
          ]}
          onPress={() => setFilter('expired')}
        >
          <Text
            style={[
              styles.filterChipText,
              filter === 'expired' &&
                styles.filterChipTextActive,
            ]}
          >
            Vencidos
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterChip,
            filter === 'outOfStock' &&
              styles.filterChipActive,
          ]}
          onPress={() => setFilter('outOfStock')}
        >
          <Text
            style={[
              styles.filterChipText,
              filter === 'outOfStock' &&
                styles.filterChipTextActive,
            ]}
          >
            Sin stock
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterChip,
            filter === 'lowStock' &&
              styles.filterChipActive,
          ]}
          onPress={() => setFilter('lowStock')}
        >
          <Text
            style={[
              styles.filterChipText,
              filter === 'lowStock' &&
                styles.filterChipTextActive,
            ]}
          >
            Bajo stock
          </Text>
        </TouchableOpacity>
      </View>

      {/* 📊 Resumen */}
      <View style={styles.summaryRow}>
        <TouchableOpacity
          style={styles.summaryItem}
          onPress={() => setFilter('all')}
        >
          <Text style={styles.summaryNumber}>
            {summary.total}
          </Text>
          <Text style={styles.summaryLabel}>
            Productos
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.summaryItem}
          onPress={() => setFilter('expired')}
        >
          <Text
            style={[
              styles.summaryNumber,
              { color: '#ef4444' },
            ]}
          >
            {summary.expired}
          </Text>
          <Text style={styles.summaryLabel}>
            Vencidos
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.summaryItem}
          onPress={() => setFilter('aboutToExpire')}
        >
          <Text
            style={[
              styles.summaryNumber,
              { color: '#fb923c' },
            ]}
          >
            {summary.expSoon}
          </Text>
          <Text style={styles.summaryLabel}>
            Por vencer
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.summaryItem}
          onPress={() => setFilter('lowStock')}
          onLongPress={() =>
            Alert.alert(
              'Ver alertas de stock',
              '¿Qué deseas ver?',
              [
                {
                  text: 'Bajo stock',
                  onPress: () => setFilter('lowStock'),
                },
                {
                  text: 'Sin stock',
                  onPress: () => setFilter('outOfStock'),
                },
                { text: 'Cancelar', style: 'cancel' },
              ]
            )
          }
          delayLongPress={250}
        >
          <Text
            style={[
              styles.summaryNumber,
              { color: '#fbbf24' },
            ]}
          >
            {summary.outOfStock + summary.lowStock}
          </Text>
          <Text style={styles.summaryLabel}>
            Con alerta de stock
          </Text>
        </TouchableOpacity>
      </View>

      {/* Categorías (fila fija arriba, distinta a los filtros de estado) */}
      {categories.length > 0 && (
        <View style={styles.categorySection}>
          <Text style={styles.categoryTitle}>Categorías</Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryChipsRow}
          >
            {categories.map((cat) => {
              const active = selectedCategory === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryChip,
                    active && styles.categoryChipActive,
                  ]}
                  onPress={() =>
                    setSelectedCategory(active ? null : cat)
                  }
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      active && styles.categoryChipTextActive,
                    ]}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Lista principal */}
      <FlatList
        data={data}
        keyExtractor={(it) => String(it.id)}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              hasAnyProducts={hasAnyProducts}
              hasActiveFilters={hasActiveFilters}
              onClearFilters={() => {
                setSearch('');
                setFilter('all');
                setSelectedCategory(null);
              }}
              onAddProduct={() => {
                setExpiryOffset(soonDays);
                setShowAdd(true);
              }}
            />
          ) : null
        }
        contentContainerStyle={
          data.length === 0
            ? {
                flex: 1,
                justifyContent: 'center',
                alignItems: 'center',
              }
            : undefined
        }
      />

      {/* Modal: alta NUEVO producto */}
      <Modal
        visible={showAdd}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAdd(false)}
      >
        <View style={styles.modal}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Nuevo producto
            </Text>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              {/* Foto */}
              <View style={styles.photoRow}>
                <View style={styles.photoPreviewWrap}>
                  {photoUri ? (
                    <Image
                      source={{ uri: photoUri }}
                      style={styles.photoPreview}
                    />
                  ) : (
                    <View
                      style={[
                        styles.photoPreview,
                        styles.thumbEmpty,
                      ]}
                    />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <View
                    style={{ flexDirection: 'row' }}
                  >
                    <TouchableOpacity
                      style={[
                        styles.smallChip,
                        styles.secondary,
                      ]}
                      onPress={() =>
                        pickFromLibrary(setPhotoUri)
                      }
                    >
                      <Text
                        style={styles.smallChipText}
                      >
                        Galería
                      </Text>
                    </TouchableOpacity>
                    <View style={{ width: 8 }} />
                    <TouchableOpacity
                      style={[
                        styles.smallChip,
                        styles.secondary,
                      ]}
                      onPress={() =>
                        takePhoto(setPhotoUri)
                      }
                    >
                      <Text
                        style={styles.smallChipText}
                      >
                        Cámara
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Campos - NUEVO PRODUCTO */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>
                  Nombre
                </Text>
                <TextInput
                  placeholder="Ej: Cerveza IPA"
                  value={newName}
                  onChangeText={setNewName}
                  autoFocus
                  style={styles.input}
                  placeholderTextColor="rgba(255,255,255,0.5)"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>
                  Marca
                </Text>
                <TextInput
                  placeholder="Ej: Kunstmann"
                  value={newBrand}
                  onChangeText={setNewBrand}
                  style={styles.input}
                  placeholderTextColor="rgba(255,255,255,0.5)"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Categoría</Text>
                <Text style={styles.fieldHint}>
                  Ej: Fideos, Bebidas, Dulces
                </Text>
                <TextInput
                  placeholder="Ej: Fideos"
                  value={newCategory}
                  onChangeText={setNewCategory}
                  style={styles.input}
                  placeholderTextColor="rgba(255,255,255,0.5)"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>
                  SKU (opcional)
                </Text>
                <Text style={styles.fieldHint}>
                  Código, código de barras o
                  identificador interno
                </Text>
                <TextInput
                  placeholder="Ej: SKU-00123"
                  value={newSku}
                  onChangeText={setNewSku}
                  autoCapitalize="characters"
                  style={styles.input}
                  placeholderTextColor="rgba(255,255,255,0.5)"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>
                  Stock inicial
                </Text>
                <Text style={styles.fieldHint}>
                  Unidades que tienes ahora mismo
                </Text>
                <TextInput
                  placeholder="Ej: 12"
                  value={newQty}
                  onChangeText={setNewQty}
                  keyboardType="numeric"
                  style={styles.input}
                  placeholderTextColor="rgba(255,255,255,0.5)"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>
                  Stock mínimo (bajo stock)
                </Text>
                <Text style={styles.fieldHint}>
                  Solo para mostrar la etiqueta
                  BAJO STOCK en la lista
                </Text>
                <TextInput
                  placeholder="Ej: 3 (opcional)"
                  value={newMinStock}
                  onChangeText={setNewMinStock}
                  keyboardType="numeric"
                  style={styles.input}
                  placeholderTextColor="rgba(255,255,255,0.5)"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>
                  Fecha de vencimiento
                </Text>
                <Text style={styles.fieldHint}>
                  Formato AAAA-MM-DD
                </Text>
                <TextInput
                  placeholder="Ej: 2024-12-31"
                  value={newExpiry}
                  onChangeText={setNewExpiry}
                  style={styles.input}
                  placeholderTextColor="rgba(255,255,255,0.5)"
                />
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  marginBottom: 8,
                }}
              >
                <TouchableOpacity
                  style={[
                    styles.smallChip,
                    styles.secondary,
                  ]}
                  onPress={() => setExpiryOffset(0)}
                >
                  <Text style={styles.smallChipText}>
                    Hoy
                  </Text>
                </TouchableOpacity>
                <View style={{ width: 8 }} />
                <TouchableOpacity
                  style={[
                    styles.smallChip,
                    styles.secondary,
                  ]}
                  onPress={() => setExpiryOffset(7)}
                >
                  <Text style={styles.smallChipText}>
                    +7d
                  </Text>
                </TouchableOpacity>
                <View style={{ width: 8 }} />
                <TouchableOpacity
                  style={[
                    styles.smallChip,
                    styles.secondary,
                  ]}
                  onPress={() =>
                    setExpiryOffset(30)
                  }
                >
                  <Text style={styles.smallChipText}>
                    +30d
                  </Text>
                </TouchableOpacity>
                <View style={{ width: 8 }} />
                <TouchableOpacity
                  style={[
                    styles.smallChip,
                    styles.secondary,
                  ]}
                  onPress={() =>
                    setNewExpiry('')
                  }
                >
                  <Text style={styles.smallChipText}>
                    Limpiar
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            {/* Acciones NUEVO producto */}
            <View
              style={[
                styles.modalActions,
                { justifyContent: 'flex-end' },
              ]}
            >
              <TouchableOpacity
                onPress={() => setShowAdd(false)}
                style={[
                  styles.addButton,
                  styles.secondary,
                  { marginRight: 8 },
                ]}
                disabled={saving}
              >
                <Text style={styles.addButtonText}>
                  Cancelar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onSaveNewProduct}
                style={[
                  styles.addButton,
                  styles.primary,
                ]}
                disabled={saving}
              >
                <Text style={styles.addButtonText}>
                  {saving ? 'Guardando…' : 'Guardar'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: edición producto */}
      <Modal
        visible={showEdit}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEdit(false)}
      >
        <View style={styles.modal}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Editar producto
            </Text>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              {/* Foto (edición) */}
              <View style={styles.photoRow}>
                <View style={styles.photoPreviewWrap}>
                  {editPhotoUri ? (
                    <Image
                      source={{ uri: editPhotoUri }}
                      style={styles.photoPreview}
                    />
                  ) : (
                    <View
                      style={[
                        styles.photoPreview,
                        styles.thumbEmpty,
                      ]}
                    />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <View
                    style={{ flexDirection: 'row' }}
                  >
                    <TouchableOpacity
                      style={[
                        styles.smallChip,
                        styles.secondary,
                      ]}
                      onPress={() =>
                        pickFromLibrary(setEditPhotoUri)
                      }
                    >
                      <Text
                        style={styles.smallChipText}
                      >
                        Galería
                      </Text>
                    </TouchableOpacity>
                    <View style={{ width: 8 }} />
                    <TouchableOpacity
                      style={[
                        styles.smallChip,
                        styles.secondary,
                      ]}
                      onPress={() =>
                        takePhoto(setEditPhotoUri)
                      }
                    >
                      <Text
                        style={styles.smallChipText}
                      >
                        Cámara
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Campos - EDITAR PRODUCTO */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>
                  Nombre
                </Text>
                <TextInput
                  placeholder="Ej: Cerveza IPA"
                  value={editName}
                  onChangeText={setEditName}
                  style={styles.input}
                  placeholderTextColor="rgba(255,255,255,0.5)"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>
                  Marca
                </Text>
                <TextInput
                  placeholder="Ej: Kunstmann"
                  value={editBrand}
                  onChangeText={setEditBrand}
                  style={styles.input}
                  placeholderTextColor="rgba(255,255,255,0.5)"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Categoría</Text>
                <Text style={styles.fieldHint}>
                  Ej: Fideos, Bebidas, Dulces
                </Text>
                <TextInput
                  placeholder="Ej: Fideos"
                  value={editCategory}
                  onChangeText={setEditCategory}
                  style={styles.input}
                  placeholderTextColor="rgba(255,255,255,0.5)"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>
                  SKU (opcional)
                </Text>
                <Text style={styles.fieldHint}>
                  Código, código de barras o
                  identificador interno
                </Text>
                <TextInput
                  placeholder="Ej: SKU-00123"
                  value={editSku}
                  onChangeText={setEditSku}
                  autoCapitalize="characters"
                  style={styles.input}
                  placeholderTextColor="rgba(255,255,255,0.5)"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>
                  Stock actual
                </Text>
                <Text style={styles.fieldHint}>
                  Unidades que tienes ahora mismo
                </Text>
                <TextInput
                  placeholder="Ej: 12"
                  value={editQty}
                  onChangeText={setEditQty}
                  keyboardType="numeric"
                  style={styles.input}
                  placeholderTextColor="rgba(255,255,255,0.5)"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>
                  Stock mínimo (bajo stock)
                </Text>
                <Text style={styles.fieldHint}>
                  Solo para mostrar la etiqueta
                  BAJO STOCK en la lista
                </Text>
                <TextInput
                  placeholder="Ej: 3 (opcional)"
                  value={editMinStock}
                  onChangeText={setEditMinStock}
                  keyboardType="numeric"
                  style={styles.input}
                  placeholderTextColor="rgba(255,255,255,0.5)"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>
                  Fecha de vencimiento
                </Text>
                <Text style={styles.fieldHint}>
                  Formato AAAA-MM-DD
                </Text>
                <TextInput
                  placeholder="Ej: 2024-12-31"
                  value={editExpiry}
                  onChangeText={setEditExpiry}
                  style={styles.input}
                  placeholderTextColor="rgba(255,255,255,0.5)"
                />
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  marginBottom: 8,
                }}
              >
                <TouchableOpacity
                  style={[
                    styles.smallChip,
                    styles.secondary,
                  ]}
                  onPress={() =>
                    setEditExpiryOffset(0)
                  }
                >
                  <Text style={styles.smallChipText}>
                    Hoy
                  </Text>
                </TouchableOpacity>
                <View style={{ width: 8 }} />
                <TouchableOpacity
                  style={[
                    styles.smallChip,
                    styles.secondary,
                  ]}
                  onPress={() =>
                    setEditExpiryOffset(7)
                  }
                >
                  <Text style={styles.smallChipText}>
                    +7d
                  </Text>
                </TouchableOpacity>
                <View style={{ width: 8 }} />
                <TouchableOpacity
                  style={[
                    styles.smallChip,
                    styles.secondary,
                  ]}
                  onPress={() =>
                    setEditExpiryOffset(30)
                  }
                >
                  <Text style={styles.smallChipText}>
                    +30d
                  </Text>
                </TouchableOpacity>
                <View style={{ width: 8 }} />
                <TouchableOpacity
                  style={[
                    styles.smallChip,
                    styles.secondary,
                  ]}
                  onPress={() =>
                    setEditExpiry('')
                  }
                >
                  <Text style={styles.smallChipText}>
                    Limpiar
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            {/* Acciones edición */}
            <View
              style={[
                styles.modalActions,
                { justifyContent: 'space-between' },
              ]}
            >
              <TouchableOpacity
                onPress={() =>
                  editId && confirmDelete(editId)
                }
                style={[
                  styles.addButton,
                  {
                    borderColor:
                      'rgba(255,100,100,0.5)',
                    backgroundColor:
                      'rgba(255,80,80,0.18)',
                  },
                ]}
                disabled={deleting}
              >
                <Text style={styles.addButtonText}>
                  Eliminar
                </Text>
              </TouchableOpacity>

              <View
                style={{ flexDirection: 'row' }}
              >
                <TouchableOpacity
                  onPress={() => setShowEdit(false)}
                  style={[
                    styles.addButton,
                    styles.secondary,
                    { marginRight: 8 },
                  ]}
                  disabled={updating}
                >
                  <Text style={styles.addButtonText}>
                    Cancelar
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={onSaveEdit}
                  style={[
                    styles.addButton,
                    styles.primary,
                  ]}
                  disabled={updating}
                >
                  <Text style={styles.addButtonText}>
                    {updating
                      ? 'Guardando…'
                      : 'Guardar'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          setExpiryOffset(soonDays);
          setShowAdd(true);
        }}
        accessibilityLabel="Nuevo producto"
      >
        <Text style={styles.fabIcon}>＋</Text>
      </TouchableOpacity>
    </View>
  );
}

function SkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View
          style={[styles.thumb, styles.thumbEmpty]}
        />
        <View style={{ width: 12 }} />
        <View style={{ flex: 1 }}>
          <View style={styles.skelLine} />
          <View
            style={[
              styles.skelLine,
              { width: '50%' },
            ]}
          />
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

  fab: {
    position: 'absolute',
    right: 18,
    bottom: 18,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#05A86D',
    borderWidth: 1,
    borderColor: 'rgba(180,255,220,0.6)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
    zIndex: 100,
  },
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
    width: 54,
    height: 54,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(170, 230, 255, 0.25)',
  },
  thumbEmpty: { backgroundColor: 'rgba(255,255,255,0.06)' },

  name: {
    fontWeight: '800',
    fontSize: 18,
    color: '#EFFFFB',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    includeFontPadding: false,
  },
  meta: {
    fontSize: 12,
    color: '#BFE7F2',
    opacity: 0.95,
    marginTop: 2,
    letterSpacing: 0.2,
    includeFontPadding: false,
  },
  qty: {
    fontWeight: '800',
    fontSize: 17,
    color: '#9FFFAF',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    includeFontPadding: false,
  },
  qtyLow: {
    color: '#FF9AA2',
  },

  mainCol: {
    flex: 1,
    paddingRight: 24,
    marginRight: 8,
  },

  emptyWrap: { alignItems: 'center' },
  emptyTitle: {
    color: '#EFFFFB',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
    marginTop: 8,
  },
  emptySubtitle: { color: '#CFE8CF', opacity: 0.85, marginBottom: 12 },

  addButton: {
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  addButtonText: { color: '#EFFFFB', fontWeight: '800', letterSpacing: 0.2 },
  primary: {
    backgroundColor: 'rgba(0,170,140,0.28)',
    borderColor: 'rgba(0,220,180,0.55)',
  },
  secondary: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.22)',
  },

  skelLine: {
    height: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.10)',
    marginVertical: 3,
  },
  skelDot: {
    width: 30,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },

  fabIcon: {
    fontSize: 30,
    color: 'white',
    lineHeight: 30,
    fontWeight: '800',
  },

  modal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    borderRadius: 16,
    backgroundColor: 'rgba(10, 28, 36, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(94, 231, 255, 0.35)',
    padding: 16,
  },
  modalTitle: {
    color: '#EFFFFB',
    fontWeight: '800',
    fontSize: 18,
    marginBottom: 10,
    letterSpacing: 0.2,
  },

  fieldGroup: {
    marginBottom: 14,
  },
  fieldLabel: {
    color: '#EFFFFB',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  fieldHint: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    marginBottom: 4,
    opacity: 0.9,
  },

  input: {
    borderWidth: 1,
    borderColor: 'rgba(170, 230, 255, 0.30)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: 'white',
    marginBottom: 0,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },

  modalActions: { flexDirection: 'row', justifyContent: 'flex-end' },

  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  qtyBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(170, 230, 255, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  qtyBtnText: {
    color: '#EFFFFB',
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '900',
    textAlign: 'center',
  },

  pillRow: {
    flexDirection: 'row',
    marginTop: 6,
    flexWrap: 'wrap',
    columnGap: 6,
    rowGap: 4,
  },

  expiryPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginRight: 8,
  },
  expiryPillText: {
    color: '#EFFFFB',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
    includeFontPadding: false,
  },
  lowStockPill: {
    backgroundColor: 'rgba(248,113,113,0.22)',
    borderColor: 'rgba(248,113,113,0.65)',
  },

  smallChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(170,230,255,0.30)',
  },
  smallChipText: {
    color: '#EFFFFB',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  smallBtnText: {
    marginLeft: 6,
    color: '#9FE8FF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  photoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  photoPreviewWrap: {
    width: 64,
    height: 64,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(170, 230, 255, 0.30)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  photoPreview: { width: '100%', height: '100%' },

  moreBtn: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(170,230,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  moreBtnText: {
    color: '#EFFFFB',
    fontSize: 16,
    fontWeight: '900',
    includeFontPadding: false,
  },

  // Buscador + filtros
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  searchInputWrapper: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(170,230,255,0.30)',
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
  },
  searchInput: {
    color: '#EFFFFB',
    fontSize: 14,
  },
  clearSearchText: {
    marginLeft: 8,
    color: '#9FE8FF',
    fontSize: 12,
    fontWeight: '700',
  },

  filterChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 6,
    rowGap: 6,
    marginBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(170,230,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  filterChipActive: {
    backgroundColor: 'rgba(5,168,109,0.25)',
    borderColor: 'rgba(5,168,109,0.8)',
  },
  filterChipText: {
    color: '#CFE8FF',
    fontSize: 12,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: '#EFFFFB',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    marginRight: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(170,230,255,0.20)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  summaryNumber: {
    color: '#EFFFFB',
    fontSize: 16,
    fontWeight: '900',
  },
  summaryLabel: {
    color: '#CFE8FF',
    fontSize: 11,
    opacity: 0.85,
  },

  // Botón backup en header
  exportButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: '#111827',
  },
  exportLabel: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },

  categorySection: {
    marginTop: 4,
    marginBottom: 12,
  },

  categoryTitle: {
    color: '#AEE9FF',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },

  categoryChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
    gap: 8,
  },

  categoryChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(170, 230, 255, 0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'transparent',
  },

  categoryChipActive: {
    backgroundColor: '#13B38B',
    borderColor: '#13B38B',
  },

  categoryChipText: {
    color: '#AEE9FF',
    fontSize: 12,
  },

  categoryChipTextActive: {
    color: '#04121B',
    fontWeight: '700',
  },

  missingText: {
    marginTop: 4,
    color: '#FACC15',
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.9,
  },
    actionsRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    columnGap: 8,
  },
  actionIconBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(170,230,255,0.30)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  actionPrimary: {
    borderColor: 'rgba(5,168,109,0.8)',
    backgroundColor: 'rgba(5,168,109,0.25)',
  },
  actionIconText: {
    color: '#EFFFFB',
    fontSize: 14,
    fontWeight: '800',
  },

});


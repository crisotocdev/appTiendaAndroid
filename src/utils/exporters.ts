// src/utils/exporters.ts
import { Platform, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';

type Row = Record<string, string | number | null | undefined>;

const Encoding: any = (FileSystem as any).EncodingType ?? { UTF8: 'utf8' };
const SAF: any = (FileSystem as any).StorageAccessFramework;
const BACKUP_DIR = FileSystem.documentDirectory + 'backups';

function escapeCSV(v: any): string {
  const s = v == null ? '' : String(v);
  const needsWrap = /[",\n]/.test(s);
  const doubled = s.replace(/"/g, '""');
  return needsWrap ? `"${doubled}"` : doubled;
}

function timestamp() {
  const ts = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(
    ts.getDate()
  )}_${pad(ts.getHours())}${pad(ts.getMinutes())}`;
}

/** Helpers para construir datos **/

type BuiltPayload = {
  data: string;
  name: string;
  mime: string;
  kind: 'CSV' | 'JSON';
};

function buildCSV(rows: Row[], filename?: string): BuiltPayload {
  const cols = [
    'id',
    'name',
    'brand',
    'category',
    'sku',
    'qty',
    'minStock',
    'nextExpiry',
    'daysToExpiry',
    'expiryStatus',
  ];

  const header = cols.join(',');
  const body = rows
    .map((r) => cols.map((c) => escapeCSV(r[c])).join(','))
    .join('\n');
  const csv = `${header}\n${body}\n`;

  const name = filename ?? `inventory-export_${timestamp()}.csv`;
  const mime = 'text/csv';

  return { data: csv, name, mime, kind: 'CSV' };
}

function buildJSON(rows: Row[], filename?: string): BuiltPayload {
  const json = JSON.stringify(rows, null, 2);
  const name = filename ?? `inventory-export_${timestamp()}.json`;
  const mime = 'application/json';

  return { data: json, name, mime, kind: 'JSON' };
}

async function ensureBackupDir() {
  const info = await FileSystem.getInfoAsync(BACKUP_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(BACKUP_DIR, { intermediates: true });
  }
}

async function saveInternalJSONBackup(
  baseName: string,
  jsonContent: string
): Promise<string> {
  await ensureBackupDir();

  const fileName = `${baseName}_backup_${timestamp()}.json`;
  const uri = `${BACKUP_DIR}/${fileName}`;

  await FileSystem.writeAsStringAsync(uri, jsonContent, {
    encoding: Encoding.UTF8,
  });

  return uri;
}

async function shareIfPossible(uri: string, mime: string, title: string) {
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: mime,
      dialogTitle: title,
    } as any);
  } else {
    Alert.alert(
      'Compartir no disponible',
      'Tu dispositivo no permite abrir el panel de compartir desde esta app.\n\nEl archivo igualmente quedó preparado en:\n' +
        uri
    );
  }
}

async function fallbackClipboard(data: string, kind: 'CSV' | 'JSON') {
  try {
    await Clipboard.setStringAsync(data);
    Alert.alert(
      `${kind} copiado`,
      `El contenido se copió al portapapeles.\nÁbrelo en Excel / editor de texto y pega (Ctrl+V).`
    );
    return `clipboard://${kind.toLowerCase()}`;
  } catch (e) {
    throw new Error(
      `No se pudo copiar al portapapeles: ${(e as any)?.message ?? ''}`
    );
  }
}

async function writeWithSAFAndroid(
  name: string,
  data: string,
  mime: string
): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  if (!SAF || typeof SAF.requestDirectoryPermissionsAsync !== 'function')
    return null;
  try {
    const perm = await SAF.requestDirectoryPermissionsAsync();
    if (!perm?.granted || !perm.directoryUri) return null;
    const fileUri = await SAF.createFileAsync(perm.directoryUri, name, mime);
    await SAF.writeAsStringAsync(fileUri, data, {
      encoding: Encoding.UTF8,
    });
    return fileUri; // content://...
  } catch {
    return null;
  }
}

async function writeToAppSandbox(
  name: string,
  data: string,
  kind: 'CSV' | 'JSON'
) {
  const base =
    ((FileSystem as any).cacheDirectory as string | undefined) ??
    ((FileSystem as any).documentDirectory as string | undefined);

  if (!base) {
    // Expo Go en algunos dispositivos no expone rutas: usar clipboard
    return fallbackClipboard(data, kind);
  }

  const uri = base + name;
  await FileSystem.writeAsStringAsync(uri, data, {
    encoding: Encoding.UTF8,
  });
  return uri;
}

/** Guardar (pensado para "Guardar en dispositivo") **/
async function saveBuilt(payload: BuiltPayload): Promise<string> {
  const { data, name, mime, kind } = payload;

  // 1) ANDROID: intentar SAF (elegir carpeta REAL)
  if (Platform.OS === 'android') {
    const safUri = await writeWithSAFAndroid(name, data, mime);
    if (safUri) {
      return safUri;
    }
  }

  // 2) Sandbox o Clipboard
  return writeToAppSandbox(name, data, kind);
}

/** Compartir (NO usa SAF, solo sandbox + compartir) **/
async function shareBuilt(
  payload: BuiltPayload,
  title: string
): Promise<string> {
  const { data, name, mime, kind } = payload;

  const base =
    ((FileSystem as any).cacheDirectory as string | undefined) ??
    ((FileSystem as any).documentDirectory as string | undefined);

  let uri: string;

  if (!base) {
    // Sin carpeta → portapapeles
    uri = await fallbackClipboard(data, kind);
  } else {
    uri = base + name;
    await FileSystem.writeAsStringAsync(uri, data, {
      encoding: Encoding.UTF8,
    });
  }

  if (!uri.startsWith('clipboard://')) {
    await shareIfPossible(uri, mime, title);
  }

  return uri;
}

/** BACKUP JSON **/
export async function backupRowsToJSON(
  rows: Row[],
  baseName: string = 'productos'
) {
  try {
    if (!rows || rows.length === 0) {
      Alert.alert('Sin datos', 'No hay registros para respaldar.');
      return;
    }

    // Construimos el JSON una sola vez
    const built = buildJSON(rows);
    const content = built.data;

    // 1) Backup interno en documentDirectory/backups
    const backupUri = await saveInternalJSONBackup(baseName, content);

    // 2) Aviso al usuario + opción de compartir
    Alert.alert(
      'Backup creado',
      'Se creó una copia de seguridad interna de tus datos.\n\n' +
        'Si quieres, también puedes exportarla o compartirla.',
      [
        {
          text: 'Solo OK',
          style: 'cancel',
        },
        {
          text: 'Compartir ahora',
          onPress: async () => {
            const payload: BuiltPayload = {
              data: content,
              name: backupUri.split('/').pop() || built.name,
              mime: built.mime,
              kind: 'JSON',
            };
            await shareBuilt(payload, 'Compartir backup (JSON)');
          },
        },
      ]
    );
  } catch (err) {
    console.log('Error en backup JSON', err);
    Alert.alert('Error', 'No se pudo crear la copia de seguridad en JSON.');
  }
}

/** EXPORTS PÚBLICOS **/

// 👉 Solo guarda el archivo (si no hay ruta, cae a portapapeles)
export async function saveProductsCSV(rows: Row[], filename?: string) {
  const b = buildCSV(rows, filename);
  return saveBuilt(b);
}

export async function saveProductsJSON(rows: Row[], filename?: string) {
  const b = buildJSON(rows, filename);
  return saveBuilt(b);
}

// 👉 Guarda en sandbox y luego abre el diálogo de compartir
export async function shareProductsCSV(rows: Row[], filename?: string) {
  const b = buildCSV(rows, filename);
  return shareBuilt(b, 'Compartir inventario (CSV)');
}

export async function shareProductsJSON(rows: Row[], filename?: string) {
  const b = buildJSON(rows, filename);
  return shareBuilt(b, 'Compartir inventario (JSON)');
}

// Compat: por si en otro lado usas todavía estos nombres
export async function exportProductsCSV(rows: Row[], filename?: string) {
  return shareProductsCSV(rows, filename);
}

export async function exportProductsJSON(rows: Row[], filename?: string) {
  return shareProductsJSON(rows, filename);
}

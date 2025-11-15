// src/utils/exporters.ts
import { Platform, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy'; // 👈 CAMBIO IMPORTANTE
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';

type Row = Record<string, string | number | null | undefined>;

const Encoding: any = (FileSystem as any).EncodingType ?? { UTF8: 'utf8' };
const SAF: any = (FileSystem as any).StorageAccessFramework;

function escapeCSV(v: any): string {
  const s = v == null ? '' : String(v);
  const needsWrap = /[",\n]/.test(s);
  const doubled = s.replace(/"/g, '""');
  return needsWrap ? `"${doubled}"` : doubled;
}

function timestamp() {
  const ts = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}`;
}

async function shareIfPossible(uri: string, mime: string, title: string) {
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle: title } as any);
  }
}

async function fallbackClipboard(data: string, kind: 'CSV' | 'JSON') {
  try {
    await Clipboard.setStringAsync(data);
    Alert.alert(
      `${kind} copiado`,
      `El contenido se copió al portapapeles.\nÁbrelo en Excel y pega (Ctrl+V).`
    );
    return `clipboard://${kind.toLowerCase()}`;
  } catch (e) {
    throw new Error(`No se pudo copiar al portapapeles: ${(e as any)?.message ?? ''}`);
  }
}

async function writeWithSAFAndroid(name: string, data: string, mime: string): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  if (!SAF || typeof SAF.requestDirectoryPermissionsAsync !== 'function') return null;
  try {
    const perm = await SAF.requestDirectoryPermissionsAsync();
    if (!perm?.granted || !perm.directoryUri) return null;
    const fileUri = await SAF.createFileAsync(perm.directoryUri, name, mime);
    await SAF.writeAsStringAsync(fileUri, data);
    return fileUri; // content://...
  } catch {
    return null;
  }
}

async function writeToAppSandbox(name: string, data: string) {
  const base =
    ((FileSystem as any).cacheDirectory as string | undefined) ??
    ((FileSystem as any).documentDirectory as string | undefined);

  if (!base) {
    // Expo Go en algunos dispositivos no expone rutas: usar clipboard
    return fallbackClipboard(data, name.endsWith('.json') ? 'JSON' : 'CSV');
  }

  const uri = base + name;
  await FileSystem.writeAsStringAsync(uri, data, { encoding: Encoding.UTF8 });
  return uri;
}

export async function exportProductsCSV(rows: Row[], filename?: string) {
  const cols = [
    'id','name','brand','category','sku',
    'qty','minStock','nextExpiry','daysToExpiry','expiryStatus',
  ];
  const header = cols.join(',');
  const body = rows.map(r => cols.map(c => escapeCSV(r[c])).join(',')).join('\n');
  const csv = `${header}\n${body}\n`;

  const name = filename ?? `inventory-export_${timestamp()}.csv`;
  const mime = 'text/csv';

  // 1) ANDROID: intentar SAF (elegir carpeta)
  if (Platform.OS === 'android') {
    const safUri = await writeWithSAFAndroid(name, csv, mime);
    if (safUri) {
      await shareIfPossible(safUri, mime, 'Exportar inventario (CSV)');
      return safUri;
    }
  }

  // 2) Sandbox o Clipboard
  const result = await writeToAppSandbox(name, csv);
  if (result.startsWith('clipboard://')) return result;
  await shareIfPossible(result, mime, 'Exportar inventario (CSV)');
  return result;
}

export async function exportProductsJSON(rows: Row[], filename?: string) {
  const json = JSON.stringify(rows, null, 2);
  const name = filename ?? `inventory-export_${timestamp()}.json`;
  const mime = 'application/json';

  if (Platform.OS === 'android') {
    const safUri = await writeWithSAFAndroid(name, json, mime);
    if (safUri) {
      await shareIfPossible(safUri, mime, 'Exportar inventario (JSON)');
      return safUri;
    }
  }

  const result = await writeToAppSandbox(name, json);
  if (result.startsWith('clipboard://')) return result;
  await shareIfPossible(result, mime, 'Exportar inventario (JSON)');
  return result;
}

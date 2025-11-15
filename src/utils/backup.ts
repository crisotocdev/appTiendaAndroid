// src/utils/backup.ts
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { Alert } from "react-native";

/**
 * Exporta productos a JSON (backup completo)
 */
export async function exportProductsJSON(products: any[]) {
  try {
    const json = JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        items: products,
      },
      null,
      2
    );

    const fileName = `inventario-backup-${Date.now()}.json`;
    const baseDir = (FileSystem as any).documentDirectory;
    const uri = baseDir + fileName;

    await FileSystem.writeAsStringAsync(uri, json);

    await Sharing.shareAsync(uri, {
      mimeType: "application/json",
      dialogTitle: "Exportar backup JSON",
    });

    return uri;
  } catch (err) {
    console.log(err);
    Alert.alert("Error", "No se pudo exportar el backup JSON.");
    return null;
  }
}

/**
 * Importa productos desde un backup JSON seleccionado por el usuario
 * Devuelve un array con los productos del archivo.
 */
export async function importProductsJSON() {
  try {
    const res = await DocumentPicker.getDocumentAsync({
      type: "application/json",
      copyToCacheDirectory: true,
    });

    if (res.canceled) return null;

    const fileUri = res.assets[0].uri;
    const jsonStr = await FileSystem.readAsStringAsync(fileUri);
    const data = JSON.parse(jsonStr);

    if (!data || !Array.isArray(data.items)) {
      Alert.alert("Error", "El archivo no es un backup válido.");
      return null;
    }

    return data.items;
  } catch (err) {
    console.log(err);
    Alert.alert("Error", "No se pudo importar el backup.");
    return null;
  }
}

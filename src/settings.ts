import * as SecureStore from 'expo-secure-store';
import { defaultSettings, type ScanSettings } from './scan-rules';

// The app already keeps its tokens in SecureStore; the settings are a few hundred bytes, well under its limits.
const SETTINGS = 'tradeable.settings';
const LAST_FOLDER = 'tradeable.lastFolder';

export async function loadSettings(): Promise<ScanSettings> {
  const stored = await SecureStore.getItemAsync(SETTINGS).catch(() => null);
  try {
    return { ...defaultSettings, ...(stored ? JSON.parse(stored) : {}) };
  } catch {
    return defaultSettings;
  }
}

export const saveSettings = (settings: ScanSettings) =>
  SecureStore.setItemAsync(SETTINGS, JSON.stringify(settings)).catch(() => undefined);

/** The folder the last batch went to, offered first next time. */
export const loadLastFolder = () => SecureStore.getItemAsync(LAST_FOLDER).catch(() => null);
export const saveLastFolder = (folderId: string) => SecureStore.setItemAsync(LAST_FOLDER, folderId).catch(() => undefined);

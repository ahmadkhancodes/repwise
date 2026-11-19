/**
 * Writes the widget snapshot after every change (bible P-N2):
 * - MMKV (`widget.snapshot.v1`): read by the Android widget task handler, even with the app killed;
 * - iOS App Group UserDefaults via @bacons/apple-targets ExtensionStorage, then reloads WidgetKit;
 * - Android: re-renders every placed widget with requestWidgetUpdate.
 * Skips the write when nothing changed, so frequent local writes stay cheap.
 */
import { ExtensionStorage } from '@bacons/apple-targets';
import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';

import { kv } from '@/services/storage';

import { renderWidget, WIDGET_NAMES } from './android/widgets';
import { parseSnapshot, type WidgetSnapshot } from './snapshot';

export const APP_GROUP = 'group.com.client.repwise';
/** Same key as `snapshotKey` in targets/widget/Snapshot.swift. */
export const SNAPSHOT_KEY = 'repwise.widget.snapshot.v1';
export const MMKV_SNAPSHOT_KEY = 'widget.snapshot.v1';

let lastWritten: string | null = null;

/** Content without the timestamp, to detect real changes. */
function fingerprint(s: WidgetSnapshot): string {
  return JSON.stringify({ ...s, updatedAt: 0 });
}

export function readStoredSnapshot(): WidgetSnapshot | null {
  try {
    return parseSnapshot(kv.getString(MMKV_SNAPSHOT_KEY));
  } catch {
    return null;
  }
}

/** Returns true when the snapshot changed and was written. Never throws. */
export async function writeWidgetSnapshot(snapshot: WidgetSnapshot, force = false): Promise<boolean> {
  const fp = fingerprint(snapshot);
  if (!force && fp === lastWritten) return false;
  lastWritten = fp;
  const json = JSON.stringify(snapshot);
  try {
    kv.set(MMKV_SNAPSHOT_KEY, json);
  } catch {
    // keep going: the platform stores below are what the widgets read
  }
  if (Platform.OS === 'ios') {
    try {
      new ExtensionStorage(APP_GROUP).set(SNAPSHOT_KEY, json);
      ExtensionStorage.reloadWidget();
    } catch {
      // no extension in this build (Expo Go / simulator without target): nothing to update
    }
  } else if (Platform.OS === 'android') {
    await Promise.all(
      Object.values(WIDGET_NAMES).map((widgetName) => {
        const ui = renderWidget(widgetName, snapshot);
        if (!ui) return undefined;
        return requestWidgetUpdate({ widgetName, renderWidget: () => ui }).catch(() => undefined);
      }),
    );
  }
  return true;
}

/** Tests only. */
export function resetWriterForTests(): void {
  lastWritten = null;
}

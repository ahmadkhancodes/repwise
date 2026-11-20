/**
 * Headless widget task (react-native-android-widget), registered in the app entry (index.ts).
 * Runs even when the app is killed: renders from the MMKV snapshot only (no database, no network).
 * Taps use OPEN_URI deep links, so they are handled by the OS without this task.
 */
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { track } from '@/services/analytics';

import { forDate } from '../snapshot';
import { readStoredSnapshot } from '../writer';
import { renderWidget } from './widgets';

function todayLocal(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const { widgetInfo, widgetAction } = props;
  if (widgetAction === 'WIDGET_DELETED') return;
  if (widgetAction === 'WIDGET_ADDED') track('widget_added', { type: widgetInfo.widgetName });
  const now = new Date();
  const snapshot = forDate(readStoredSnapshot(), todayLocal(now), now.getTime());
  const ui = renderWidget(widgetInfo.widgetName, snapshot, { width: widgetInfo.width, height: widgetInfo.height });
  if (ui) props.renderWidget(ui);
}

export { NotificationSettingsScreen } from './screens/NotificationSettingsScreen';
export {
  connectRestTimer,
  updateRestTimerSurface,
  type RestTimerApi,
  type RestTimerState,
} from './restTimer';
export { useNotificationPrefs, getPrefs } from './prefsStore';
export { buildSchedule, type PlannedNotification, type DayPlan } from './logic/schedule';
export {
  refreshPermission,
  requestPermission,
  type PermissionState,
} from '@/services/notifications';

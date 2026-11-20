package expo.modules.repwisetimer

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import expo.modules.notifications.notifications.model.NotificationRequest
import expo.modules.notifications.notifications.triggers.DateTrigger
import expo.modules.notifications.service.NotificationsService
import expo.modules.notifications.service.delegates.SharedPreferencesNotificationsStore
import kotlin.math.abs

/**
 * The N-5 "Rest over" alert is scheduled from JS with expo-notifications (identifier `rw:rest`,
 * high-priority `timer` channel). Without the exact-alarm permission (denied by default on
 * Android 14+) expo falls back to an inexact alarm that can fire more than a minute late. While
 * the rest-timer service runs, it delivers that same scheduled request on time through expo's
 * own trigger path (same content, channel, tap handling), so nothing is ever shown twice.
 * Every call is best effort and never throws: if any of it fails, expo's alarm still fires.
 */
object ExpoRestAlert {
  const val ALERT_ID = "rw:rest"
  /** JS schedules the alert at exactly `endsAt`; allow for clock rounding. */
  private const val MATCH_WINDOW_MS = 2_000L

  private fun request(context: Context): NotificationRequest? = try {
    SharedPreferencesNotificationsStore(context).getNotificationRequest(ALERT_ID)
  } catch (e: Exception) {
    null
  }

  /** Delivers the pending alert now if it is the one for `endsAt`. Returns true if sent. */
  fun fireNow(context: Context, endsAt: Long): Boolean {
    val req = request(context) ?: return false
    val trigger = req.trigger as? DateTrigger ?: return false
    if (abs(trigger.timestamp - endsAt) > MATCH_WINDOW_MS) return false
    return try {
      val pi = NotificationsService.createNotificationTrigger(context, ALERT_ID)
      (context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager)?.cancel(pi)
      // Same intent the alarm would send: present it, then expo removes the spent request.
      pi.send()
      true
    } catch (e: PendingIntent.CanceledException) {
      false
    } catch (e: RuntimeException) {
      false
    }
  }

  /** Moves the pending alert to `endsAt` (+15 s from the notification). */
  fun reschedule(context: Context, endsAt: Long) {
    val req = request(context) ?: return
    val trigger = req.trigger as? DateTrigger ?: return
    try {
      NotificationsService.schedule(
        context,
        NotificationRequest(ALERT_ID, req.content, DateTrigger(trigger.channelId, endsAt, trigger.alarmClock))
      )
    } catch (e: RuntimeException) {
      // keep the old alarm
    }
  }

  /** Skip: the rest is over, so the alert must not fire. */
  fun remove(context: Context) {
    try {
      NotificationsService.removeScheduledNotification(context, ALERT_ID)
    } catch (e: RuntimeException) {
      // nothing scheduled
    }
  }
}

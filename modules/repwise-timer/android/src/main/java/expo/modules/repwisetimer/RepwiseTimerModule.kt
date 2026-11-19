package expo.modules.repwisetimer

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** JS payload (src/features/notifications/restTimer.ts `TimerSurfacePayload`). */
class RestTimerPayload : Record {
  @Field var workoutTitle: String = "Workout"
  @Field var sessionId: String? = null
  @Field var startedAt: Double = 0.0
  @Field var endsAt: Double = 0.0
  @Field var paused: Boolean = false
  @Field var remainingMs: Double = 0.0
  @Field var nextExercise: String? = null
  @Field var nextSet: Int? = null
  @Field var title: String = "Resting"
  @Field var body: String = ""
}

/**
 * Android lock-screen rest timer (W5, RW-23): an ongoing, silent notification whose chronometer
 * counts down to `endsAt`. The system draws the countdown, so it keeps ticking while the app is in
 * the background. The "Rest over" alert itself is a separate expo-notifications alarm (timer channel).
 */
class RepwiseTimerModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  override fun definition() = ModuleDefinition {
    Name("RepwiseTimer")

    Function("areActivitiesEnabled") { false }

    // iOS-only API: no-ops here so the JS bridge can call one shape on both platforms.
    AsyncFunction("update") { _: RestTimerPayload -> false }
    AsyncFunction("end") { }

    AsyncFunction("showOngoing") { payload: RestTimerPayload -> show(payload) }

    AsyncFunction("cancelOngoing") {
      NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
    }
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(CHANNEL_ID, "Rest timer (ongoing)", NotificationManager.IMPORTANCE_LOW).apply {
      description = "The countdown shown while you rest between sets"
      setShowBadge(false)
      setSound(null, null)
      enableVibration(false)
      lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
    }
    nm.createNotificationChannel(channel)
  }

  private fun smallIcon(): Int {
    val id = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (id != 0) id else context.applicationInfo.icon
  }

  private fun contentIntent(sessionId: String?): PendingIntent {
    val uri = if (sessionId != null) "repwise://train?sessionId=${Uri.encode(sessionId)}" else "repwise://train"
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    return PendingIntent.getActivity(
      context, NOTIFICATION_ID, intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun show(p: RestTimerPayload): Boolean {
    val manager = NotificationManagerCompat.from(context)
    if (!manager.areNotificationsEnabled()) return false
    ensureChannel()
    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(smallIcon())
      .setContentTitle(p.title)
      .setContentText(p.body)
      .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setContentIntent(contentIntent(p.sessionId))

    if (p.paused) {
      builder.setUsesChronometer(false).setShowWhen(false)
    } else {
      builder.setUsesChronometer(true)
        .setChronometerCountDown(true)
        .setWhen(p.endsAt.toLong())
        .setShowWhen(true)
        // Remove itself a little after rest ends if the app never gets to cancel it.
        .setTimeoutAfter(maxOf(1_000L, p.endsAt.toLong() - System.currentTimeMillis() + 60_000L))
    }
    return try {
      manager.notify(NOTIFICATION_ID, builder.build())
      true
    } catch (e: SecurityException) {
      false
    }
  }

  companion object {
    const val CHANNEL_ID = "timer-ongoing"
    const val NOTIFICATION_ID = 7301
  }
}

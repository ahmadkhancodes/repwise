package expo.modules.repwisetimer

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat

/**
 * Keeps a running rest precise while the app is in the background: a foreground service that
 * owns the chronometer notification and holds a partial wake lock until the rest ends, then
 * delivers the "Rest over" alert on time (ExpoRestAlert.fireNow) and goes away.
 *
 * - Android 14+: type `shortService` (no extra permission, no Play declaration). The system
 *   allows about 3 minutes; on timeout the service detaches (the countdown stays visible) and
 *   stops, and expo's scheduled alarm is the fallback for longer rests.
 * - Started with startService() only while the app may start services (foreground, or from a
 *   notification action); if that is refused, the caller posts a plain notification instead.
 * - Paused rests need no service: it detaches, posts the paused card and stops.
 */
class RestTimerService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var wakeLock: PowerManager.WakeLock? = null
  /** True when the notification must outlive the service (paused, timed out). */
  private var detach = false
  private val fire = Runnable { onRestEnded() }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    running = true
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val state = RestTimerStore.load(this)
    val now = System.currentTimeMillis()
    if (state == null || !RestTimerNotifier.canPost(this)) {
      stopNow(remove = true)
      return START_NOT_STICKY
    }
    if (!state.isRunning(now)) {
      // Paused (or already over): no countdown to guard. Keep the card, drop the service.
      detach = true
      ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH)
      if (state.paused) RestTimerNotifier.post(this, state) else RestTimerNotifier.cancel(this)
      stopSelf()
      return START_NOT_STICKY
    }
    val notification = RestTimerNotifier.build(this, state, now)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        startForeground(RestTimerNotifier.NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE)
      } else {
        startForeground(RestTimerNotifier.NOTIFICATION_ID, notification)
      }
    } catch (e: Exception) {
      // ForegroundServiceStartNotAllowedException (12+), type/permission errors (14+):
      // fall back to a plain notification; expo's alarm still delivers the alert.
      RestTimerNotifier.post(this, state)
      detach = true
      stopSelf()
      return START_NOT_STICKY
    }
    detach = false
    val delay = maxOf(0L, state.endsAt - now)
    acquireWakeLock(delay + WAKE_SLACK_MS)
    handler.removeCallbacks(fire)
    handler.postDelayed(fire, delay)
    return START_NOT_STICKY
  }

  private fun onRestEnded() {
    val state = RestTimerStore.load(this)
    if (state != null && !state.paused) ExpoRestAlert.fireNow(this, state.endsAt)
    // The alert replaces the countdown; the app clears its state when it next runs.
    stopNow(remove = true)
  }

  /** Android 14 (shortService). */
  override fun onTimeout(startId: Int) {
    detachAndStop()
  }

  /** Android 15+. */
  override fun onTimeout(startId: Int, fgsType: Int) {
    detachAndStop()
  }

  private fun detachAndStop() {
    detach = true
    handler.removeCallbacks(fire)
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH)
    stopSelf()
  }

  private fun stopNow(remove: Boolean) {
    handler.removeCallbacks(fire)
    detach = !remove
    ServiceCompat.stopForeground(this, if (remove) ServiceCompat.STOP_FOREGROUND_REMOVE else ServiceCompat.STOP_FOREGROUND_DETACH)
    if (remove) RestTimerNotifier.cancel(this)
    stopSelf()
  }

  private fun acquireWakeLock(timeoutMs: Long) {
    releaseWakeLock()
    try {
      val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
      wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "repwise:restTimer").apply {
        setReferenceCounted(false)
        acquire(minOf(timeoutMs, MAX_WAKE_MS))
      }
    } catch (e: RuntimeException) {
      wakeLock = null
    }
  }

  private fun releaseWakeLock() {
    try {
      wakeLock?.takeIf { it.isHeld }?.release()
    } catch (e: RuntimeException) {
      // already released by its timeout
    }
    wakeLock = null
  }

  override fun onDestroy() {
    handler.removeCallbacks(fire)
    releaseWakeLock()
    if (!detach) {
      ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
      NotificationManagerCompat.from(this).cancel(RestTimerNotifier.NOTIFICATION_ID)
    }
    running = false
    super.onDestroy()
  }

  companion object {
    private const val WAKE_SLACK_MS = 5_000L
    /** Never hold the CPU longer than a long rest (10 min). */
    private const val MAX_WAKE_MS = 10L * 60L * 1000L

    @Volatile
    var running = false
      private set

    /** Starts (or refreshes) the service from the stored state. False if not allowed now. */
    fun start(context: Context): Boolean = try {
      context.startService(Intent(context, RestTimerService::class.java)) != null
    } catch (e: IllegalStateException) {
      false // background start not allowed
    } catch (e: SecurityException) {
      false
    }

    fun stop(context: Context) {
      try {
        context.stopService(Intent(context, RestTimerService::class.java))
      } catch (e: RuntimeException) {
        // not running
      }
    }
  }
}

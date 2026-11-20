package expo.modules.repwisetimer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Shared names for the +15 s / Skip notification actions. */
object RestTimerActions {
  const val ADD_15 = "add15"
  const val SKIP = "skip"
  const val ACTION_ADD_15 = "expo.modules.repwisetimer.ADD_15"
  const val ACTION_SKIP = "expo.modules.repwisetimer.SKIP"
  private const val ADD_MS = 15_000L

  /** The JS module, when its runtime is alive (set by RepwiseTimerModule). */
  @Volatile
  var listener: (() -> Unit)? = null

  /**
   * Applies a tap natively — notification, foreground service and expo's "Rest over" alarm —
   * so it works with the JS runtime asleep or gone, then queues it for the workout player.
   */
  fun apply(context: Context, action: String, now: Long = System.currentTimeMillis()) {
    val state = RestTimerStore.load(context)
    if (state == null) {
      RestTimerNotifier.cancel(context)
      return
    }
    when (action) {
      ADD_15 -> {
        val next = if (state.paused) {
          state.copy(remainingMs = maxOf(0L, state.remainingMs) + ADD_MS, endsAt = now + maxOf(0L, state.remainingMs) + ADD_MS)
        } else {
          state.copy(endsAt = maxOf(now, state.endsAt) + ADD_MS)
        }
        RestTimerStore.save(context, next)
        if (!next.paused) ExpoRestAlert.reschedule(context, next.endsAt)
        // The service re-reads the store (running rest) or detaches to the paused card.
        if (!RestTimerService.start(context)) RestTimerNotifier.post(context, next)
        RestTimerStore.enqueue(context, ADD_15, now, next)
      }
      SKIP -> {
        RestTimerStore.clear(context)
        ExpoRestAlert.remove(context)
        RestTimerService.stop(context)
        RestTimerNotifier.cancel(context)
        RestTimerStore.enqueue(context, SKIP, now, state)
      }
      else -> return
    }
    listener?.invoke()
  }
}

/** Receives the notification's +15 s / Skip taps (explicit, not exported). */
class RestTimerActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val action = when (intent?.action) {
      RestTimerActions.ACTION_ADD_15 -> RestTimerActions.ADD_15
      RestTimerActions.ACTION_SKIP -> RestTimerActions.SKIP
      else -> return
    }
    val pending = goAsync()
    try {
      RestTimerActions.apply(context.applicationContext, action)
    } catch (e: RuntimeException) {
      // never crash the app from a notification button
    } finally {
      pending.finish()
    }
  }
}

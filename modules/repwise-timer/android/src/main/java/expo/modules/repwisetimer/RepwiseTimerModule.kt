package expo.modules.repwisetimer

import android.content.Context
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

  fun toState(now: Long): RestState {
    val remaining = maxOf(0L, remainingMs.toLong())
    val ends = if (endsAt > 0) endsAt.toLong() else now + remaining
    return RestState(
      workoutTitle = workoutTitle,
      sessionId = sessionId,
      startedAt = if (startedAt > 0) minOf(startedAt.toLong(), ends) else now,
      endsAt = ends,
      paused = paused,
      remainingMs = remaining,
      nextExercise = nextExercise,
      nextSet = nextSet,
      title = title,
      body = body,
    )
  }
}

/**
 * Android lock-screen rest timer (W5, RW-23): an ongoing, silent notification whose chronometer
 * counts down to `endsAt` (drawn by the system, so no JS ticks), kept precise in the background by
 * RestTimerService, which also delivers the expo-notifications "Rest over" alert on time.
 *
 * Additive API (both platforms): event `onRestAction` and `consumeRestActions()` — the +15 s /
 * Skip taps, which only appear once JS listens for `onRestAction`.
 */
class RepwiseTimerModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }.applicationContext

  override fun definition() = ModuleDefinition {
    Name("RepwiseTimer")

    Events(EVENT)

    OnCreate {
      RestTimerActions.listener = { flush() }
    }

    OnDestroy {
      RestTimerActions.listener = null
    }

    OnStartObserving {
      observing = true
      appContext.reactContext?.let { RestTimerStore.setActionsEnabled(it, true) }
      flush()
    }

    OnStopObserving {
      observing = false
    }

    Function("areActivitiesEnabled") { false }

    // iOS-only API: no-ops here so the JS bridge can call one shape on both platforms.
    AsyncFunction("update") { _: RestTimerPayload -> false }
    AsyncFunction("end") { }

    AsyncFunction("showOngoing") { payload: RestTimerPayload -> show(payload) }

    AsyncFunction("cancelOngoing") {
      val ctx = context
      RestTimerStore.clear(ctx)
      RestTimerService.stop(ctx)
      RestTimerNotifier.cancel(ctx)
    }

    /** Taps queued while JS was not listening (oldest first); clears the queue. */
    Function("consumeRestActions") {
      appContext.reactContext?.let { RestTimerStore.drain(it) } ?: emptyList()
    }
  }

  @Volatile
  private var observing = false

  private fun flush() {
    if (!observing) return
    val ctx = appContext.reactContext ?: return
    for (entry in RestTimerStore.drain(ctx)) {
      try {
        sendEvent(EVENT, entry)
      } catch (e: RuntimeException) {
        // runtime going away: the rest of the queue is lost only for this event
      }
    }
  }

  private fun show(p: RestTimerPayload): Boolean {
    val ctx = context
    if (!RestTimerNotifier.canPost(ctx)) return false
    val now = System.currentTimeMillis()
    val state = p.toState(now)
    if (!state.paused && state.endsAt <= now) {
      // Already over: nothing to count down.
      RestTimerStore.clear(ctx)
      RestTimerService.stop(ctx)
      RestTimerNotifier.cancel(ctx)
      return false
    }
    RestTimerStore.save(ctx, state)
    // Running rest: the service keeps it precise. Paused: the service (if running) detaches.
    if (state.isRunning(now) || RestTimerService.running) {
      if (RestTimerService.start(ctx)) return true
    }
    return RestTimerNotifier.post(ctx, state)
  }

  companion object {
    const val EVENT = "onRestAction"
  }
}

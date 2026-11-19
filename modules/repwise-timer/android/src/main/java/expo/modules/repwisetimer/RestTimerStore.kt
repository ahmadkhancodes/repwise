package expo.modules.repwisetimer

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** The rest currently shown on the lock screen (mirrors the JS `TimerSurfacePayload`). */
data class RestState(
  val workoutTitle: String,
  val sessionId: String?,
  val startedAt: Long,
  val endsAt: Long,
  val paused: Boolean,
  val remainingMs: Long,
  val nextExercise: String?,
  val nextSet: Int?,
  val title: String,
  val body: String,
) {
  fun isRunning(now: Long = System.currentTimeMillis()) = !paused && endsAt > now

  fun toJson(): String = JSONObject().apply {
    put("workoutTitle", workoutTitle)
    put("sessionId", sessionId ?: JSONObject.NULL)
    put("startedAt", startedAt)
    put("endsAt", endsAt)
    put("paused", paused)
    put("remainingMs", remainingMs)
    put("nextExercise", nextExercise ?: JSONObject.NULL)
    put("nextSet", nextSet ?: JSONObject.NULL)
    put("title", title)
    put("body", body)
  }.toString()

  companion object {
    fun fromJson(raw: String?): RestState? {
      if (raw.isNullOrEmpty()) return null
      return try {
        val o = JSONObject(raw)
        RestState(
          workoutTitle = o.optString("workoutTitle", "Workout"),
          sessionId = o.optStringOrNull("sessionId"),
          startedAt = o.optLong("startedAt", 0L),
          endsAt = o.optLong("endsAt", 0L),
          paused = o.optBoolean("paused", false),
          remainingMs = o.optLong("remainingMs", 0L),
          nextExercise = o.optStringOrNull("nextExercise"),
          nextSet = if (o.isNull("nextSet")) null else o.optInt("nextSet"),
          title = o.optString("title", "Resting"),
          body = o.optString("body", ""),
        )
      } catch (e: Exception) {
        null
      }
    }

    private fun JSONObject.optStringOrNull(key: String): String? =
      if (!has(key) || isNull(key)) null else optString(key)
  }
}

/**
 * SharedPreferences store: the current rest (read by the service and the +15 s / Skip receiver
 * even when the JS runtime is gone) and the queue of button taps not yet delivered to JS.
 */
object RestTimerStore {
  private const val PREFS = "repwise.restTimer"
  private const val KEY_STATE = "state"
  private const val KEY_PENDING = "pendingActions"
  private const val KEY_ACTIONS = "actionsEnabled"
  private const val MAX_PENDING = 20

  private fun prefs(context: Context) =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun load(context: Context): RestState? = RestState.fromJson(prefs(context).getString(KEY_STATE, null))

  fun save(context: Context, state: RestState) {
    prefs(context).edit().putString(KEY_STATE, state.toJson()).apply()
  }

  fun clear(context: Context) {
    prefs(context).edit().remove(KEY_STATE).apply()
  }

  /** True once JS has listened for `onRestAction`: only then are +15 s / Skip shown. */
  fun actionsEnabled(context: Context) = prefs(context).getBoolean(KEY_ACTIONS, false)

  fun setActionsEnabled(context: Context, enabled: Boolean) {
    prefs(context).edit().putBoolean(KEY_ACTIONS, enabled).apply()
  }

  @Synchronized
  fun enqueue(context: Context, action: String, now: Long, state: RestState?) {
    val list = readPending(context)
    list.put(
      JSONObject().apply {
        put("id", UUID.randomUUID().toString())
        put("action", action)
        put("at", now)
        if (state != null && !state.paused && action == RestTimerActions.ADD_15) put("endsAt", state.endsAt)
        if (state != null && action == RestTimerActions.ADD_15) {
          put("remainingMs", if (state.paused) state.remainingMs else maxOf(0L, state.endsAt - now))
        }
        state?.sessionId?.let { put("sessionId", it) }
      }
    )
    val trimmed = JSONArray()
    val from = maxOf(0, list.length() - MAX_PENDING)
    for (i in from until list.length()) trimmed.put(list.get(i))
    prefs(context).edit().putString(KEY_PENDING, trimmed.toString()).commit()
  }

  /** Returns and clears the queued taps (oldest first). */
  @Synchronized
  fun drain(context: Context): List<Map<String, Any?>> {
    val list = readPending(context)
    prefs(context).edit().remove(KEY_PENDING).commit()
    val out = ArrayList<Map<String, Any?>>(list.length())
    for (i in 0 until list.length()) {
      val o = list.optJSONObject(i) ?: continue
      val map = HashMap<String, Any?>()
      val keys = o.keys()
      while (keys.hasNext()) {
        val k = keys.next()
        val v = o.get(k)
        map[k] = when (v) {
          JSONObject.NULL -> null
          is Int -> v.toDouble()
          is Long -> v.toDouble()
          else -> v
        }
      }
      out.add(map)
    }
    return out
  }

  private fun readPending(context: Context): JSONArray = try {
    JSONArray(prefs(context).getString(KEY_PENDING, "[]"))
  } catch (e: Exception) {
    JSONArray()
  }
}

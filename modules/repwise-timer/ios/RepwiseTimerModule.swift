import ActivityKit
import ExpoModulesCore
import Foundation

/// JS payload for the rest timer (src/features/notifications/restTimer.ts `TimerSurfacePayload`).
struct RestTimerPayload: Record {
  @Field var workoutTitle: String = "Workout"
  @Field var sessionId: String? = nil
  /// ms since epoch.
  @Field var startedAt: Double = 0
  /// ms since epoch.
  @Field var endsAt: Double = 0
  @Field var paused: Bool = false
  @Field var remainingMs: Double = 0
  @Field var nextExercise: String? = nil
  @Field var nextSet: Int? = nil
}

/// Starts, updates and ends the rest-timer Live Activity. One activity at a time; the JS side
/// calls `update` on every timer change (start, ±15 s, pause, resume) and `end` when rest is over.
public class RepwiseTimerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RepwiseTimer")

    Function("areActivitiesEnabled") { () -> Bool in
      return ActivityAuthorizationInfo().areActivitiesEnabled
    }

    AsyncFunction("update") { (payload: RestTimerPayload) async -> Bool in
      return await Self.upsert(payload)
    }

    AsyncFunction("end") { () async in
      await Self.endAll()
    }

    // Android-only API: no-ops here so the JS bridge can call one shape on both platforms.
    AsyncFunction("showOngoing") { (_: RestTimerPayload) in }
    AsyncFunction("cancelOngoing") {}
  }

  private static func state(_ p: RestTimerPayload) -> RestTimerAttributes.ContentState {
    let ends = Date(timeIntervalSince1970: p.endsAt / 1000)
    let started = Date(timeIntervalSince1970: (p.startedAt > 0 ? p.startedAt : p.endsAt) / 1000)
    let remaining = p.paused ? p.remainingMs : max(0, p.endsAt - Date().timeIntervalSince1970 * 1000)
    return RestTimerAttributes.ContentState(
      startedAt: started,
      endsAt: ends,
      paused: p.paused,
      remainingSeconds: Int((remaining / 1000).rounded(.up)),
      nextExercise: p.nextExercise,
      nextSet: p.nextSet
    )
  }

  private static func upsert(_ p: RestTimerPayload) async -> Bool {
    guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
    let s = state(p)
    // Stale shortly after the rest ends, so a forgotten activity greys out instead of lying.
    let content = ActivityContent(
      state: s, staleDate: s.paused ? nil : s.endsAt.addingTimeInterval(60))

    if let current = Activity<RestTimerAttributes>.activities.first {
      if current.attributes.sessionId == p.sessionId {
        await current.update(content)
        return true
      }
      await current.end(nil, dismissalPolicy: .immediate)
    }
    do {
      _ = try Activity.request(
        attributes: RestTimerAttributes(workoutTitle: p.workoutTitle, sessionId: p.sessionId),
        content: content,
        pushType: nil
      )
      return true
    } catch {
      return false
    }
  }

  private static func endAll() async {
    for activity in Activity<RestTimerAttributes>.activities {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
  }
}

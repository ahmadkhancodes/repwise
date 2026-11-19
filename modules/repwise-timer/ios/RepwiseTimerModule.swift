import ActivityKit
import ExpoModulesCore
import Foundation
import UserNotifications

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

/// Shared constants (same values as the JS side and targets/widget).
enum RestTimerConst {
  /// expo-notifications identifier of the N-5 "Rest over" alert (`REST_ALERT_ID` in JS).
  static let alertId = "rw:rest"
  /// Live Activity button taps not yet delivered to JS (JSON array in standard UserDefaults:
  /// the intent runs in the app process).
  static let pendingKey = "repwise.restTimer.pendingActions"
  static let actionNotification = Notification.Name("RepwiseRestTimerAction")
  static let eventName = "onRestAction"
}

/// +15 s / Skip from the Live Activity buttons (iOS 17 `LiveActivityIntent`s in
/// targets/widget/_shared/RestTimerIntents.swift, which run in the app process and call this).
/// Works with the JS runtime asleep: the Live Activity and the pending "Rest over" alert are
/// updated natively, and the action is queued for the workout player (`onRestAction` /
/// `consumeRestActions`).
public enum RepwiseRestActions {
  public static let add15 = "add15"
  public static let skip = "skip"

  public static func apply(_ action: String, now: Date = Date()) async {
    guard #available(iOS 16.2, *) else { return }
    guard action == add15 || action == skip else { return }
    guard let activity = Activity<RestTimerAttributes>.activities.first else { return }
    let s = activity.content.state
    var endsAt: Date? = nil
    var remainingSeconds: Int? = nil

    if action == add15 {
      var next = s
      if s.paused {
        next.remainingSeconds = max(0, s.remainingSeconds) + 15
      } else {
        next.endsAt = max(now, s.endsAt).addingTimeInterval(15)
        next.remainingSeconds = Int(next.endsAt.timeIntervalSince(now).rounded(.up))
        endsAt = next.endsAt
      }
      remainingSeconds = next.remainingSeconds
      await activity.update(ActivityContent(state: next, staleDate: next.paused ? nil : next.endsAt))
      if let endsAt { await rescheduleAlert(at: endsAt) }
    } else {
      await activity.end(nil, dismissalPolicy: .immediate)
      UNUserNotificationCenter.current().removePendingNotificationRequests(
        withIdentifiers: [RestTimerConst.alertId])
    }

    // Plist-safe values only (UserDefaults rejects NSNull/Optional): nil fields are left out.
    var entry: [String: Any] = [
      "id": UUID().uuidString,
      "action": action,
      "at": now.timeIntervalSince1970 * 1000,
    ]
    if let endsAt { entry["endsAt"] = endsAt.timeIntervalSince1970 * 1000 }
    if let remainingSeconds { entry["remainingMs"] = Double(remainingSeconds) * 1000 }
    if let sessionId = activity.attributes.sessionId { entry["sessionId"] = sessionId }
    enqueue(entry)
    NotificationCenter.default.post(name: RestTimerConst.actionNotification, object: nil)
  }

  /// Moves the pending expo-notifications "Rest over" request; same identifier = replace.
  /// Nothing pending (paused, or the app never scheduled one): nothing to move.
  static func rescheduleAlert(at date: Date) async {
    let center = UNUserNotificationCenter.current()
    let pending = await center.pendingNotificationRequests()
    guard let request = pending.first(where: { $0.identifier == RestTimerConst.alertId }) else { return }
    let trigger = UNTimeIntervalNotificationTrigger(
      timeInterval: max(1, date.timeIntervalSinceNow), repeats: false)
    try? await center.add(
      UNNotificationRequest(identifier: RestTimerConst.alertId, content: request.content, trigger: trigger))
  }

  // MARK: queue

  static func enqueue(_ entry: [String: Any]) {
    var list = readQueue()
    list.append(entry)
    // Keep it small: only the latest taps matter to a running rest.
    UserDefaults.standard.set(Array(list.suffix(20)), forKey: RestTimerConst.pendingKey)
  }

  static func readQueue() -> [[String: Any]] {
    UserDefaults.standard.array(forKey: RestTimerConst.pendingKey) as? [[String: Any]] ?? []
  }

  static func drain() -> [[String: Any]] {
    let list = readQueue()
    UserDefaults.standard.removeObject(forKey: RestTimerConst.pendingKey)
    return list
  }
}

/// Starts, updates and ends the rest-timer Live Activity. One activity at a time; the JS side
/// calls `update` on every timer change (start, ±15 s, pause, resume) and `end` when rest is over.
/// Additive API: `onRestAction` event + `consumeRestActions()` (Live Activity button taps).
public class RepwiseTimerModule: Module {
  private var observer: NSObjectProtocol?
  /// True once JS listens for `onRestAction`; only then are the buttons shown.
  private static var actionsEnabled = false
  private var observing = false

  public func definition() -> ModuleDefinition {
    Name("RepwiseTimer")

    Events(RestTimerConst.eventName)

    OnCreate {
      self.observer = NotificationCenter.default.addObserver(
        forName: RestTimerConst.actionNotification, object: nil, queue: .main
      ) { [weak self] _ in
        self?.flush()
      }
    }

    OnDestroy {
      if let observer = self.observer { NotificationCenter.default.removeObserver(observer) }
      self.observer = nil
    }

    OnStartObserving {
      self.observing = true
      Self.actionsEnabled = true
      self.flush()
    }

    OnStopObserving {
      self.observing = false
    }

    Function("areActivitiesEnabled") { () -> Bool in
      if #available(iOS 16.1, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    AsyncFunction("update") { (payload: RestTimerPayload) async -> Bool in
      if #available(iOS 16.2, *) {
        return await Self.upsert(payload, actions: Self.actionsEnabled)
      }
      return false
    }

    AsyncFunction("end") { () async in
      if #available(iOS 16.2, *) {
        await Self.endAll()
      }
    }

    /// Button taps queued while JS was not listening (oldest first); clears the queue.
    Function("consumeRestActions") { () -> [[String: Any]] in
      return RepwiseRestActions.drain()
    }

    // Android-only API: no-ops here so the JS bridge can call one shape on both platforms.
    AsyncFunction("showOngoing") { (_: RestTimerPayload) in }
    AsyncFunction("cancelOngoing") {}
  }

  private func flush() {
    guard observing else { return }
    for entry in RepwiseRestActions.drain() {
      sendEvent(RestTimerConst.eventName, entry)
    }
  }

  @available(iOS 16.2, *)
  private static func state(_ p: RestTimerPayload, actions: Bool) -> RestTimerAttributes.ContentState {
    let nowMs = Date().timeIntervalSince1970 * 1000
    let endsMs = p.endsAt > 0 ? p.endsAt : nowMs
    let ends = Date(timeIntervalSince1970: endsMs / 1000)
    let startedMs = p.startedAt > 0 ? min(p.startedAt, endsMs) : endsMs
    let remaining = p.paused ? max(0, p.remainingMs) : max(0, endsMs - nowMs)
    return RestTimerAttributes.ContentState(
      startedAt: Date(timeIntervalSince1970: startedMs / 1000),
      endsAt: ends,
      paused: p.paused,
      remainingSeconds: Int((remaining / 1000).rounded(.up)),
      nextExercise: p.nextExercise,
      nextSet: p.nextSet,
      actions: actions
    )
  }

  @available(iOS 16.2, *)
  private static func upsert(_ p: RestTimerPayload, actions: Bool) async -> Bool {
    guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
    let s = state(p, actions: actions)
    // Stale when the rest ends: the widget then shows "Rest over" instead of 0:00.
    let content = ActivityContent(state: s, staleDate: s.paused ? nil : s.endsAt)

    let existing = Activity<RestTimerAttributes>.activities
    if let current = existing.first, current.attributes.sessionId == p.sessionId,
      current.activityState == .active
    {
      await current.update(content)
      // Never leave a second activity around.
      for extra in existing.dropFirst() { await extra.end(nil, dismissalPolicy: .immediate) }
      return true
    }
    for activity in existing { await activity.end(nil, dismissalPolicy: .immediate) }
    do {
      // Starting needs the app in the foreground (the user just logged a set): fine here.
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

  @available(iOS 16.2, *)
  private static func endAll() async {
    for activity in Activity<RestTimerAttributes>.activities {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
  }
}

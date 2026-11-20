import ActivityKit
import Foundation

/// Rest-timer Live Activity attributes (W5, RW-23).
///
/// MUST stay identical to `modules/repwise-timer/ios/RestTimerAttributes.swift`: ActivityKit matches the
/// app's activity with the widget extension's `ActivityConfiguration` by this type's name and
/// Codable shape. Change both files together. New ContentState fields must be optional so an
/// activity started by an older build still decodes.
@available(iOS 16.1, *)
public struct RestTimerAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /// When the rest started (for the progress bar).
    public var startedAt: Date
    /// When the rest ends; the countdown is drawn by the system from this date, so it keeps
    /// running on the lock screen while the app is suspended.
    public var endsAt: Date
    public var paused: Bool
    /// Seconds left, frozen while paused.
    public var remainingSeconds: Int
    public var nextExercise: String?
    public var nextSet: Int?
    /// Show the +15 s / Skip buttons (iOS 17+). Only true once the app listens for
    /// `onRestAction`, so a button never changes the lock screen without the player knowing.
    public var actions: Bool?

    public init(
      startedAt: Date, endsAt: Date, paused: Bool, remainingSeconds: Int,
      nextExercise: String?, nextSet: Int?, actions: Bool? = nil
    ) {
      self.startedAt = startedAt
      self.endsAt = endsAt
      self.paused = paused
      self.remainingSeconds = remainingSeconds
      self.nextExercise = nextExercise
      self.nextSet = nextSet
      self.actions = actions
    }
  }

  public var workoutTitle: String
  public var sessionId: String?

  public init(workoutTitle: String, sessionId: String?) {
    self.workoutTitle = workoutTitle
    self.sessionId = sessionId
  }
}

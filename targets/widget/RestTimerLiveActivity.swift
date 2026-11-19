import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

/// W5 lock-screen rest timer (RW-23). The countdown is drawn by the system from `endsAt`
/// (`Text(timerInterval:)`), so it keeps ticking while the app is suspended — no JS ticks.
/// Once `endsAt` passes, the activity is stale and shows "Rest over". Started, updated and
/// ended by modules/repwise-timer (JS: src/features/notifications/restTimer.ts); +15 s / Skip
/// are LiveActivityIntents (_shared/RestTimerIntents.swift), shown once the app listens.
struct RestTimerLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: RestTimerAttributes.self) { context in
      RestTimerLockScreen(context: context)
        .activityBackgroundTint(RW.bg)
        .activitySystemActionForegroundColor(RW.text)
        .widgetURL(Links.workout(context.attributes.sessionId))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Label(statusLabel(context), systemImage: "timer")
            .font(.caption.weight(.semibold))
            .foregroundStyle(RW.accent)
            .lineLimit(1)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Countdown(state: context.state, isStale: context.isStale)
            .font(.system(.title2, weight: .bold))
            .frame(maxWidth: 96)
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 8) {
            Text(nextLine(context.state)).font(.subheadline).lineLimit(1)
            RestProgress(state: context.state, isStale: context.isStale)
            RestButtons(state: context.state, isStale: context.isStale)
          }
        }
      } compactLeading: {
        Image(systemName: "timer").foregroundStyle(RW.accent)
      } compactTrailing: {
        Countdown(state: context.state, isStale: context.isStale).frame(maxWidth: 52)
      } minimal: {
        Image(systemName: "timer").foregroundStyle(RW.accent)
      }
      .widgetURL(Links.workout(context.attributes.sessionId))
      .keylineTint(RW.accent)
    }
  }
}

func nextLine(_ s: RestTimerAttributes.ContentState) -> String {
  if let ex = s.nextExercise, !ex.isEmpty, let n = s.nextSet { return "Next: \(ex) set \(n)" }
  if let ex = s.nextExercise, !ex.isEmpty { return "Next: \(ex)" }
  return "Next set"
}

func statusLabel(_ context: ActivityViewContext<RestTimerAttributes>) -> String {
  if context.state.paused { return "Rest paused" }
  if context.isStale || context.state.endsAt <= Date() { return "Rest over" }
  return "Resting"
}

/// Live countdown, the frozen time while paused, or "0:00" once over.
struct Countdown: View {
  let state: RestTimerAttributes.ContentState
  var isStale = false

  var body: some View {
    Group {
      if state.paused {
        Text(Duration.seconds(max(0, state.remainingSeconds)).formatted(.time(pattern: .minuteSecond)))
      } else if isStale || state.endsAt <= Date() {
        Text("0:00")
      } else {
        let now = Date()
        Text(timerInterval: now...max(now, state.endsAt), countsDown: true)
      }
    }
    .monospacedDigit()
    .multilineTextAlignment(.trailing)
    .lineLimit(1)
    .minimumScaleFactor(0.6)
  }
}

struct RestProgress: View {
  let state: RestTimerAttributes.ContentState
  var isStale = false

  var body: some View {
    if state.paused {
      ProgressView(value: 0).tint(RW.accent)
    } else if isStale || state.endsAt <= Date() {
      ProgressView(value: 1).tint(RW.accent)
    } else {
      ProgressView(
        timerInterval: min(state.startedAt, state.endsAt)...state.endsAt,
        countsDown: true,
        label: { EmptyView() },
        currentValueLabel: { EmptyView() }
      )
      .tint(RW.accent)
    }
  }
}

/// +15 s and Skip (iOS 17 interactive Live Activity). Hidden until the app opts in, and once
/// the rest is over.
struct RestButtons: View {
  let state: RestTimerAttributes.ContentState
  var isStale = false

  var body: some View {
    if #available(iOS 17.0, *), state.actions == true, !isStale {
      HStack(spacing: 8) {
        Button(intent: RestTimerAddIntent()) {
          Text("+15 s")
            .font(.subheadline.weight(.semibold))
            .frame(maxWidth: .infinity, minHeight: 44)
        }
        .tint(RW.surface2)
        .foregroundStyle(RW.text)
        .accessibilityLabel("Add 15 seconds of rest")
        Button(intent: RestTimerSkipIntent()) {
          Text("Skip")
            .font(.subheadline.weight(.semibold))
            .frame(maxWidth: .infinity, minHeight: 44)
        }
        .tint(RW.accent)
        .foregroundStyle(RW.onAccent)
        .accessibilityLabel("Skip rest")
      }
      .buttonStyle(.borderedProminent)
      .buttonBorderShape(.capsule)
    }
  }
}

struct RestTimerLockScreen: View {
  let context: ActivityViewContext<RestTimerAttributes>

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .center) {
        VStack(alignment: .leading, spacing: 2) {
          Text(statusLabel(context))
            .font(.caption.weight(.semibold))
            .foregroundStyle(context.isStale ? RW.accentText : RW.text2)
          Text(context.attributes.workoutTitle)
            .font(.subheadline)
            .foregroundStyle(RW.text)
            .lineLimit(1)
          Text(nextLine(context.state))
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(RW.text)
            .lineLimit(1)
        }
        Spacer(minLength: 8)
        Countdown(state: context.state, isStale: context.isStale)
          .font(.system(size: 48, weight: .bold))
          .foregroundStyle(RW.text)
          .accessibilityLabel(context.state.paused ? "Rest paused" : "Rest time left")
      }
      RestProgress(state: context.state, isStale: context.isStale)
      RestButtons(state: context.state, isStale: context.isStale)
    }
    .padding(16)
  }
}

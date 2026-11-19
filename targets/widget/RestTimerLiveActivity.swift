import ActivityKit
import SwiftUI
import WidgetKit

/// W5 lock-screen rest timer (RW-23). The countdown is drawn by the system from `endsAt`
/// (`Text(timerInterval:)`), so it keeps ticking while the app is suspended. Started, updated
/// and ended by modules/repwise-timer (JS: src/features/notifications/restTimer.ts).
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
          Label("Rest", systemImage: "timer")
            .font(.caption.weight(.semibold))
            .foregroundStyle(RW.accent)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Countdown(state: context.state)
            .font(.system(.title3, weight: .bold))
            .frame(maxWidth: 80)
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 6) {
            Text(nextLine(context.state)).font(.subheadline).lineLimit(1)
            RestProgress(state: context.state)
          }
        }
      } compactLeading: {
        Image(systemName: "timer").foregroundStyle(RW.accent)
      } compactTrailing: {
        Countdown(state: context.state).frame(maxWidth: 48)
      } minimal: {
        Image(systemName: "timer").foregroundStyle(RW.accent)
      }
      .widgetURL(Links.workout(context.attributes.sessionId))
      .keylineTint(RW.accent)
    }
  }
}

func nextLine(_ s: RestTimerAttributes.ContentState) -> String {
  if let ex = s.nextExercise, let n = s.nextSet { return "Next: \(ex) set \(n)" }
  if let ex = s.nextExercise { return "Next: \(ex)" }
  return "Next set"
}

/// Live countdown, or the frozen time while paused.
struct Countdown: View {
  let state: RestTimerAttributes.ContentState

  var body: some View {
    Group {
      if state.paused {
        Text(Duration.seconds(state.remainingSeconds).formatted(.time(pattern: .minuteSecond)))
      } else {
        Text(timerInterval: Date()...max(Date(), state.endsAt), countsDown: true)
      }
    }
    .monospacedDigit()
    .multilineTextAlignment(.trailing)
  }
}

struct RestProgress: View {
  let state: RestTimerAttributes.ContentState

  var body: some View {
    if state.paused {
      ProgressView(value: 0).tint(RW.accent)
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

struct RestTimerLockScreen: View {
  let context: ActivityViewContext<RestTimerAttributes>

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .firstTextBaseline) {
        VStack(alignment: .leading, spacing: 2) {
          Text(context.state.paused ? "Rest paused" : "Resting")
            .font(.caption.weight(.semibold))
            .foregroundStyle(RW.text2)
          Text(context.attributes.workoutTitle)
            .font(.subheadline)
            .foregroundStyle(RW.text)
            .lineLimit(1)
        }
        Spacer()
        Countdown(state: context.state)
          .font(.system(size: 40, weight: .bold))
          .foregroundStyle(RW.text)
      }
      RestProgress(state: context.state)
      Text(nextLine(context.state))
        .font(.subheadline)
        .foregroundStyle(RW.text2)
        .lineLimit(1)
    }
    .padding(16)
    .accessibilityElement(children: .combine)
  }
}

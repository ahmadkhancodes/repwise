import SwiftUI
import WidgetKit

// Sheet 17: WG-1 Today (workout + next meal), WG-2 Macros (kcal + P/C/F rings),
// WG-3 Streak (weeks in a row), plus the rest-timer Live Activity (W5).
@main
struct RepwiseWidgets: WidgetBundle {
  var body: some Widget {
    TodayWidget()
    MacrosWidget()
    StreakWidget()
    RestTimerLiveActivity()
  }
}

// MARK: - Shared pieces

struct Ring: View {
  var progress: Double
  var color: Color
  var lineWidth: CGFloat = 8

  var body: some View {
    ZStack {
      Circle().stroke(RW.surface2, lineWidth: lineWidth)
      Circle()
        .trim(from: 0, to: progress)
        .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
        .rotationEffect(.degrees(-90))
    }
    .accessibilityHidden(true)
  }
}

struct ProLock: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Image(systemName: "lock.fill").foregroundStyle(RW.text2)
      Text("Widgets are part of Repwise Pro")
        .font(.system(.subheadline, weight: .semibold))
        .foregroundStyle(RW.text)
      Text("Open Repwise to unlock")
        .font(.caption)
        .foregroundStyle(RW.text2)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

extension View {
  /// iOS 17 container background with the token colour (light + dark).
  func rwBackground() -> some View {
    containerBackground(RW.bg, for: .widget)
  }
}

func kcalText(_ v: Double) -> String { "\(Int(v.rounded()))" }

// MARK: - WG-1 Today

struct TodayView: View {
  @Environment(\.widgetFamily) private var family
  let snap: WidgetSnapshot

  private var workoutLine: String {
    guard let w = snap.workout else { return "Rest day" }
    if w.status == "done" { return "\(w.title) · done" }
    return w.minutes > 0 ? "\(w.title) · \(w.minutes) min" : w.title
  }

  var body: some View {
    if !snap.pro {
      ProLock()
    } else if family == .accessoryRectangular {
      VStack(alignment: .leading, spacing: 2) {
        Text(workoutLine).font(.headline).lineLimit(1)
        Text("\(kcalText(snap.kcal.eaten)) / \(kcalText(snap.kcal.target)) kcal")
          .font(.caption).monospacedDigit()
        if let m = snap.nextMeal { Text("\(m.label): \(m.name)").font(.caption).lineLimit(1) }
      }
      .widgetURL(Links.today)
    } else {
      HStack(alignment: .top, spacing: 12) {
        VStack(alignment: .leading, spacing: 6) {
          Text("TODAY").font(.caption2.weight(.semibold)).foregroundStyle(RW.text2)
          Text(workoutLine)
            .font(.system(.headline, weight: .bold))
            .foregroundStyle(RW.text)
            .lineLimit(2)
          Spacer(minLength: 0)
          if let m = snap.nextMeal {
            Text("\(m.label) · \(m.time)").font(.caption).foregroundStyle(RW.text2)
            Text(m.name).font(.subheadline).foregroundStyle(RW.text).lineLimit(1)
          } else {
            Text("No meals planned").font(.caption).foregroundStyle(RW.text2)
          }
        }
        if family != .systemSmall {
          Spacer(minLength: 0)
          VStack(spacing: 8) {
            ZStack {
              Ring(progress: snap.kcal.progress, color: RW.accent)
              VStack(spacing: 0) {
                Text(kcalText(snap.kcal.eaten))
                  .font(.system(.title3, weight: .bold)).monospacedDigit()
                  .foregroundStyle(RW.text)
                Text("of \(kcalText(snap.kcal.target))").font(.caption2).foregroundStyle(RW.text2)
              }
            }
            .frame(width: 84, height: 84)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(kcalText(snap.kcal.eaten)) of \(kcalText(snap.kcal.target)) calories")
            // Quick log (≤ 2 taps from the widget).
            Link(destination: Links.quickLog) {
              Label("Log", systemImage: "plus")
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(RW.accent, in: Capsule())
                .foregroundStyle(RW.onAccent)
            }
            .accessibilityLabel("Quick log food")
          }
        }
      }
      .widgetURL(snap.workout.map { Links.workout($0.sessionId) } ?? Links.today)
    }
  }
}

struct TodayWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "RepwiseToday", provider: SnapshotProvider()) { entry in
      TodayView(snap: entry.snapshot).rwBackground()
    }
    .configurationDisplayName("Today")
    .description("Today's workout, next meal and calories.")
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
  }
}

// MARK: - WG-2 Macros

struct MacroBar: View {
  let label: String
  let pair: MacroPair
  let color: Color

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      HStack {
        Text(label).font(.caption2.weight(.semibold)).foregroundStyle(RW.text2)
        Spacer()
        Text("\(Int(pair.eaten.rounded()))g").font(.caption2).monospacedDigit().foregroundStyle(RW.text)
      }
      GeometryReader { geo in
        ZStack(alignment: .leading) {
          Capsule().fill(RW.surface2)
          Capsule().fill(color).frame(width: geo.size.width * pair.progress)
        }
      }
      .frame(height: 4)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(label) \(Int(pair.eaten.rounded())) of \(Int(pair.target.rounded())) grams")
  }
}

struct MacrosView: View {
  let snap: WidgetSnapshot

  var body: some View {
    if !snap.pro {
      ProLock()
    } else {
      VStack(alignment: .leading, spacing: 8) {
        HStack(spacing: 8) {
          ZStack {
            Ring(progress: snap.kcal.progress, color: RW.accent, lineWidth: 6)
            Text(kcalText(max(0, snap.kcal.target - snap.kcal.eaten)))
              .font(.system(.caption, weight: .bold)).monospacedDigit().foregroundStyle(RW.text)
          }
          .frame(width: 44, height: 44)
          VStack(alignment: .leading, spacing: 0) {
            Text("kcal left").font(.caption2).foregroundStyle(RW.text2)
            Text("\(kcalText(snap.kcal.eaten)) eaten").font(.caption).monospacedDigit().foregroundStyle(RW.text)
          }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(kcalText(max(0, snap.kcal.target - snap.kcal.eaten))) calories left")
        MacroBar(label: "Protein", pair: snap.macros.p, color: RW.protein)
        MacroBar(label: "Carbs", pair: snap.macros.c, color: RW.carb)
        MacroBar(label: "Fat", pair: snap.macros.f, color: RW.fat)
      }
      .widgetURL(Links.eat)
    }
  }
}

struct MacrosWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "RepwiseMacros", provider: SnapshotProvider()) { entry in
      MacrosView(snap: entry.snapshot).rwBackground()
    }
    .configurationDisplayName("Macros")
    .description("Calories and protein, carbs and fat for today.")
    .supportedFamilies([.systemSmall])
  }
}

// MARK: - WG-3 Streak

struct StreakView: View {
  @Environment(\.widgetFamily) private var family
  let snap: WidgetSnapshot

  var body: some View {
    if family == .accessoryCircular {
      VStack(spacing: 0) {
        Text("\(snap.streakWeeks)").font(.system(.title2, weight: .bold)).monospacedDigit()
        Text("wks").font(.caption2)
      }
      .accessibilityElement(children: .ignore)
      .accessibilityLabel("\(snap.streakWeeks) weeks in a row")
      .widgetURL(Links.progress)
    } else if !snap.pro {
      ProLock()
    } else {
      VStack(alignment: .leading, spacing: 4) {
        Image(systemName: "flame.fill").foregroundStyle(RW.accent)
        Spacer(minLength: 0)
        Text("\(snap.streakWeeks)")
          .font(.system(size: 44, weight: .bold)).monospacedDigit()
          .foregroundStyle(RW.text)
          .minimumScaleFactor(0.6)
        Text(snap.streakWeeks == 1 ? "week in a row" : "weeks in a row")
          .font(.caption).foregroundStyle(RW.text2)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel("\(snap.streakWeeks) weeks in a row")
      .widgetURL(Links.progress)
    }
  }
}

struct StreakWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "RepwiseStreak", provider: SnapshotProvider()) { entry in
      StreakView(snap: entry.snapshot).rwBackground()
    }
    .configurationDisplayName("Streak")
    .description("Weeks in a row with at least one workout.")
    .supportedFamilies([.systemSmall, .accessoryCircular])
  }
}

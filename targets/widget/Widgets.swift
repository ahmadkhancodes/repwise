import SwiftUI
import WidgetKit

// Sheet 17: WG-1 Today (workout + one-tap Start, next meal + "Ate it", kcal/protein ring),
// WG-2 Macros (kcal/protein ring + P/C/F), WG-3 Streak (weeks in a row), plus the rest-timer
// Live Activity (W5). Home screen: systemSmall / systemMedium. Lock screen: accessory families.
// Taps are deep links (scheme `repwise`); the app does the work (SQLite is the source of truth).
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
        .trim(from: 0, to: max(0, min(1, progress.isFinite ? progress : 0)))
        .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
        .rotationEffect(.degrees(-90))
    }
    .accessibilityHidden(true)
  }
}

/// kcal outside, protein inside, with the kcal number in the middle.
struct DualRing: View {
  let snap: WidgetSnapshot
  var size: CGFloat = 84
  var lineWidth: CGFloat = 8

  var body: some View {
    ZStack {
      Ring(progress: snap.kcal.progress, color: RW.accent, lineWidth: lineWidth)
      Ring(progress: snap.macros.p.progress, color: RW.protein, lineWidth: lineWidth)
        .padding(lineWidth * 1.5)
      VStack(spacing: 0) {
        Text(kcalText(snap.kcal.eaten))
          .font(.system(size: size * 0.2, weight: .bold)).monospacedDigit()
          .foregroundStyle(RW.text)
          .minimumScaleFactor(0.6)
        Text("kcal").font(.system(size: size * 0.12)).foregroundStyle(RW.text2)
      }
      .padding(lineWidth * 3)
    }
    .frame(width: size, height: size)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(
      "\(kcalText(snap.kcal.eaten)) of \(kcalText(snap.kcal.target)) calories, "
        + "\(kcalText(snap.macros.p.eaten)) of \(kcalText(snap.macros.p.target)) grams protein")
  }
}

struct Pill: View {
  let label: String
  var systemImage: String? = nil
  let background: Color
  let foreground: Color

  var body: some View {
    HStack(spacing: 4) {
      if let systemImage { Image(systemName: systemImage) }
      Text(label)
    }
    .font(.subheadline.weight(.semibold))
    .padding(.horizontal, 14)
    .frame(minHeight: 36)
    .background(background, in: Capsule())
    .foregroundStyle(foreground)
  }
}

struct ProLock: View {
  @Environment(\.widgetFamily) private var family

  var body: some View {
    switch family {
    case .accessoryCircular, .accessoryRectangular, .accessoryInline:
      Label("Repwise Pro", systemImage: "lock.fill")
        .font(.caption)
        .accessibilityLabel("Widgets are part of Repwise Pro")
        .widgetURL(Links.today)
    default:
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
      .widgetURL(Links.today)
    }
  }
}

/// Token background on the home screen; the system draws lock-screen accessories itself.
struct RWBackground: ViewModifier {
  @Environment(\.widgetFamily) private var family

  func body(content: Content) -> some View {
    switch family {
    case .accessoryCircular, .accessoryRectangular, .accessoryInline:
      content.containerBackground(for: .widget) { Color.clear }
    default:
      content.containerBackground(RW.bg, for: .widget)
    }
  }
}

extension View {
  func rwBackground() -> some View { modifier(RWBackground()) }
}

func kcalText(_ v: Double) -> String { v.isFinite ? "\(Int(v.rounded()))" : "0" }

// MARK: - WG-1 Today

struct TodayView: View {
  @Environment(\.widgetFamily) private var family
  let snap: WidgetSnapshot

  private var lines: (title: String, meta: String) { workoutLines(snap.workout) }
  private var cta: WorkoutCta? { WorkoutCta(snap.workout) }
  private var openURL: URL { snap.workout.map { Links.workout($0.sessionId) } ?? Links.today }

  var body: some View {
    if !snap.pro {
      ProLock()
    } else {
      switch family {
      case .accessoryInline:
        Text(lines.meta.isEmpty ? lines.title : "\(lines.title) · \(lines.meta)")
          .widgetURL(cta?.url ?? openURL)
      case .accessoryRectangular:
        VStack(alignment: .leading, spacing: 2) {
          Text(lines.title).font(.headline).lineLimit(1)
          Text("\(kcalText(snap.kcal.eaten)) / \(kcalText(snap.kcal.target)) kcal")
            .font(.caption).monospacedDigit()
          if let m = snap.nextMeal { Text("\(m.label): \(m.name)").font(.caption).lineLimit(1) }
        }
        .widgetURL(cta?.url ?? openURL)
      case .systemSmall:
        small
      default:
        medium
      }
    }
  }

  /// Small widgets accept one tap target: the whole card starts (or resumes) the workout.
  private var small: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text("TODAY").font(.caption2.weight(.semibold)).foregroundStyle(RW.text2)
      Text(lines.title)
        .font(.system(.headline, weight: .bold))
        .foregroundStyle(RW.text)
        .lineLimit(2)
      Text(lines.meta).font(.caption).foregroundStyle(RW.text2).lineLimit(1)
      Spacer(minLength: 0)
      if let cta {
        Pill(label: cta.label, systemImage: "play.fill", background: RW.accent, foreground: RW.onAccent)
      } else if let m = snap.nextMeal {
        Text("\(m.label) · \(m.time)").font(.caption).foregroundStyle(RW.text2)
        Text(m.name).font(.subheadline.weight(.semibold)).foregroundStyle(RW.text).lineLimit(1)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .widgetURL(cta?.url ?? (snap.nextMeal != nil ? Links.eat : openURL))
  }

  private var medium: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .top, spacing: 12) {
        VStack(alignment: .leading, spacing: 4) {
          HStack {
            Text("TODAY").font(.caption2.weight(.semibold)).foregroundStyle(RW.text2)
            Spacer(minLength: 0)
            Link(destination: Links.quickLog) {
              Label("Log", systemImage: "plus").font(.caption.weight(.semibold)).foregroundStyle(RW.accentText)
            }
            .accessibilityLabel("Quick log food")
          }
          Text(lines.title)
            .font(.system(.headline, weight: .bold))
            .foregroundStyle(RW.text)
            .lineLimit(1)
          Text(lines.meta).font(.caption).foregroundStyle(RW.text2).lineLimit(1)
          Spacer(minLength: 0)
          if let cta {
            Link(destination: cta.url) {
              Pill(label: cta.label, systemImage: "play.fill", background: RW.accent, foreground: RW.onAccent)
            }
            .accessibilityLabel("\(cta.label) \(lines.title)")
          }
        }
        Link(destination: Links.eat) { DualRing(snap: snap, size: 76, lineWidth: 7) }
      }
      if let m = snap.nextMeal {
        HStack(spacing: 8) {
          VStack(alignment: .leading, spacing: 0) {
            Text("\(m.label) · \(m.time)").font(.caption2).foregroundStyle(RW.text2)
            Text(m.name).font(.caption.weight(.semibold)).foregroundStyle(RW.text).lineLimit(1)
          }
          Spacer(minLength: 0)
          Link(destination: Links.tickMeal(m.id)) {
            Pill(label: "Ate it", systemImage: "checkmark", background: RW.inverse, foreground: RW.onInverse)
          }
          .accessibilityLabel("Mark \(m.name) as eaten")
        }
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background(RW.surface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
      } else {
        Text("No meals planned").font(.caption).foregroundStyle(RW.text2)
      }
    }
    .widgetURL(openURL)
  }
}

struct TodayWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "RepwiseToday", provider: SnapshotProvider()) { entry in
      TodayView(snap: entry.snapshot).rwBackground()
    }
    .configurationDisplayName("Today")
    .description("Today's workout with one-tap Start, your next meal and calories.")
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
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
        Text("\(kcalText(pair.eaten))/\(kcalText(pair.target)) g")
          .font(.caption2).monospacedDigit().foregroundStyle(RW.text)
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
    .accessibilityLabel("\(label) \(kcalText(pair.eaten)) of \(kcalText(pair.target)) grams")
  }
}

struct MacrosView: View {
  @Environment(\.widgetFamily) private var family
  let snap: WidgetSnapshot

  private var left: Double { max(0, snap.kcal.target - snap.kcal.eaten) }

  var body: some View {
    if !snap.pro {
      ProLock()
    } else if family == .accessoryCircular {
      // Lock screen: calories as a gauge, protein underneath.
      Gauge(value: snap.kcal.progress) {
        Text("kcal")
      } currentValueLabel: {
        Text(kcalText(left)).monospacedDigit()
      }
      .gaugeStyle(.accessoryCircular)
      .accessibilityLabel("\(kcalText(left)) calories left")
      .widgetURL(Links.eat)
    } else {
      VStack(alignment: .leading, spacing: 8) {
        HStack(spacing: 10) {
          DualRing(snap: snap, size: 56, lineWidth: 6)
          VStack(alignment: .leading, spacing: 0) {
            Text(kcalText(left))
              .font(.system(.title3, weight: .bold)).monospacedDigit().foregroundStyle(RW.text)
              .minimumScaleFactor(0.7)
            Text("kcal left").font(.caption2).foregroundStyle(RW.text2)
          }
        }
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
    .supportedFamilies([.systemSmall, .accessoryCircular])
  }
}

// MARK: - WG-3 Streak

struct StreakView: View {
  @Environment(\.widgetFamily) private var family
  let snap: WidgetSnapshot

  var body: some View {
    if !snap.pro {
      ProLock()
    } else if family == .accessoryCircular {
      VStack(spacing: 0) {
        Text("\(snap.streakWeeks)").font(.system(.title2, weight: .bold)).monospacedDigit()
        Text("wks").font(.caption2)
      }
      .accessibilityElement(children: .ignore)
      .accessibilityLabel("\(snap.streakWeeks) weeks in a row")
      .widgetURL(Links.progress)
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

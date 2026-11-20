import Foundation
import SwiftUI
import WidgetKit

/// App Group shared with the app (app.config.ts `ios.entitlements`).
let appGroup = "group.com.client.repwise"
/// Key written by src/widgets/writer.ts through @bacons/apple-targets ExtensionStorage.
let snapshotKey = "repwise.widget.snapshot.v1"

/// Mirrors `WidgetSnapshot` in src/widgets/snapshot.ts (v1). Keep the two in sync.
struct MacroPair: Codable {
  var eaten: Double
  var target: Double

  var progress: Double { target > 0 ? min(1, max(0, eaten / target)) : 0 }
}

struct SnapshotWorkout: Codable {
  var sessionId: String
  var title: String
  var exercises: Int
  var minutes: Int
  var status: String
}

struct SnapshotMeal: Codable {
  /// Planned meal id; enables the one-tap "Ate it" link (optional for older writers).
  var id: String?
  var slot: String
  var label: String
  var name: String
  var kcal: Double
  var time: String
}

struct SnapshotMacros: Codable {
  var p: MacroPair
  var c: MacroPair
  var f: MacroPair
}

struct WidgetSnapshot: Codable {
  var v: Int
  var updatedAt: Double
  var date: String
  var pro: Bool
  var workout: SnapshotWorkout?
  var nextMeal: SnapshotMeal?
  var kcal: MacroPair
  var macros: SnapshotMacros
  var streakWeeks: Int

  /// No snapshot yet (widget added before the app ran): fail closed, like `forDate` in JS.
  static let empty = WidgetSnapshot(
    v: 1, updatedAt: 0, date: "", pro: false, workout: nil, nextMeal: nil,
    kcal: MacroPair(eaten: 0, target: 0),
    macros: SnapshotMacros(
      p: MacroPair(eaten: 0, target: 0), c: MacroPair(eaten: 0, target: 0),
      f: MacroPair(eaten: 0, target: 0)),
    streakWeeks: 0)

  static let preview = WidgetSnapshot(
    v: 1, updatedAt: 0, date: "", pro: true,
    workout: SnapshotWorkout(sessionId: "", title: "Push day", exercises: 6, minutes: 52, status: "planned"),
    nextMeal: SnapshotMeal(id: nil, slot: "lunch", label: "Lunch", name: "Chicken karahi bowl", kcal: 610, time: "13:00"),
    kcal: MacroPair(eaten: 1240, target: 2350),
    macros: SnapshotMacros(
      p: MacroPair(eaten: 96, target: 160), c: MacroPair(eaten: 130, target: 250),
      f: MacroPair(eaten: 38, target: 70)),
    streakWeeks: 6)

  /// Today's local date, `YYYY-MM-DD`, matching the JS side.
  static func today(_ now: Date = Date()) -> String {
    let f = DateFormatter()
    f.calendar = Calendar(identifier: .gregorian)
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = .current
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: now)
  }

  /// The stored snapshot; a snapshot from an earlier day keeps only the streak (same rule as
  /// `forDate` in snapshot.ts) so yesterday's workout never shows as today's.
  static func load(now: Date = Date()) -> WidgetSnapshot {
    guard
      let raw = UserDefaults(suiteName: appGroup)?.string(forKey: snapshotKey),
      let data = raw.data(using: .utf8),
      let snap = try? JSONDecoder().decode(WidgetSnapshot.self, from: data),
      snap.v == 1
    else { return .empty }
    if snap.date == today(now) { return snap }
    var stale = WidgetSnapshot.empty
    stale.pro = snap.pro
    stale.streakWeeks = snap.streakWeeks
    stale.date = today(now)
    return stale
  }
}

enum Links {
  static let today = URL(string: "repwise://today")!
  static let eat = URL(string: "repwise://eat")!
  static let quickLog = URL(string: "repwise://eat?log=1")!
  static let progress = URL(string: "repwise://progress")!
  static let train = URL(string: "repwise://train")!

  /// Query-value encoding (also escapes & = + ? so an id can never break the query).
  private static func encode(_ s: String) -> String? {
    var allowed = CharacterSet.urlQueryAllowed
    allowed.remove(charactersIn: "&=+?#")
    return s.addingPercentEncoding(withAllowedCharacters: allowed)
  }

  static func workout(_ id: String?, start: Bool = false) -> URL {
    guard let id, !id.isEmpty, let encoded = encode(id),
      let url = URL(string: "repwise://train?sessionId=\(encoded)\(start ? "&start=1" : "")")
    else { return train }
    return url
  }

  /// "Ate it" (same as WIDGET_LINKS.tickMeal in JS); without an id, opens Eat.
  static func tickMeal(_ id: String?) -> URL {
    guard let id, !id.isEmpty, let encoded = encode(id),
      let url = URL(string: "repwise://eat?mealId=\(encoded)&tick=1")
    else { return eat }
    return url
  }
}

/// Start a planned session, Resume a running one (same rule as `workoutCta` in JS).
struct WorkoutCta {
  let label: String
  let url: URL

  init?(_ w: SnapshotWorkout?) {
    guard let w, !w.sessionId.isEmpty else { return nil }
    switch w.status {
    case "planned": label = "Start"
    case "active", "paused": label = "Resume"
    default: return nil
    }
    url = Links.workout(w.sessionId, start: true)
  }
}

/// Headline + meta line (same as `workoutLines` in JS).
func workoutLines(_ w: SnapshotWorkout?) -> (title: String, meta: String) {
  guard let w else { return ("Rest day", "Recover and eat well") }
  switch w.status {
  case "done": return (w.title, "Done today")
  case "skipped": return (w.title, "Skipped")
  case "active", "paused": return (w.title, "In progress")
  default:
    var parts: [String] = []
    if w.exercises > 0 { parts.append("\(w.exercises) exercise\(w.exercises == 1 ? "" : "s")") }
    if w.minutes > 0 { parts.append("\(w.minutes) min") }
    return (w.title, parts.joined(separator: " · "))
  }
}

/// Design tokens generated from src/theme/colors.json by expo-target.config.js (light + dark).
enum RW {
  static let bg = Color("rwBg")
  static let surface = Color("rwSurface")
  static let surface2 = Color("rwSurface2")
  static let text = Color("rwTextPrimary")
  static let text2 = Color("rwTextSecondary")
  static let accent = Color("rwAccent")
  static let accentText = Color("rwAccentText")
  static let onAccent = Color("rwOnAccent")
  static let inverse = Color("rwInverse")
  static let onInverse = Color("rwOnInverse")
  static let protein = Color("rwProtein")
  static let carb = Color("rwCarb")
  static let fat = Color("rwFat")
}

struct SnapshotEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot
}

/// One entry now; refresh just after midnight so the day rolls over even if the app is not opened.
/// The app also reloads every timeline after each change (ExtensionStorage.reloadWidget()).
struct SnapshotProvider: TimelineProvider {
  func placeholder(in context: Context) -> SnapshotEntry {
    SnapshotEntry(date: Date(), snapshot: .preview)
  }

  func getSnapshot(in context: Context, completion: @escaping (SnapshotEntry) -> Void) {
    completion(SnapshotEntry(date: Date(), snapshot: context.isPreview ? .preview : .load()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<SnapshotEntry>) -> Void) {
    let now = Date()
    let midnight = Calendar.current.startOfDay(for: now.addingTimeInterval(86_400)).addingTimeInterval(60)
    completion(Timeline(entries: [SnapshotEntry(date: now, snapshot: .load(now: now))], policy: .after(midnight)))
  }
}

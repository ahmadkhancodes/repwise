import AppIntents
import Foundation

#if canImport(RepwiseTimer)
  // `internal` matches the generated ExpoModulesProvider.swift (`internal import RepwiseTimer`);
  // Swift 6 rejects mixing implicit and explicit access levels for one module in a target.
  internal import RepwiseTimer
#endif

// Rest-timer Live Activity buttons (W5). @bacons/apple-targets compiles `_shared/` into BOTH the
// widget extension (for `Button(intent:)`) and the main app. iOS runs a LiveActivityIntent in the
// app process, where `RepwiseTimer` (modules/repwise-timer) is linked: it moves the Live Activity
// and the pending "Rest over" alert natively, then queues the tap for the workout player.
// In the extension `canImport(RepwiseTimer)` is false and perform() is never used.

@available(iOS 17.0, *)
struct RestTimerAddIntent: LiveActivityIntent {
  static let title: LocalizedStringResource = "Add 15 seconds of rest"
  static let isDiscoverable = false

  init() {}

  func perform() async throws -> some IntentResult {
    #if canImport(RepwiseTimer)
      await RepwiseRestActions.apply(RepwiseRestActions.add15)
    #endif
    return .result()
  }
}

@available(iOS 17.0, *)
struct RestTimerSkipIntent: LiveActivityIntent {
  static let title: LocalizedStringResource = "Skip rest"
  static let isDiscoverable = false

  init() {}

  func perform() async throws -> some IntentResult {
    #if canImport(RepwiseTimer)
      await RepwiseRestActions.apply(RepwiseRestActions.skip)
    #endif
    return .result()
  }
}

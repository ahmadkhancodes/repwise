Pod::Spec.new do |s|
  s.name           = 'RepwiseTimer'
  s.version        = '1.0.0'
  s.summary        = 'Repwise rest-timer Live Activity bridge'
  s.description    = 'Starts, updates and ends the rest-timer Live Activity (ActivityKit).'
  s.license        = 'UNLICENSED'
  s.author         = 'Repwise'
  s.homepage       = 'https://repwise.app'
  # Same floor as the app (Expo SDK 58 default 15.1). ActivityKit code is behind #available
  # checks and the frameworks are weak-linked, so the app still launches on iOS 15/16.0.
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.weak_frameworks = 'ActivityKit', 'AppIntents'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end

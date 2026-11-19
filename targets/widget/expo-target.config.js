// iOS WidgetKit extension: Today, Macros and Streak widgets + the rest-timer Live Activity
// (bible P-N2, sheet 17 WG-1..3, W5). Plain CommonJS: the plugin does not load TS/ESM here.
const colors = require('../../src/theme/colors.json');

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'RepwiseWidget',
  displayName: 'Repwise',
  bundleIdentifier: '.widget',
  deploymentTarget: '17.0',
  icon: '../../assets/images/icon.png',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit'],
  colors: {
    $accent: { light: colors.light.accent, dark: colors.dark.accent },
    $widgetBackground: { light: colors.light.bg, dark: colors.dark.bg },
    // Same tokens as src/theme/colors.json (light + dark).
    rwBg: { light: colors.light.bg, dark: colors.dark.bg },
    rwSurface: { light: colors.light.surface, dark: colors.dark.surface },
    rwSurface2: { light: colors.light.surface2, dark: colors.dark.surface2 },
    rwTextPrimary: { light: colors.light.textPrimary, dark: colors.dark.textPrimary },
    rwTextSecondary: { light: colors.light.textSecondary, dark: colors.dark.textSecondary },
    rwAccent: { light: colors.light.accent, dark: colors.dark.accent },
    rwAccentText: { light: colors.light.accentText, dark: colors.dark.accentText },
    rwOnAccent: { light: colors.light.onAccent, dark: colors.dark.onAccent },
    rwProtein: { light: colors.light.macroProtein, dark: colors.dark.macroProtein },
    rwCarb: { light: colors.light.macroCarb, dark: colors.dark.macroCarb },
    rwFat: { light: colors.light.macroFat, dark: colors.dark.macroFat },
  },
  entitlements: {
    // Same App Group as the app (app.config.ts), where the JS snapshot is written.
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
  },
});

import { Check, Lock } from 'lucide-react-native';
import { View } from 'react-native';

import { useTheme } from '@/theme';

import { PressableScale } from './PressableScale';
import { Text } from './Text';

/** done = filled accent + check · planned = ring · missed = muted · rest / none = plain. */
export type WeekDayStatus = 'none' | 'planned' | 'active' | 'done' | 'missed' | 'rest';

export type WeekDay = {
  /** Stable key, usually the ISO date. */
  key: string;
  /** Short weekday shown above ("Mon"). Caller formats it (locale). */
  weekday: string;
  /** Day of month shown in the dot ("18"). */
  day: string | number;
  status?: WeekDayStatus;
  /** Pro-locked day: lock glyph + ", Pro" in the spoken label. Still selectable (opens paywall). */
  locked?: boolean;
  /** Full spoken label; defaults to "<weekday> <day>[, today], <status>". */
  accessibilityLabel?: string;
};

const SPOKEN: Record<WeekDayStatus, string> = {
  none: '',
  planned: 'planned',
  active: 'in progress',
  done: 'done',
  missed: 'missed',
  rest: 'rest day',
};

/** Default spoken label for a day. Pure. */
export function weekDayLabel(d: WeekDay, isToday: boolean): string {
  if (d.accessibilityLabel) return d.accessibilityLabel;
  const status = SPOKEN[d.status ?? 'none'];
  return [`${d.weekday} ${d.day}`, isToday ? 'today' : '', status, d.locked ? 'Pro' : '']
    .filter(Boolean)
    .join(', ');
}

export type WeekStripProps = {
  days: readonly WeekDay[];
  selectedKey: string | null;
  todayKey?: string;
  onSelect: (key: string) => void;
  testID?: string;
};

/**
 * Mon–Sun strip for Train, Eat and the plan reveal. Pure flex (no fixed widths), so 7 cells fit
 * a 360dp screen at 130% font: each cell is flex 1 with minWidth 0 and numbers shrink to fit.
 * Selected = inverse pill (Uber); today = bold ring; done = accent dot with a check.
 */
export function WeekStrip({ days, selectedKey, todayKey, onSelect, testID }: WeekStripProps) {
  const t = useTheme();
  const dot = t.spacing.xxxl;
  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', gap: t.spacing.xxs, alignSelf: 'stretch' }}
    >
      {days.map((d) => {
        const isSel = d.key === selectedKey;
        const isToday = d.key === todayKey;
        const status = d.status ?? 'none';
        const done = status === 'done';
        const ringed = !done && (isToday || status === 'planned' || status === 'active');
        const fg = isSel ? 'onInverse' : 'textPrimary';
        return (
          <PressableScale
            key={d.key}
            testID={`day-${d.key}`}
            feedback="selection"
            onPress={() => onSelect(d.key)}
            accessibilityRole="tab"
            accessibilityLabel={weekDayLabel(d, isToday)}
            accessibilityState={{ selected: isSel }}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: t.sizes.touch + t.spacing.xl,
              paddingVertical: t.spacing.xs,
              borderRadius: t.radius.card,
              alignItems: 'center',
              justifyContent: 'center',
              gap: t.spacing.xxs,
              backgroundColor: isSel ? t.colors.inverse : 'transparent',
            }}
          >
            <Text
              variant="caption"
              color={isSel ? 'onInverse' : isToday ? 'textPrimary' : 'textSecondary'}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {d.weekday}
            </Text>
            <View
              style={{
                width: '100%',
                maxWidth: dot,
                aspectRatio: 1,
                borderRadius: t.radius.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: done ? t.colors.accent : 'transparent',
                borderWidth: ringed ? t.sizes.borderThick : 0,
                borderColor: isSel
                  ? t.colors.onInverse
                  : isToday
                    ? t.colors.textPrimary
                    : t.colors.borderStrong,
              }}
            >
              {done ? (
                <Check
                  color={t.colors.onAccent}
                  size={t.sizes.iconSmall}
                  strokeWidth={t.sizes.iconStrokeBold}
                />
              ) : (
                <Text
                  variant="callout"
                  tabular
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                  color={status === 'missed' && !isSel ? 'textTertiary' : fg}
                  style={isToday ? { fontFamily: t.typography.headline.fontFamily } : undefined}
                >
                  {String(d.day)}
                </Text>
              )}
            </View>
            {d.locked ? (
              <Lock
                color={isSel ? t.colors.onInverse : t.colors.textSecondary}
                size={t.sizes.iconSmall - t.spacing.xxs}
                strokeWidth={t.sizes.iconStroke}
              />
            ) : null}
          </PressableScale>
        );
      })}
    </View>
  );
}

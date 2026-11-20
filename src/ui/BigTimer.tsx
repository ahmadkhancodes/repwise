import { SkipForward } from 'lucide-react-native';
import { useWindowDimensions, View } from 'react-native';

import { fonts, useTheme } from '@/theme';

import { Button } from './Button';
import { fitFontSize, ringInnerWidth } from './fit';
import { PressableScale } from './PressableScale';
import { ProgressRing } from './ProgressRing';
import { Text } from './Text';

/** "1:05" from milliseconds; rounds UP so 0:01 shows until the very end. Pure. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil((Number.isFinite(ms) ? ms : 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Spoken countdown ("1 minute 5 seconds"). Pure. */
export function spokenCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil((Number.isFinite(ms) ? ms : 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  const parts = [
    m ? `${m} minute${m === 1 ? '' : 's'}` : '',
    s || !m ? `${s} second${s === 1 ? '' : 's'}` : '',
  ];
  return parts.filter(Boolean).join(' ');
}

/** The last seconds turn the number accent so the end is visible from across the bench. */
export const FINAL_SECONDS = 5;

export type BigTimerProps = {
  remainingMs: number;
  totalMs: number;
  /** ±seconds (called with +step or −step). Omit to hide the adjust buttons. */
  onAdjust?: (deltaSeconds: number) => void;
  onSkip?: () => void;
  /** Seconds per adjust tap (default 15). */
  stepSeconds?: number;
  /** Caption under the number, e.g. "Paused" or "Rest". */
  caption?: string;
  /** Line under the ring, e.g. "Next: Bench press · set 3 · 80 kg × 8". */
  next?: string;
  /** Ring diameter (default sizes.ringHero, 240dp — fits 360dp). */
  size?: number;
  testID?: string;
};

/**
 * Rest timer hero (sheet 11 Timer): hero-size tabular countdown inside a draining ring,
 * readable at 1 m; −15 / Skip / +15 as 56dp controls. The number auto-fits the ring at any
 * font scale. Haptics: buttons fire light on commit; the rest-end triple (haptics.restEnd) is
 * owned by the timer store, not this view.
 */
export function BigTimer({
  remainingMs,
  totalMs,
  onAdjust,
  onSkip,
  stepSeconds = 15,
  caption,
  next,
  size,
  testID,
}: BigTimerProps) {
  const t = useTheme();
  const { fontScale } = useWindowDimensions();
  const dim = size ?? t.sizes.ringHero;
  const stroke = t.sizes.ringStroke + t.spacing.xxs;
  const text = formatCountdown(remainingMs);
  const hero = t.typography.hero;
  const fontSize = fitFontSize({
    text,
    maxWidth: ringInnerWidth(dim, stroke, t.spacing.md),
    fontSize: hero.fontSize,
    fontScale,
    maxMultiplier: hero.maxFontSizeMultiplier,
    letterSpacing: hero.letterSpacing,
  });
  const ratio = fontSize / hero.fontSize;
  const remainingS = Math.ceil(Math.max(0, remainingMs) / 1000);
  const ending = remainingS > 0 && remainingS <= FINAL_SECONDS;
  const progress = totalMs > 0 ? Math.max(0, remainingMs) / totalMs : 0;

  return (
    <View testID={testID} style={{ alignItems: 'center', gap: t.spacing.lg, alignSelf: 'stretch' }}>
      <ProgressRing
        progress={progress}
        size={dim}
        strokeWidth={stroke}
        color={ending ? 'accent' : 'textPrimary'}
        accessibilityLabel={`Rest timer, ${spokenCountdown(remainingMs)} left${caption ? `, ${caption}` : ''}`}
      >
        <Text
          testID={testID ? `${testID}-time` : undefined}
          variant="hero"
          color={ending ? 'accentText' : 'textPrimary'}
          allowFontScaling={false}
          numberOfLines={1}
          importantForAccessibility="no"
          accessibilityElementsHidden
          style={{
            fontSize,
            lineHeight: Math.ceil(hero.lineHeight * ratio),
            letterSpacing: (hero.letterSpacing ?? 0) * ratio,
          }}
        >
          {text}
        </Text>
        {caption ? (
          <Text variant="callout" color="textSecondary" numberOfLines={1}>
            {caption}
          </Text>
        ) : null}
      </ProgressRing>
      {next ? (
        <Text variant="headline" color="textSecondary" align="center" numberOfLines={2}>
          {next}
        </Text>
      ) : null}
      {onAdjust || onSkip ? (
        // −15 · Skip · +15: two 56dp round adjusters and one wide Skip. Fits 360dp at 130%
        // font (UI audit N5: three flex buttons clipped "Skip" and wrapped "−15 s").
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm,
            alignSelf: 'stretch',
          }}
        >
          {onAdjust ? (
            <AdjustButton
              label={`−${stepSeconds}`}
              accessibilityLabel={`Remove ${stepSeconds} seconds`}
              onPress={() => onAdjust(-stepSeconds)}
              testID={testID ? `${testID}-minus` : undefined}
            />
          ) : null}
          {onSkip ? (
            <Button
              label="Skip"
              icon={SkipForward}
              compact
              accessibilityLabel="Skip rest"
              onPress={onSkip}
              testID={testID ? `${testID}-skip` : undefined}
              style={{ flex: 1, minHeight: t.sizes.hitGym }}
            />
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {onAdjust ? (
            <AdjustButton
              label={`+${stepSeconds}`}
              accessibilityLabel={`Add ${stepSeconds} seconds`}
              onPress={() => onAdjust(stepSeconds)}
              testID={testID ? `${testID}-plus` : undefined}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Round 56dp ±seconds control; the number auto-fits so it never clips at any font scale. */
function AdjustButton({
  label,
  accessibilityLabel,
  onPress,
  testID,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  testID?: string;
}) {
  const t = useTheme();
  const { fontScale } = useWindowDimensions();
  const type = t.typography.headline;
  const dim = t.sizes.hitGym;
  const fontSize = fitFontSize({
    text: label,
    maxWidth: dim - t.spacing.xs * 2,
    fontSize: type.fontSize,
    fontScale,
    maxMultiplier: 1.3,
  });
  return (
    <PressableScale
      feedback="light"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={{
        width: dim,
        height: dim,
        borderRadius: t.radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: t.colors.surface,
        borderWidth: t.sizes.hairline,
        borderColor: t.colors.borderStrong,
      }}
    >
      <Text
        variant="headline"
        tabular
        allowFontScaling={false}
        numberOfLines={1}
        testID={testID ? `${testID}-label` : undefined}
        style={{ fontSize, lineHeight: Math.ceil(fontSize * 1.3), fontFamily: fonts.bold }}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

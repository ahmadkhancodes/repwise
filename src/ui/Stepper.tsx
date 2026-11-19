import { Minus, Plus, type LucideIcon } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';

import { haptics } from '@/services/haptics';
import { useTheme } from '@/theme';

import { PressableScale } from './PressableScale';
import { Text } from './Text';

export type StepperProps = {
  /** Name of the value, e.g. "Weight". Used in button labels. */
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Step per tap. Pass the unit's plate step: 2.5 (kg barbell), 5 (lb barbell), 1 (reps). */
  step?: number;
  unit?: string;
  format?: (value: number) => string;
  /** 'regular' = 56dp ± buttons; 'large' = 64dp ± and a display-size value (set editor). */
  size?: 'regular' | 'large';
  /** Tap the value to type it (default true). */
  editable?: boolean;
  testID?: string;
};

/** Clamp + snap a stepped value, avoiding float drift (2.5 kg plates etc.). Pure. */
export function stepValue(value: number, delta: number, min: number, max: number): number {
  const next = Math.round((value + delta) * 1000) / 1000;
  return Math.min(max, Math.max(min, next));
}

/** Long-press auto-repeat: first repeat after this delay (ms). */
export const REPEAT_START_MS = 400;
/**
 * Delay before repeat number `n` (0-based): starts at 180 ms and accelerates ×0.85 per step down
 * to 40 ms, so holding + walks 60 → 100 kg in about 2 s. Pure.
 */
export function repeatDelayMs(n: number): number {
  return Math.max(40, Math.round(180 * 0.85 ** Math.max(0, n)));
}

/** Decimal places implied by a step (2.5 → 1, 0.25 → 2, 1 → 0). Pure. */
export function stepDecimals(step: number): number {
  const s = String(step);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

/**
 * Parse typed text ("62,5", " 80 ") into a clamped value; null when it is not a number.
 * Rounds to the step's decimals (not to the step, so 61 kg stays 61). Pure.
 */
export function parseStepperInput(
  text: string,
  min: number,
  max: number,
  decimals: number,
): number | null {
  const n = Number(text.trim().replace(',', '.'));
  if (!text.trim() || !Number.isFinite(n)) return null;
  const f = 10 ** decimals;
  return Math.min(max, Math.max(min, Math.round(n * f) / f));
}

function StepButton({
  icon: Icon,
  label,
  disabled,
  dim,
  onStep,
  onRepeatStart,
  onRepeatEnd,
  testID,
}: {
  icon: LucideIcon;
  label: string;
  disabled: boolean;
  dim: number;
  onStep: () => void;
  onRepeatStart: () => void;
  onRepeatEnd: () => void;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <PressableScale
      testID={testID}
      feedback="none"
      disabled={disabled}
      onPress={onStep}
      onLongPress={onRepeatStart}
      delayLongPress={REPEAT_START_MS}
      onPressOut={onRepeatEnd}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={{
        width: dim,
        height: dim,
        borderRadius: t.radius.button,
        backgroundColor: t.colors.bg,
        borderWidth: t.sizes.hairline,
        borderColor: t.colors.borderStrong,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Icon color={t.colors.textPrimary} size={t.sizes.icon} strokeWidth={t.sizes.iconStrokeBold} />
    </PressableScale>
  );
}

/**
 * Gym-grade − value + control for weights and reps: ≥ 56dp buttons, hold to auto-repeat with
 * acceleration (selection haptic per step), tap the number to type it, tabular display.
 * Adjustable for screen readers (swipe up/down).
 */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  unit,
  format = String,
  size = 'regular',
  editable = true,
  testID,
}: StepperProps) {
  const t = useTheme();
  const text = format(value);
  const spoken = unit ? `${text} ${unit}` : text;
  const dim = size === 'large' ? t.sizes.hitGymLarge : t.sizes.hitGym;
  const decimals = stepDecimals(step);

  // Latest value for the repeat loop (the parent may not have re-rendered between ticks).
  const live = useRef(value);
  useEffect(() => {
    live.current = value;
  }, [value]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const stopRepeat = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stopRepeat, []);

  /** One step; returns false at a bound. */
  const change = (delta: number): boolean => {
    const next = stepValue(live.current, delta, min, max);
    if (next === live.current) return false;
    haptics.selection();
    live.current = next;
    onChange(next);
    return true;
  };

  /** A single tap always steps from the rendered value. */
  const tap = (delta: number) => {
    live.current = value;
    change(delta);
  };

  const startRepeat = (delta: number) => {
    stopRepeat();
    live.current = value;
    let n = 0;
    const tick = () => {
      if (!change(delta)) return stopRepeat();
      timer.current = setTimeout(tick, repeatDelayMs(n++));
    };
    tick();
  };

  const commitDraft = () => {
    setEditing(false);
    const parsed = parseStepperInput(draft, min, max, decimals);
    if (parsed !== null && parsed !== value) {
      haptics.selection();
      live.current = parsed;
      onChange(parsed);
    }
  };

  const valueType = size === 'large' ? t.typography.display : t.typography.title2;

  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.xs,
        backgroundColor: t.colors.surface,
        borderRadius: t.radius.card,
        padding: t.spacing.xxs,
      }}
    >
      <StepButton
        icon={Minus}
        label={`Decrease ${label}`}
        disabled={value <= min}
        dim={dim}
        onStep={() => tap(-step)}
        onRepeatStart={() => startRepeat(-step)}
        onRepeatEnd={stopRepeat}
        testID={testID ? `${testID}-dec` : undefined}
      />
      {editing ? (
        <TextInput
          testID={testID ? `${testID}-input` : undefined}
          autoFocus
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={commitDraft}
          onBlur={commitDraft}
          keyboardType={decimals > 0 ? 'decimal-pad' : 'number-pad'}
          returnKeyType="done"
          selectTextOnFocus
          accessibilityLabel={unit ? `${label} in ${unit}` : label}
          maxFontSizeMultiplier={valueType.maxFontSizeMultiplier}
          selectionColor={t.colors.accent}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: dim,
            textAlign: 'center',
            padding: 0,
            color: t.colors.textPrimary,
            fontFamily: valueType.fontFamily,
            fontSize: valueType.fontSize,
            fontVariant: ['tabular-nums'],
          }}
        />
      ) : (
        <PressableScale
          feedback="none"
          disabled={!editable}
          onPress={() => {
            setDraft(String(value));
            setEditing(true);
          }}
          style={{ flex: 1, minWidth: 0, minHeight: dim, borderRadius: t.radius.button }}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ text: spoken }}
          accessibilityHint={editable ? 'Double-tap to type a value' : undefined}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) =>
            tap(e.nativeEvent.actionName === 'increment' ? step : -step)
          }
        >
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'baseline',
              justifyContent: 'center',
              alignSelf: 'stretch',
              paddingTop: (dim - valueType.lineHeight) / 2,
              gap: t.spacing.xxs,
            }}
          >
            <Text
              variant={size === 'large' ? 'display' : 'title2'}
              tabular
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
              style={{ flexShrink: 1 }}
              testID={testID ? `${testID}-value` : undefined}
            >
              {text}
            </Text>
            {unit ? (
              <Text variant="callout" color="textSecondary" numberOfLines={1}>
                {unit}
              </Text>
            ) : null}
          </View>
        </PressableScale>
      )}
      <StepButton
        icon={Plus}
        label={`Increase ${label}`}
        disabled={value >= max}
        dim={dim}
        onStep={() => tap(step)}
        onRepeatStart={() => startRepeat(step)}
        onRepeatEnd={stopRepeat}
        testID={testID ? `${testID}-inc` : undefined}
      />
    </View>
  );
}

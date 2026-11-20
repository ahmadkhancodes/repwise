import { Check, Dumbbell } from 'lucide-react-native';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { BigNumber, ProgressRing, ringInnerWidth, Text, TickMark } from '@/ui';

/**
 * S02 slide art: a live-looking slice of the real app (one treatment on every slide) instead of an
 * icon placeholder. Decorative only: hidden from screen readers (the slide text says it all).
 */
export function WelcomeArt({ slide }: { slide: number }) {
  const t = useTheme();
  const card = {
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.card,
    padding: t.spacing.card,
    gap: t.spacing.sm,
    borderWidth: t.sizes.hairline,
    borderColor: t.colors.border,
  } as const;

  const row = (label: string, value: string, done: boolean) => (
    <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
      <TickMark checked={done} />
      <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="callout" color="textSecondary" tabular>
        {value}
      </Text>
    </View>
  );

  let body: React.ReactNode;
  if (slide === 0) {
    body = (
      <View style={card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
          <View
            style={{
              width: t.sizes.touch,
              height: t.sizes.touch,
              borderRadius: t.radius.button,
              backgroundColor: t.colors.inverse,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Dumbbell
              color={t.colors.onInverse}
              size={t.sizes.icon}
              strokeWidth={t.sizes.iconStroke}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="caption" color="accentText">
              TODAY
            </Text>
            <Text variant="title2">Push day · 52 min</Text>
          </View>
        </View>
        {row('Bench press', '4 × 8 · 80 kg', true)}
        {row('Overhead press', '3 × 10 · 40 kg', true)}
        {row('Incline dumbbell press', '3 × 12', false)}
      </View>
    );
  } else if (slide === 1) {
    const ring = t.sizes.ring;
    const stroke = t.sizes.ringStroke;
    body = (
      <View style={[card, { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }]}>
        <ProgressRing progress={0.62} size={ring} strokeWidth={stroke} accessibilityLabel="">
          <BigNumber
            value={1140}
            animate={false}
            variant="title1"
            fitWidth={ringInnerWidth(ring, stroke)}
            center
          />
          <Text variant="caption" color="textSecondary" align="center">
            kcal left
          </Text>
        </ProgressRing>
        <View style={{ flex: 1, gap: t.spacing.xs }}>
          {[
            ['Breakfast', 'Greek yoghurt bowl', true],
            ['Lunch', 'Chicken karahi bowl', true],
            ['Dinner', 'Salmon, rice, greens', false],
          ].map(([slot, dish, eaten]) => (
            <View
              key={slot as string}
              style={{ flexDirection: 'row', gap: t.spacing.xs, alignItems: 'center' }}
            >
              <TickMark checked={eaten as boolean} />
              <View style={{ flex: 1 }}>
                <Text variant="caption" color="textSecondary">
                  {slot as string}
                </Text>
                <Text variant="callout" numberOfLines={1}>
                  {dish as string}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  } else {
    const week = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const done = [true, false, true, false, true, false, false];
    body = (
      <View style={card}>
        <Text variant="caption" color="accentText">
          WEEK 4 · NEW SESSIONS
        </Text>
        <View style={{ flexDirection: 'row', gap: t.spacing.xxs }}>
          {week.map((d, i) => (
            <View
              key={i}
              style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: t.spacing.xxs }}
            >
              <Text variant="caption" color="textSecondary">
                {d}
              </Text>
              <View
                style={{
                  width: '100%',
                  maxWidth: t.spacing.xxxl,
                  aspectRatio: 1,
                  borderRadius: t.radius.pill,
                  backgroundColor: done[i] ? t.colors.accent : 'transparent',
                  borderWidth: done[i] ? 0 : t.sizes.hairline,
                  borderColor: t.colors.borderStrong,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {done[i] ? (
                  <Check
                    color={t.colors.onAccent}
                    size={t.sizes.iconSmall}
                    strokeWidth={t.sizes.iconStrokeBold}
                  />
                ) : null}
              </View>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: t.spacing.xs }}>
          <BigNumber value={102.5} decimals={1} animate={false} variant="title1" unit="kg" />
          <Text variant="callout" color="accentText" tabular>
            +7.5 kg squat
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={`welcome-art-${slide}`}
    >
      {body}
    </View>
  );
}

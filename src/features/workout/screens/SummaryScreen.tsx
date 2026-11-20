import { router } from 'expo-router';
import { Share2, TrendingUp, Trophy, TriangleAlert } from 'lucide-react-native';
import { useEffect, useRef, type ComponentRef } from 'react';
import { Share, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { haptics } from '@/services/haptics';
import { useCatalogFor } from '@/services/catalog';
import { useTheme } from '@/theme';
import { shareViewAsImage } from '@/features/progress/services/shareImage';
import {
  BigNumber,
  Button,
  Card,
  EmptyState,
  Screen,
  SkeletonCard,
  SkeletonGroup,
  SkeletonText,
  Text,
  formatNumber,
} from '@/ui';

import { Confetti } from '../components/Confetti';
import { useSummary } from '../hooks/useSummary';
import { useUnits } from '../hooks/useUnits';
import { shortDate } from '../logic/dates';
import { formatMinutes } from '../logic/duration';
import { nextTimeHeadline } from '../logic/nextTime';
import { shareText } from '../logic/summary';
import { formatWeight, toDisplayWeight } from '../logic/units';

/** S35 Workout summary: one huge number, PRs (W3 wow moment), next-time suggestions, share. */
export function SummaryScreen({ sessionId }: { sessionId: string }) {
  const t = useTheme();
  const catalog = useCatalogFor('exercises');
  const { unit } = useUnits();
  const { data, loaded, error } = useSummary(sessionId, catalog, unit);
  const celebrated = useRef(false);
  const card = useRef<ComponentRef<typeof View>>(null);
  const prCount = data?.summary.prs.length ?? 0;

  useEffect(() => {
    if (prCount > 0 && !celebrated.current) {
      celebrated.current = true;
      haptics.success();
    }
  }, [prCount]);

  const done = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/train'));

  if (error) {
    return (
      <Screen testID="screen-summary">
        <EmptyState
          icon={TriangleAlert}
          title="Couldn't load the summary"
          body="Your workout is saved."
          actionLabel="Done"
          onAction={done}
          testID="summary-error"
        />
      </Screen>
    );
  }
  if (!loaded || !catalog) {
    return (
      <Screen testID="screen-summary">
        <SkeletonGroup label="Loading summary" testID="summary-loading">
          <SkeletonText variant="display" lines={1} lastLineWidth="45%" />
          <SkeletonCard lines={2} />
        </SkeletonGroup>
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen testID="screen-summary">
        <EmptyState
          icon={TriangleAlert}
          title="Workout not found"
          actionLabel="Done"
          onAction={done}
          testID="summary-missing"
        />
      </Screen>
    );
  }

  const { session, summary } = data;
  const title = session.title ?? 'Workout';
  const volume = toDisplayWeight(summary.volumeKg, unit);
  const shareAsText = () =>
    Share.share({
      message: shareText(title, summary, unit, {
        duration: formatMinutes(summary.durationMs),
        volume: formatNumber(volume),
      }),
    }).catch(() => undefined);
  /** Share card image (W3): the hero number, stats and PRs as a PNG; text if that fails. */
  const share = () =>
    shareViewAsImage(card, `repwise-workout-${session.date ?? 'today'}`, 'wrapped')
      .then((ok) => (ok ? undefined : shareAsText()))
      .catch(() => shareAsText());

  return (
    <View style={{ flex: 1 }}>
      <Screen
        title="Workout done"
        footer={
          <>
            <Button label="Done" onPress={done} testID="summary-done" />
            <Button
              label="Share"
              icon={Share2}
              variant="tertiary"
              onPress={share}
              testID="summary-share"
            />
          </>
        }
        testID="screen-summary"
      >
        <View
          ref={card}
          collapsable={false}
          style={{ gap: t.spacing.md, backgroundColor: t.colors.bg }}
          testID="summary-card"
        >
          <Text variant="body" color="textSecondary">
            {title}
            {session.date ? ` · ${shortDate(session.date)}` : ''}
          </Text>
          <BigNumber
            value={Math.round(volume)}
            unit={unit}
            label="Total volume"
            testID="summary-volume"
          />
          <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
            {[
              { label: 'Time', value: formatMinutes(summary.durationMs), id: 'time' },
              { label: 'Sets', value: String(summary.setsDone), id: 'sets' },
              { label: 'Exercises', value: String(summary.exercisesDone), id: 'exercises' },
            ].map((s) => (
              <Card key={s.id} style={{ flex: 1 }} testID={`summary-${s.id}`}>
                <Text variant="caption" color="textSecondary">
                  {s.label}
                </Text>
                <Text variant="headline" tabular>
                  {s.value}
                </Text>
              </Card>
            ))}
          </View>

          {summary.prs.length ? (
            <View style={{ gap: t.spacing.sm }}>
              <Text variant="title2" accessibilityRole="header">
                New records
              </Text>
              {summary.prs.map((p, i) => (
                <Animated.View
                  key={p.name}
                  entering={FadeInUp.delay(200 + i * 120)
                    .springify()
                    .damping(t.motion.spring.damping)
                    .stiffness(t.motion.spring.stiffness)}
                >
                  <Card
                    selected
                    testID={`summary-pr-${i}`}
                    accessibilityLabel={`New PR: ${p.name}`}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                      <Trophy
                        color={t.colors.accentText}
                        size={t.sizes.icon}
                        strokeWidth={t.sizes.iconStroke}
                      />
                      <View style={{ flex: 1 }}>
                        <Text variant="caption" color="accentText">
                          New PR{p.pr.kind === 'e1rm' ? ' · best set' : ''}
                        </Text>
                        <Text variant="headline">{p.name}</Text>
                      </View>
                      <Text variant="title2" tabular>
                        {formatWeight(p.pr.weightKg, unit)} {unit}
                        <Text variant="callout" color="textSecondary">{` × ${p.pr.reps}`}</Text>
                      </Text>
                    </View>
                  </Card>
                </Animated.View>
              ))}
            </View>
          ) : null}
        </View>

        {summary.next.length ? (
          <View style={{ gap: t.spacing.xs }}>
            <Text variant="title2" accessibilityRole="header">
              Next time
            </Text>
            {summary.next.map((n, i) => (
              <View
                key={n.name}
                testID={`summary-next-${i}`}
                accessible
                accessibilityLabel={`${n.name}: ${nextTimeHeadline(n.next)}, ${n.next.text}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.spacing.sm,
                  minHeight: t.sizes.row,
                  borderBottomWidth: i < summary.next.length - 1 ? t.sizes.hairline : 0,
                  borderBottomColor: t.colors.border,
                }}
              >
                <TrendingUp
                  color={
                    n.next.action === 'increase_load' ? t.colors.accentText : t.colors.textSecondary
                  }
                  size={t.sizes.iconSmall + t.spacing.xxs}
                  strokeWidth={t.sizes.iconStroke}
                />
                <View style={{ flex: 1 }}>
                  <Text variant="body" numberOfLines={1}>
                    {n.name}
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    {nextTimeHeadline(n.next)}
                  </Text>
                </View>
                <Text variant="headline" tabular>
                  {n.next.text}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </Screen>
      <Confetti play={prCount > 0} />
    </View>
  );
}

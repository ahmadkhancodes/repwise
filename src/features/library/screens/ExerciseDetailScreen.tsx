import { router } from 'expo-router';
import { ChevronLeft, CircleAlert, Heart, Pencil, SearchX } from 'lucide-react-native';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Badge, Button, EmptyState, IconButton, PressableScale, Screen, SectionHeader, Skeleton, SkeletonGroup, SkeletonText, StepNumber, Text } from '@/ui';

import { AddToWorkoutSheet } from '../components/AddToWorkoutSheet';
import { MuscleLegend } from '../components/BodyMap';
import { ExerciseHero } from '../components/ExerciseMedia';
import { ExerciseRecords } from '../components/ExerciseRecords';
import { ExerciseRow } from '../components/ExerciseRow';
import { resolveItem, useCatalogState, useCustomItems } from '../hooks/useLibrary';
import { bodyPalette } from '../logic/bodyPalette';
import { EQUIPMENT_LABEL, MUSCLE_LABEL } from '../logic/labels';
import type { LibraryItem } from '../logic/libraryItem';
import { useIsFavourite, useLibraryPrefs } from '../prefs';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/library');
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.sm, marginTop: t.spacing.sm }}>
      <SectionHeader title={title} />
      {children}
    </View>
  );
}

/** Steps get a numbered disc (glanceable mid-set); cues and mistakes a quiet dot. */
function Lines({
  items,
  numbered,
  testID,
}: {
  items: string[];
  numbered?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  const disc = t.spacing.xl;
  return (
    <View style={{ gap: t.spacing.md }} testID={testID}>
      {items.map((line, i) => (
        <View
          key={i}
          style={{ flexDirection: 'row', gap: t.spacing.sm }}
          accessible
          accessibilityLabel={numbered ? `Step ${i + 1}. ${line}` : line}
        >
          {numbered ? (
            <StepNumber n={i + 1} />
          ) : (
            <View
              style={{
                width: disc,
                height: t.typography.body.lineHeight,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: t.spacing.xs - t.sizes.borderThick,
                  height: t.spacing.xs - t.sizes.borderThick,
                  borderRadius: t.radius.pill,
                  backgroundColor: t.colors.textSecondary,
                }}
              />
            </View>
          )}
          <Text variant="body" style={{ flex: 1 }}>
            {line}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Loading layout shaped like the detail page: hero, tags, a heading and steps. */
function DetailSkeleton() {
  const t = useTheme();
  return (
    <SkeletonGroup label="Loading exercise" testID="exercise-loading" style={{ gap: t.spacing.lg }}>
      <Skeleton height={t.sizes.ringHero} radius={t.radius.card} />
      <View style={{ flexDirection: 'row', gap: t.spacing.xs }}>
        <Skeleton height={t.spacing.xl} width={t.sizes.ring * 0.7} radius={t.radius.pill} />
        <Skeleton height={t.spacing.xl} width={t.sizes.ring * 0.5} radius={t.radius.pill} />
      </View>
      <SkeletonText variant="title2" lines={1} />
      <SkeletonText lines={4} />
    </SkeletonGroup>
  );
}

function Detail({ item, alternatives }: { item: LibraryItem; alternatives: LibraryItem[] }) {
  const t = useTheme();
  const palette = useMemo(() => bodyPalette(t.colors, t.scheme), [t.colors, t.scheme]);
  // Level and pattern sit on the hero; the tags list the full kit and one-sided work.
  const tags = [
    ...item.equipment
      .filter((e) => e !== 'bodyweight' || item.equipment.length === 1)
      .map((e) => EQUIPMENT_LABEL[e]),
    item.unilateral ? 'One side at a time' : null,
  ].filter((x): x is string => Boolean(x));

  return (
    <>
      <ExerciseHero
        mediaId={item.mediaId}
        name={item.name}
        exercise={item}
        testID="exercise-media"
      />
      {tags.length ? (
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs }}
          testID="exercise-tags"
        >
          {tags.map((tag) => (
            <Badge key={tag} label={tag} />
          ))}
        </View>
      ) : null}
      <Section title="Muscles">
        <View
          style={{ gap: t.spacing.xs }}
          testID="body-map"
          accessible
          accessibilityLabel={`Muscles worked. Main: ${item.primaryMuscles.map((m) => MUSCLE_LABEL[m]).join(', ') || 'none'}.${item.secondaryMuscles.length ? ` Also: ${item.secondaryMuscles.map((m) => MUSCLE_LABEL[m]).join(', ')}.` : ''}`}
        >
          <MuscleLegend color={palette.primary} title="Main" muscles={item.primaryMuscles} />
          {item.secondaryMuscles.length ? (
            <MuscleLegend
              color={palette.secondary}
              title="Also works"
              muscles={item.secondaryMuscles}
            />
          ) : null}
        </View>
      </Section>
      <Section title="Your records">
        <ExerciseRecords exerciseId={item.id} />
      </Section>
      {item.instructions.length ? (
        <Section title="How to do it">
          <Lines items={item.instructions} numbered testID="exercise-steps" />
        </Section>
      ) : null}
      {item.cues.length ? (
        <Section title="Cues">
          <Lines items={item.cues} testID="exercise-cues" />
        </Section>
      ) : null}
      {item.commonMistakes.length ? (
        <Section title="Common mistakes">
          <Lines items={item.commonMistakes} />
        </Section>
      ) : null}
      {alternatives.length ? (
        <Section title="Alternatives">
          <View>
            {alternatives.map((a) => (
              <ExerciseRow
                key={a.id}
                item={a}
                favouriteToggle={false}
                onPress={(x) => router.push({ pathname: '/exercise/[id]', params: { id: x.id } })}
              />
            ))}
          </View>
        </Section>
      ) : null}
    </>
  );
}

/** S19 Exercise detail: media, muscle map, records, steps, cues, mistakes, alternatives. */
export function ExerciseDetailScreen({ id }: { id: string }) {
  const t = useTheme();
  const { catalog, error, retry } = useCatalogState();
  const { items: customs } = useCustomItems();
  const item = resolveItem(id, catalog, customs);
  const fav = useIsFavourite(id);
  const toggleFavourite = useLibraryPrefs((s) => s.toggleFavourite);
  const markViewed = useLibraryPrefs((s) => s.markViewed);
  const [adding, setAdding] = useState(false);
  const found = Boolean(item);

  useEffect(() => {
    if (found) markViewed(id);
  }, [found, id, markViewed]);

  const alternatives = (item?.alternatives ?? [])
    .map((a) => resolveItem(a, catalog, customs))
    .filter((x): x is LibraryItem => Boolean(x));

  let content: ReactNode;
  if (error) {
    content = (
      <EmptyState
        icon={CircleAlert}
        title="Couldn't open this exercise"
        body="Try again in a moment."
        actionLabel="Try again"
        onAction={retry}
        testID="exercise-error"
      />
    );
  } else if (!catalog) {
    content = <DetailSkeleton />;
  } else if (!item) {
    content = (
      <EmptyState
        icon={SearchX}
        title="Exercise not found"
        body="It may have been deleted."
        actionLabel="Back to library"
        onAction={() => router.replace('/library')}
        testID="exercise-missing"
      />
    );
  } else {
    content = <Detail item={item} alternatives={alternatives} />;
  }

  return (
    <Screen
      title={item?.name}
      testID="screen-exercise"
      headerLeft={
        <IconButton
          icon={ChevronLeft}
          accessibilityLabel="Back"
          onPress={goBack}
          testID="exercise-back"
        />
      }
      headerRight={
        item ? (
          <View style={{ flexDirection: 'row' }}>
            {item.custom ? (
              <IconButton
                icon={Pencil}
                accessibilityLabel="Edit exercise"
                onPress={() =>
                  router.push({ pathname: '/exercise/custom', params: { id: item.id } })
                }
                testID="exercise-edit"
              />
            ) : null}
            <PressableScale
              testID="exercise-favourite"
              feedback="selection"
              onPress={() => toggleFavourite(item.id)}
              accessibilityRole="button"
              accessibilityLabel={fav ? 'Remove from favourites' : 'Add to favourites'}
              accessibilityState={{ selected: fav }}
              style={{
                width: t.sizes.touch,
                height: t.sizes.touch,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: t.radius.pill,
              }}
            >
              <Heart
                color={t.colors.textPrimary}
                fill={fav ? t.colors.textPrimary : 'transparent'}
                size={t.sizes.icon}
                strokeWidth={t.sizes.iconStroke}
              />
            </PressableScale>
          </View>
        ) : null
      }
      footer={
        item ? (
          <Button label="Add to workout" onPress={() => setAdding(true)} testID="exercise-add" />
        ) : undefined
      }
    >
      {content}
      {item ? (
        <AddToWorkoutSheet
          open={adding}
          onClose={() => setAdding(false)}
          exerciseId={item.id}
          exerciseName={item.name}
        />
      ) : null}
    </Screen>
  );
}

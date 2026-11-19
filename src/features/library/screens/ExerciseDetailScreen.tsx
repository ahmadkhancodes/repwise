import { router } from 'expo-router';
import { ChevronLeft, Heart, Pencil, SearchX } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Button, Card, EmptyState, IconButton, PressableScale, Screen, Text } from '@/ui';

import { AddToWorkoutSheet } from '../components/AddToWorkoutSheet';
import { BodyMap } from '../components/BodyMap';
import { ExerciseHero } from '../components/ExerciseMedia';
import { ExerciseRecords } from '../components/ExerciseRecords';
import { ExerciseRow } from '../components/ExerciseRow';
import { SkeletonRows } from '../components/SkeletonRows';
import { resolveItem, useCatalogState, useCustomItems } from '../hooks/useLibrary';
import { EQUIPMENT_LABEL, LEVEL_LABEL, PATTERN_LABEL } from '../logic/labels';
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
      <Text variant="title2" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Lines({ items, numbered }: { items: string[]; numbered?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.sm }}>
      {items.map((line, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: t.spacing.sm }}>
          <Text variant="body" color="textSecondary" tabular style={{ minWidth: t.spacing.lg }}>
            {numbered ? `${i + 1}` : '•'}
          </Text>
          <Text variant="body" style={{ flex: 1 }}>
            {line}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Tag({ label }: { label: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: t.spacing.sm,
        paddingVertical: t.spacing.xxs,
        borderRadius: t.radius.pill,
        backgroundColor: t.colors.surface,
      }}
    >
      <Text variant="callout">{label}</Text>
    </View>
  );
}

function Detail({ item, alternatives }: { item: LibraryItem; alternatives: LibraryItem[] }) {
  const t = useTheme();
  const tags = [
    item.level ? LEVEL_LABEL[item.level] : null,
    ...item.equipment
      .filter((e) => e !== 'bodyweight' || item.equipment.length === 1)
      .map((e) => EQUIPMENT_LABEL[e]),
    item.patternFamily ? PATTERN_LABEL[item.patternFamily] : null,
    item.unilateral ? 'One side at a time' : null,
  ].filter((x): x is string => Boolean(x));

  return (
    <>
      <ExerciseHero mediaId={item.mediaId} name={item.name} testID="exercise-media" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs }}>
        {tags.map((tag) => (
          <Tag key={tag} label={tag} />
        ))}
      </View>
      <Card>
        <BodyMap
          primary={item.primaryMuscles}
          secondary={item.secondaryMuscles}
          testID="body-map"
        />
      </Card>
      <Section title="Your records">
        <ExerciseRecords exerciseId={item.id} />
      </Section>
      {item.instructions.length ? (
        <Section title="How to do it">
          <Lines items={item.instructions} numbered />
        </Section>
      ) : null}
      {item.cues.length ? (
        <Section title="Cues">
          <Lines items={item.cues} />
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
        title="Couldn't open this exercise"
        body="Try again in a moment."
        actionLabel="Try again"
        onAction={retry}
        testID="exercise-error"
      />
    );
  } else if (!catalog) {
    content = <SkeletonRows count={4} testID="exercise-loading" />;
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
                color={fav ? t.colors.accent : t.colors.textPrimary}
                fill={fav ? t.colors.accent : 'transparent'}
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

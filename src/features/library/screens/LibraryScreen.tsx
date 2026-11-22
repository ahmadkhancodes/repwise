import { router } from 'expo-router';
import { CloudOff, Plus, SearchX } from 'lucide-react-native';
import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, Platform, ScrollView, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { searchExercises } from '@/services/catalog';
import { useTheme } from '@/theme';
import {
  Chip,
  EmptyState,
  IconButton,
  Screen,
  SearchBar,
  Skeleton,
  SkeletonGroup,
  SkeletonText,
  Text,
  enterAt,
} from '@/ui';

import { ExerciseRow } from '../components/ExerciseRow';
import { FilterSheet } from '../components/FilterSheet';
import { Shelf } from '../components/Shelf';
import { useExerciseDb } from '../hooks/useExerciseDb';
import { useCatalogState, useCustomItems, useShelves } from '../hooks/useLibrary';
import {
  EMPTY_FILTERS,
  MUSCLE_GROUPS,
  activeFilterChips,
  activeFilterCount,
  muscleRail,
  toggleMuscle,
  type LibraryFilters,
} from '../logic/filters';
import { LEVEL_LABEL, PATTERN_LABEL } from '../logic/labels';
import { searchLibrary, type LibraryItem } from '../logic/libraryItem';

/** Every exercise fits (curated ~283 + own + ~1,300 browse-only V1); the list is virtualised. */
const RESULT_LIMIT = 2500;

/** Rows that stagger in on first paint (one screenful); the rest render plain. */
const STAGGER_ROWS = 10;

export function openExercise(item: Pick<LibraryItem, 'id'>): void {
  router.push({ pathname: '/exercise/[id]', params: { id: item.id } });
}

const keyOf = (i: LibraryItem) => i.id;

/** First screenful springs in (sheet 11: 20 ms stagger); memoised so scrolling never re-renders it. */
const StaggeredRow = memo(function StaggeredRow({
  item,
  index,
  animate,
}: {
  item: LibraryItem;
  index: number;
  animate: boolean;
}) {
  const reduce = useReducedMotion();
  if (!animate || index >= STAGGER_ROWS) return <ExerciseRow item={item} onPress={openExercise} />;
  return (
    <Animated.View entering={enterAt(index, reduce)}>
      <ExerciseRow item={item} onPress={openExercise} />
    </Animated.View>
  );
});

/** Loading rows shaped like ExerciseRow (thumb + two text lines). */
export function LibrarySkeleton({ rows = 8, testID }: { rows?: number; testID?: string }) {
  const t = useTheme();
  return (
    <SkeletonGroup label="Loading exercises" testID={testID} style={{ gap: t.spacing.md }}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
          <Skeleton height={t.sizes.row} width={t.sizes.row} radius={t.radius.button} />
          <View style={{ flex: 1 }}>
            <SkeletonText lines={2} variant="callout" lastLineWidth={`${40 + (i % 3) * 10}%`} />
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
}

/** S18 Exercise library: debounced search (< 50 ms), muscle chips, filters, shelves, own exercises. */
export function LibraryScreen() {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const { catalog, error, retry } = useCatalogState();
  const { items: customs } = useCustomItems();
  const exdb = useExerciseDb();
  const extras = exdb?.indexed;
  const shelves = useShelves(catalog, customs, exdb?.byId);
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<LibraryFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterCount = activeFilterCount(filters);
  const searching = query.length > 0 || filterCount > 0;

  const results = useMemo(
    () =>
      catalog
        ? searchLibrary(searchExercises, customs, query, filters, RESULT_LIMIT, extras)
        : [],
    [catalog, customs, query, filters, extras],
  );
  const countFor = useCallback(
    (f: LibraryFilters) =>
      catalog ? searchLibrary(searchExercises, customs, query, f, RESULT_LIMIT, extras).length : 0,
    [catalog, customs, query, extras],
  );
  const otherChips = activeFilterChips(filters, {
    pattern: PATTERN_LABEL,
    level: LEVEL_LABEL,
  }).filter((c) => !c.key.startsWith('m:'));
  const total = (catalog?.exercises.length ?? 0) + customs.length + (exdb?.items.length ?? 0);
  const clearAll = useCallback(() => {
    setText('');
    setQuery('');
    setFilters(EMPTY_FILTERS);
  }, []);

  const animate = !reduceMotion && !searching;
  const renderItem = useCallback(
    ({ item, index }: { item: LibraryItem; index: number }) => (
      <StaggeredRow item={item} index={index} animate={animate} />
    ),
    [animate],
  );

  const header = (
    <View style={{ gap: t.spacing.xl, paddingBottom: t.spacing.sm }}>
      {!searching && shelves.favourites.length ? (
        <Shelf
          title="Favourites"
          items={shelves.favourites}
          onPress={openExercise}
          testID="shelf-favourites"
        />
      ) : null}
      {!searching && shelves.recent.length ? (
        <Shelf
          title="Recently used"
          items={shelves.recent}
          onPress={openExercise}
          testID="shelf-recent"
        />
      ) : null}
      <View
        style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}
      >
        <Text variant="title2" accessibilityRole="header">
          {searching ? 'Results' : 'All exercises'}
        </Text>
        <Text variant="callout" color="textSecondary" tabular testID="library-count">
          {searching ? results.length : total}
        </Text>
      </View>
    </View>
  );

  let body;
  if (error) {
    body = (
      <EmptyState
        icon={CloudOff}
        title="Couldn't open the library"
        body="Your exercises are safe on this phone. Try again."
        actionLabel="Try again"
        onAction={retry}
        testID="library-error"
      />
    );
  } else if (!catalog) {
    body = <LibrarySkeleton testID="library-loading" />;
  } else {
    body = (
      <FlatList
        testID="library-list"
        data={results}
        keyExtractor={keyOf}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState
            icon={SearchX}
            title="No exercises match"
            body="Try another name or muscle, or clear the filters."
            actionLabel="Clear search and filters"
            onAction={clearAll}
            testID="library-empty"
          />
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={32}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        style={{ marginHorizontal: -t.spacing.screen }}
        contentContainerStyle={{
          paddingHorizontal: t.spacing.screen,
          paddingBottom: t.spacing.xxl,
        }}
      />
    );
  }

  return (
    <Screen
      title="Library"
      edges={['top']}
      scroll={false}
      testID="screen-library"
      contentStyle={{ paddingBottom: 0 }}
      headerRight={
        <IconButton
          icon={Plus}
          accessibilityLabel="Create exercise"
          onPress={() => router.push('/exercise/custom')}
          testID="library-create"
        />
      }
    >
      <SearchBar
        value={text}
        onChangeText={setText}
        onSearch={setQuery}
        placeholder={total ? `Search ${total} exercises` : 'Search exercises'}
        accessibilityLabel="Search exercises"
        filterCount={filterCount}
        onOpenFilters={() => setFiltersOpen(true)}
        testID="library-search"
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={{ marginHorizontal: -t.spacing.screen, flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: t.spacing.screen, gap: t.spacing.xs }}
        testID="library-chips"
      >
        {otherChips.map((c) => (
          <Chip
            key={c.key}
            label={c.label}
            selected
            onPress={() => setFilters((f) => c.remove(f))}
            testID={`active-filter-${c.key}`}
          />
        ))}
        {muscleRail(filters).map((g) => (
          <Chip
            key={g}
            label={MUSCLE_GROUPS[g].label}
            selected={filters.muscles.includes(g)}
            onPress={() => setFilters((f) => toggleMuscle(f, g))}
            testID={`muscle-chip-${g}`}
          />
        ))}
      </ScrollView>
      <View style={{ flex: 1 }}>{body}</View>
      <FilterSheet
        open={filtersOpen}
        value={filters}
        onClose={() => setFiltersOpen(false)}
        onApply={(f) => {
          setFilters(f);
          setFiltersOpen(false);
        }}
        countFor={countFor}
      />
    </Screen>
  );
}

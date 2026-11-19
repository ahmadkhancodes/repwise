import { router } from 'expo-router';
import { CloudOff, Plus, SearchX } from 'lucide-react-native';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';

import { searchExercises } from '@/services/catalog';
import { useTheme } from '@/theme';
import { Chip, EmptyState, IconButton, Screen, Text } from '@/ui';

import { ExerciseRow } from '../components/ExerciseRow';
import { FilterSheet } from '../components/FilterSheet';
import { SearchBar } from '../components/SearchBar';
import { Shelf } from '../components/Shelf';
import { SkeletonRows } from '../components/SkeletonRows';
import { useCatalogState, useCustomItems, useShelves } from '../hooks/useLibrary';
import {
  EMPTY_FILTERS,
  activeFilterChips,
  activeFilterCount,
  type LibraryFilters,
} from '../logic/filters';
import { LEVEL_LABEL, PATTERN_LABEL } from '../logic/labels';
import { searchLibrary, type LibraryItem } from '../logic/libraryItem';

const STAGGER_ROWS = 12;

export function openExercise(item: Pick<LibraryItem, 'id'>): void {
  router.push({ pathname: '/exercise/[id]', params: { id: item.id } });
}

/** S18 Exercise library: search (< 50 ms), filters, favourites, recently used, own exercises. */
export function LibraryScreen() {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const { catalog, error, retry } = useCatalogState();
  const { items: customs } = useCustomItems();
  const shelves = useShelves(catalog, customs);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<LibraryFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const filterCount = activeFilterCount(filters);
  const searching = deferredQuery.trim().length > 0 || filterCount > 0;

  const results = useMemo(
    () => (catalog ? searchLibrary(searchExercises, customs, deferredQuery, filters) : []),
    [catalog, customs, deferredQuery, filters],
  );
  const countFor = useCallback(
    (f: LibraryFilters) =>
      catalog ? searchLibrary(searchExercises, customs, deferredQuery, f).length : 0,
    [catalog, customs, deferredQuery],
  );
  const chips = activeFilterChips(filters, { pattern: PATTERN_LABEL, level: LEVEL_LABEL });
  const total = (catalog?.exercises.length ?? 0) + customs.length;

  const renderItem = useCallback(
    ({ item, index }: { item: LibraryItem; index: number }) => (
      <Animated.View
        entering={
          reduceMotion || index >= STAGGER_ROWS
            ? undefined
            : FadeInDown.delay(index * t.motion.listStagger)
                .springify()
                .damping(t.motion.spring.damping)
                .stiffness(t.motion.spring.stiffness)
        }
      >
        <ExerciseRow item={item} onPress={openExercise} />
      </Animated.View>
    ),
    [reduceMotion, t.motion],
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
    body = <SkeletonRows testID="library-loading" />;
  } else {
    body = (
      <FlatList
        testID="library-list"
        data={results}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState
            icon={SearchX}
            title="No exercises match"
            body="Try another name or muscle, or clear the filters."
            actionLabel="Clear search and filters"
            onAction={() => {
              setQuery('');
              setFilters(EMPTY_FILTERS);
            }}
            testID="library-empty"
          />
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={14}
        windowSize={11}
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
        value={query}
        onChange={setQuery}
        placeholder={total ? `Search ${total} exercises` : 'Search exercises'}
        filterCount={filterCount}
        onOpenFilters={() => setFiltersOpen(true)}
      />
      {chips.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -t.spacing.screen, flexGrow: 0 }}
          contentContainerStyle={{ paddingHorizontal: t.spacing.screen, gap: t.spacing.xs }}
          testID="active-filters"
        >
          {chips.map((c) => (
            <Chip
              key={c.key}
              label={c.label}
              selected
              onPress={() => setFilters((f) => c.remove(f))}
              testID={`active-filter-${c.key}`}
            />
          ))}
        </ScrollView>
      ) : null}
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

import { router } from 'expo-router';
import { Dumbbell, X } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';

import { ExerciseRow } from '@/features/library/components/ExerciseRow';
import { fromCatalog, type LibraryItem } from '@/features/library';
import { routinesRepo } from '@/features/library/repo';
import { haptics } from '@/services/haptics';
import { searchExercises, useCatalogFor } from '@/services/catalog';
import { useTheme } from '@/theme';
import {
  EmptyState,
  IconButton,
  Screen,
  SearchBar,
  SkeletonCard,
  SkeletonGroup,
  showToast,
} from '@/ui';

import { isCardioPattern } from '../logic/cardio';
import { DEFAULT_ITEM, parseRoutineItems } from '../logic/routines';
import { addExercise } from '../repo';

/** Add exercise (modal): the library's "Where to?" search and rows, for a live workout or a routine. */
export function ExercisePickerScreen({
  sessionId,
  routineId,
}: {
  sessionId?: string;
  routineId?: string;
}) {
  const t = useTheme();
  const catalog = useCatalogFor('exercises');
  const [query, setQuery] = useState('');
  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/train'));
  const results = useMemo(
    () => (catalog ? searchExercises(query, { limit: 60 }).map(fromCatalog) : []),
    [catalog, query],
  );

  const pick = useCallback(
    (item: LibraryItem) => {
      if (sessionId) {
        addExercise(
          sessionId,
          { exerciseId: item.id },
          { cardio: isCardioPattern(catalog?.exerciseById.get(item.id)?.pattern) },
        );
      } else if (routineId) {
        const r = routinesRepo.get(routineId);
        if (r)
          routinesRepo.update(routineId, {
            items: [...parseRoutineItems(r.items), { exerciseId: item.id, ...DEFAULT_ITEM }],
          });
      }
      haptics.light();
      showToast({ message: `${item.name} added`, tone: 'success', silent: true });
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/train');
    },
    [sessionId, routineId, catalog],
  );

  return (
    <>
      <Screen
        keyboard
        title="Add exercise"
        scroll={false}
        headerLeft={
          <IconButton icon={X} accessibilityLabel="Close" onPress={close} testID="pick-close" />
        }
        testID="screen-pick"
      >
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Bench, squat, rows…"
          accessibilityLabel="Search exercises"
          testID="pick-search"
        />
        {!catalog ? (
          <SkeletonGroup label="Loading exercises" testID="pick-loading">
            <SkeletonCard media lines={1} />
            <SkeletonCard media lines={1} />
            <SkeletonCard media lines={1} />
          </SkeletonGroup>
        ) : results.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title="No matches"
            body="Try a muscle or equipment, like “chest” or “dumbbell”."
            testID="pick-empty"
          />
        ) : (
          <FlatList
            data={results}
            keyExtractor={(e) => e.id}
            renderItem={({ item }) => (
              <ExerciseRow item={item} onPress={pick} favouriteToggle={false} />
            )}
            ItemSeparatorComponent={() => (
              <View style={{ height: t.sizes.hairline, backgroundColor: t.colors.border }} />
            )}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={12}
            style={{ flex: 1 }}
            testID="pick-list"
          />
        )}
      </Screen>
    </>
  );
}

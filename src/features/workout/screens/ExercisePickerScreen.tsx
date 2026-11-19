import { router } from 'expo-router';
import { ChevronLeft, Dumbbell, Search } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { routinesRepo } from '@/features/library/repo';
import { haptics } from '@/services/haptics';
import { searchExercises, useCatalog } from '@/services/catalog';
import { useTheme } from '@/theme';
import { EmptyState, IconButton, ListRow, Screen, TextField, showToast } from '@/ui';

import { isCardioPattern } from '../logic/cardio';
import { DEFAULT_ITEM, parseRoutineItems } from '../logic/routines';
import { addExercise } from '../repo';
import { SkeletonList } from '../components/Skeleton';

const pretty = (s: string) => s.replace(/_/g, ' ');

/** Add exercise ('Where to?' search, sheet 11) for a live workout or a routine. */
export function ExercisePickerScreen({ sessionId, routineId }: { sessionId?: string; routineId?: string }) {
  const t = useTheme();
  const catalog = useCatalog();
  const [query, setQuery] = useState('');
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/train'));
  const results = catalog ? searchExercises(query, { limit: 60 }) : [];

  const pick = (id: string, name: string, pattern: string) => {
    if (sessionId) {
      addExercise(sessionId, { exerciseId: id }, { cardio: isCardioPattern(pattern) });
    } else if (routineId) {
      const r = routinesRepo.get(routineId);
      if (r) routinesRepo.update(routineId, { items: [...parseRoutineItems(r.items), { exerciseId: id, ...DEFAULT_ITEM }] });
    }
    haptics.success();
    showToast({ message: `${name} added`, tone: 'success' });
    back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen
        title="Add exercise"
        headerLeft={<IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={back} testID="pick-back" />}
        testID="screen-pick"
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: t.spacing.xs }}>
          <View style={{ paddingBottom: t.spacing.sm }}>
            <Search color={t.colors.textSecondary} size={t.sizes.icon} strokeWidth={t.sizes.iconStroke} />
          </View>
          <View style={{ flex: 1 }}>
            <TextField
              label="Search exercises"
              value={query}
              onChangeText={setQuery}
              placeholder="Bench, squat, rows…"
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              testID="pick-search"
            />
          </View>
        </View>
        {!catalog ? (
          <SkeletonList testID="pick-loading" />
        ) : results.length === 0 ? (
          <EmptyState icon={Dumbbell} title="No matches" body="Try a muscle or equipment, like “chest” or “dumbbell”." testID="pick-empty" />
        ) : (
          <View>
            {results.map((e, i) => (
              <ListRow
                key={e.id}
                title={e.name}
                subtitle={[e.primaryMuscles.map(pretty).join(', '), e.equipment.map(pretty).join(', ')].join(' · ')}
                onPress={() => pick(e.id, e.name, e.pattern)}
                divider={i < results.length - 1}
                testID={`pick-${e.id}`}
              />
            ))}
          </View>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

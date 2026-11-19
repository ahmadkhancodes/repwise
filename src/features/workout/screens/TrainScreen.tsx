import { router, useLocalSearchParams } from 'expo-router';
import { Calculator, CalendarDays, CircleCheck, Dumbbell, History, ListPlus, Plus, TriangleAlert } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { usePro } from '@/features/billing';
import { routinesRepo, useRoutines } from '@/features/library/repo';
import { loadCatalog, useCatalog } from '@/services/catalog';
import { useTheme } from '@/theme';
import { Button, Card, EmptyState, IconButton, Screen, Segmented, showToast, Text } from '@/ui';

import { resumeWorkoutAction, startWorkoutAction } from '../actions';
import { ResumeBanner } from '../components/ResumeBanner';
import { WeekStrip } from '../components/WeekStrip';
import { useNow } from '../hooks/useNow';
import { useActiveSession, useHistory, useWeekSessions, type WeekSessionCard } from '../hooks/useTrain';
import { useUnits } from '../hooks/useUnits';
import { localDate, longWeekday, shortDate, weekOf } from '../logic/dates';
import { parseTrainLink, resolveTrainLink } from '../logic/deepLink';
import { estimateMinutes, formatMinutes } from '../logic/duration';
import { canAddRoutine, parseRoutineItems, routineSetCount } from '../logic/routines';
import { formatWeight } from '../logic/units';
import { weekCounts, weekStates } from '../logic/week';
import { activeSession, createSession, getSession } from '../repo';

type Tab = 'week' | 'history' | 'routines';
const TABS = [
  { value: 'week', label: 'Week' },
  { value: 'history', label: 'History' },
  { value: 'routines', label: 'Routines' },
] as const;

const STATUS: Record<string, string> = {
  done: 'Done',
  active: 'In progress',
  paused: 'Paused',
  planned: 'Planned',
  skipped: 'Skipped',
};

function SessionCard({ card, today, index }: { card: WeekSessionCard; today: string; index: number }) {
  const t = useTheme();
  const s = card.session;
  const min = estimateMinutes(card.setsPerExercise.map((sets, i) => ({ sets, restS: card.restS[i] })));
  const day = s.date === today ? 'Today' : s.date ? longWeekday(s.date) : '';
  const status = s.status === 'planned' && s.date && s.date < today ? 'Missed' : STATUS[s.status ?? 'planned'];
  const done = s.status === 'done';
  return (
    <Animated.View entering={FadeIn.duration(t.motion.duration.base).delay(index * t.motion.listStagger)}>
      <Card
        onPress={() => router.push(done ? `/workout/${s.id}/summary` : `/workout/${s.id}`)}
        accessibilityLabel={`${day}: ${s.title ?? 'Workout'}, ${card.exerciseIds.length} exercises, about ${min} minutes, ${status}`}
        testID={`week-session-${index}`}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
          <View style={{ flex: 1, gap: t.spacing.xxs }}>
            <Text variant="caption" color={s.date === today ? 'accentText' : 'textSecondary'}>
              {day}
            </Text>
            <Text variant="headline">{s.title ?? 'Workout'}</Text>
            <Text variant="callout" color="textSecondary" tabular>
              {card.exerciseIds.length} exercises · {min} min
            </Text>
          </View>
          {done ? (
            <CircleCheck color={t.colors.accentText} size={t.sizes.icon} strokeWidth={t.sizes.iconStroke} />
          ) : (
            <Text variant="caption" color="textSecondary">
              {status}
            </Text>
          )}
        </View>
      </Card>
    </Animated.View>
  );
}

/**
 * Deep link `/train?sessionId=…&start=1` (Today, notifications, widgets): opens the player for
 * that session and starts it (or resumes it). Works offline: the session and catalogue are local.
 */
function useTrainDeepLink() {
  const params = useLocalSearchParams<{ sessionId?: string; start?: string }>();
  const handled = useRef<string | null>(null);
  const link = parseTrainLink(params);
  const key = link ? `${link.sessionId}:${link.start ? 1 : 0}` : null;

  useEffect(() => {
    if (!link || !key) {
      handled.current = null;
      return;
    }
    if (handled.current === key) return;
    handled.current = key;
    const action = resolveTrainLink(link, getSession(link.sessionId), activeSession()?.id);
    router.setParams({ sessionId: undefined, start: undefined });
    if (action.kind === 'missing') {
      showToast({ message: "That workout isn't on this phone any more" });
      return;
    }
    if (action.kind === 'summary') {
      router.push(action.route);
      return;
    }
    const open = () => router.push(action.route);
    if (action.run === 'resume') {
      resumeWorkoutAction(action.sessionId);
      open();
    } else if (action.run === 'start') {
      // The catalogue is bundled; wait for it so cardio sets are pre-created correctly.
      loadCatalog()
        .catch(() => null)
        .then((c) => {
          startWorkoutAction(action.sessionId, c);
          open();
        });
    } else {
      open();
    }
    // `key` captures the link; `link` is re-derived from it each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** S08 Train tab: this week's plan, workout history and routines; tools in the header. */
export function TrainScreen() {
  useTrainDeepLink();
  const t = useTheme();
  const catalog = useCatalog();
  const { unit } = useUnits();
  const { isPro } = usePro();
  const now = useNow(60_000);
  const today = localDate(now);
  const dates = useMemo(() => weekOf(today), [today]);
  const [tab, setTab] = useState<Tab>('week');
  const [selected, setSelected] = useState<string | null>(null);
  const week = useWeekSessions(dates[0] ?? today, dates[6] ?? today);
  const history = useHistory();
  const routines = useRoutines();
  const active = useActiveSession().data;

  const cards = week.data?.cards ?? [];
  const shown = selected ? cards.filter((c) => c.session.date === selected) : cards;
  const counts = weekCounts(cards.map((c) => c.session));
  const todayPlanned = cards.find((c) => c.session.date === today && c.session.status === 'planned');

  const startEmpty = () => {
    const s = createSession({ date: today, title: 'Workout' });
    startWorkoutAction(s.id, catalog);
    router.push(`/workout/${s.id}`);
  };
  const startToday = () => {
    if (!todayPlanned) return startEmpty();
    startWorkoutAction(todayPlanned.session.id, catalog);
    router.push(`/workout/${todayPlanned.session.id}`);
  };
  const newRoutine = () => {
    if (!canAddRoutine(routines.length, isPro)) {
      router.push('/paywall?source=gate:routines');
      return;
    }
    const r = routinesRepo.insert({ name: `Routine ${routines.length + 1}`, items: [] });
    router.push(`/workout/routine/${r.id}`);
  };

  const footer =
    tab === 'week' && !active ? (
      todayPlanned ? (
        <Button label="Start workout" accent onPress={startToday} testID="train-start" />
      ) : (
        <Button label="Start empty workout" onPress={startEmpty} testID="train-start" />
      )
    ) : tab === 'routines' && routines.length > 0 ? (
      <Button label="New routine" icon={Plus} onPress={newRoutine} testID="train-new-routine" />
    ) : undefined;

  return (
    <Screen
      title="Train"
      edges={['top']}
      headerRight={
        <IconButton icon={Calculator} accessibilityLabel="Plate and 1RM tools" onPress={() => router.push('/workout/tools')} testID="train-tools" />
      }
      footer={footer}
      testID="screen-train"
    >
      <ResumeBanner />
      <Segmented options={TABS} value={tab} onChange={setTab} accessibilityLabel="Train view" testID="train-tabs" />

      {tab === 'week' ? (
        week.error ? (
          <EmptyState icon={TriangleAlert} title="Couldn't load your week" body="Your data is safe. Pull down or reopen the tab." testID="train-error" />
        ) : (
          <View style={{ gap: t.spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Text variant="title2" accessibilityRole="header">
                This week
              </Text>
              <Text variant="callout" color="textSecondary" tabular testID="train-week-count">
                {counts.total ? `${counts.done} of ${counts.total} done` : ''}
                {week.data?.blockNo ? ` · Block ${week.data.blockNo}` : ''}
              </Text>
            </View>
            <WeekStrip
              days={weekStates(cards.map((c) => c.session), dates, today)}
              today={today}
              selected={selected}
              onSelect={(d) => setSelected((cur) => (cur === d ? null : d))}
            />
            {shown.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title={selected ? (selected === today ? 'Rest day' : `Nothing on ${shortDate(selected)}`) : 'No sessions this week'}
                body={selected ? 'Recovery is part of the plan.' : 'Start an empty workout or one of your routines.'}
                testID="train-week-empty"
              />
            ) : (
              shown.map((c, i) => <SessionCard key={c.session.id} card={c} today={today} index={i} />)
            )}
          </View>
        )
      ) : null}

      {tab === 'history' ? (
        (history.data ?? []).length === 0 ? (
          <EmptyState icon={History} title="No workouts yet" body="Finished workouts land here with time, volume and PRs." testID="train-history-empty" />
        ) : (
          (history.data ?? []).map((h, i) => (
            <Card
              key={h.session.id}
              onPress={() => router.push(`/workout/${h.session.id}/summary`)}
              accessibilityLabel={`${h.session.title ?? 'Workout'}, ${h.session.date ? shortDate(h.session.date) : ''}, ${formatMinutes(h.durationMs)}, ${h.sets} sets`}
              testID={`history-${i}`}
            >
              <Text variant="caption" color="textSecondary">
                {h.session.date ? shortDate(h.session.date) : ''}
              </Text>
              <Text variant="headline">{h.session.title ?? 'Workout'}</Text>
              <Text variant="callout" color="textSecondary" tabular>
                {formatMinutes(h.durationMs)} · {formatWeight(h.volumeKg, unit) || '0'} {unit} · {h.sets} sets
              </Text>
            </Card>
          ))
        )
      ) : null}

      {tab === 'routines' ? (
        routines.length === 0 ? (
          <EmptyState
            icon={ListPlus}
            title="No routines yet"
            body={isPro ? 'Save the sessions you repeat and start them in one tap.' : 'Save up to 3 sessions you repeat and start them in one tap.'}
            actionLabel="New routine"
            onAction={newRoutine}
            testID="train-routines-empty"
          />
        ) : (
          routines.map((r, i) => {
            const items = parseRoutineItems(r.items);
            return (
              <Card key={r.id} onPress={() => router.push(`/workout/routine/${r.id}`)} accessibilityLabel={`${r.name}, ${items.length} exercises`} testID={`routine-${i}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                  <Dumbbell color={t.colors.textSecondary} size={t.sizes.icon} strokeWidth={t.sizes.iconStroke} />
                  <View style={{ flex: 1 }}>
                    <Text variant="headline">{r.name}</Text>
                    <Text variant="callout" color="textSecondary" tabular>
                      {items.length} exercises · {routineSetCount(items)} sets
                    </Text>
                  </View>
                </View>
              </Card>
            );
          })
        )
      ) : null}
    </Screen>
  );
}

import { router, type Href } from 'expo-router';
import {
  Bell,
  BellOff,
  CalendarCheck,
  Dumbbell,
  Moon,
  Soup,
  Sparkles,
  Sunrise,
  Utensils,
  CreditCard,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { usePro } from '@/features/billing/hooks/usePro';
import { useProfile } from '@/features/settings/repo';
import { haptics } from '@/services/haptics';
import {
  rebuildSchedule,
  refreshPermission,
  requestPermission,
  useNotificationsStore,
} from '@/services/notifications';
import { useTheme } from '@/theme';
import {
  BackButton,
  Button,
  Card,
  EmptyState,
  ListGroup,
  ListRow,
  Screen,
  Skeleton,
  SkeletonGroup,
  Text,
} from '@/ui';

import { ToggleRow } from '../components/ToggleRow';
import { TimeSheet, type TimeSheetTarget } from '../components/TimeSheet';
import { displayTime, prefers12h, relativeDay, shiftHm, WEEKDAYS } from '../logic/clock';
import { MEAL_SLOTS, resolveMealTimes, type NotificationPrefs } from '../logic/prefs';
import { BRIEF_AFTER_WAKE_MIN } from '../logic/schedule';
import { slotLabel } from '../logic/copy';
import { addDays, deviceTimeZone, formatHm, wallClock } from '../logic/zonedTime';
import { useNotificationPrefs } from '../prefsStore';
import { useMotionSafe } from '@/ui/motion';

/** Wall clock that ticks every 30 s, so "Next up" moves on by itself. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function NextUpCard() {
  const t = useTheme();
  const safe = useMotionSafe();
  const scheduled = useNotificationsStore((s) => s.scheduled);
  const h12 = useMemo(() => prefers12h(), []);
  const now = useNow();
  const next = scheduled.find((n) => n.at > now);
  if (!next) return null;
  const tz = deviceTimeZone();
  const today = wallClock(now, tz).date;
  const at = wallClock(next.at, tz);
  const when = `${relativeDay(at.date, today, addDays(today, 1), at.weekday)} · ${displayTime(formatHm(at.minute), h12)}`;
  return (
    <Animated.View
      key={next.key}
      entering={safe(FadeInDown.springify()
        .damping(t.motion.spring.damping)
        .stiffness(t.motion.spring.stiffness))}
    >
      <Card testID="next-up" accessibilityLabel={`Next up, ${when}: ${next.title}. ${next.body}`}>
        <View style={{ gap: t.spacing.xxs }}>
          <Text variant="eyebrow" color="textSecondary" tabular>
            {`Next up · ${when}`}
          </Text>
          <Text variant="headline">{next.title}</Text>
          <Text variant="callout" color="textSecondary" numberOfLines={2}>
            {next.body}
          </Text>
        </View>
      </Card>
    </Animated.View>
  );
}

/**
 * S38 → Notifications: every reminder in sheet 17 with its switch; tapping a reminder's text
 * changes its time (no separate "Times" list), plus meal times and quiet hours.
 */
export function NotificationSettingsScreen() {
  const t = useTheme();
  const safe = useMotionSafe();
  const prefs = useNotificationPrefs((s) => s.prefs);
  const setPref = useNotificationPrefs((s) => s.set);
  const setMealTime = useNotificationPrefs((s) => s.setMealTime);
  const permission = useNotificationsStore((s) => s.permission);
  const status = useNotificationsStore((s) => s.status);
  const pro = usePro();
  const profile = useProfile();
  const h12 = useMemo(() => prefers12h(), []);
  const [sheet, setSheet] = useState<TimeSheetTarget | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    void refreshPermission();
    if (useNotificationsStore.getState().status === 'idle') void rebuildSchedule();
  }, []);

  const mealTimes = resolveMealTimes(prefs, profile?.mealTimes);
  const time = (hm: string) => displayTime(hm, h12);
  const toggle = (key: keyof NotificationPrefs) => (v: boolean) => setPref(key, v as never);
  const proLock = pro.isPro ? undefined : 'Pro';
  const openPaywall = () =>
    router.push({ pathname: '/paywall', params: { source: 'notifications' } } as Href);
  const editTime = (title: string, value: string, onSave: (hm: string) => void) => () => {
    setSheet({ type: 'time', title, value, onSave });
  };
  const briefTime = shiftHm(prefs.wakeTime, BRIEF_AFTER_WAKE_MIN);

  const granted = permission === 'granted';
  const off = !granted;

  const turnOn = async () => {
    setAsking(true);
    const r = await requestPermission();
    setAsking(false);
    if (r === 'granted') haptics.light();
  };

  if (permission === 'unknown') {
    return (
      <Screen title="Notifications" testID="screen-notifications" headerLeft={<Back />}>
        <SkeletonGroup label="Loading notifications" testID="notifications-loading">
          <Skeleton height={t.sizes.ring - t.spacing.xl} radius={t.radius.card} />
          <Skeleton height={t.sizes.row * 3} radius={t.radius.card} />
          <Skeleton height={t.sizes.row * 2} radius={t.radius.card} />
        </SkeletonGroup>
      </Screen>
    );
  }

  const mealsOn = prefs.meals && !proLock;

  return (
    <Screen
      title="Notifications"
      testID="screen-notifications"
      headerLeft={<Back />}
      footer={
        off ? (
          <Button
            label="Turn on notifications"
            onPress={turnOn}
            loading={asking}
            icon={Bell}
            testID="turn-on"
          />
        ) : undefined
      }
    >
      {off ? (
        <Animated.View entering={safe(FadeIn.duration(t.motion.duration.base))}>
          <Card testID="permission-card">
            <View style={{ flexDirection: 'row', gap: t.spacing.sm, alignItems: 'flex-start' }}>
              <BellOff
                color={t.colors.textPrimary}
                size={t.sizes.icon}
                strokeWidth={t.sizes.iconStroke}
              />
              <View style={{ flex: 1, gap: t.spacing.xxs }}>
                <Text variant="headline">Notifications are off</Text>
                <Text variant="callout" color="textSecondary">
                  Turn them on for your morning brief, meal times and workout reminders. Everything
                  stays on your phone.
                </Text>
              </View>
            </View>
          </Card>
        </Animated.View>
      ) : status === 'error' ? (
        <EmptyState
          icon={BellOff}
          title="Reminders could not be scheduled"
          body="Your settings are saved. Try again in a moment."
          actionLabel="Try again"
          onAction={() => void rebuildSchedule()}
          testID="notifications-error"
        />
      ) : (
        <NextUpCard />
      )}

      <ListGroup title="Every day" footnote="Tap a reminder to change its time.">
        <ToggleRow
          icon={Sunrise}
          title="Morning brief"
          subtitle={`${time(briefTime)} · today's workout and lunch`}
          value={prefs.brief}
          onChange={toggle('brief')}
          onPressDetail={editTime('Morning brief', briefTime, (v) =>
            setPref('wakeTime', shiftHm(v, -BRIEF_AFTER_WAKE_MIN)),
          )}
          detailHint="Changes the time"
          detailTestID="time-brief"
          testID="toggle-brief"
        />
        <ToggleRow
          icon={Utensils}
          title="Meal reminders"
          subtitle="Each meal at its time, with dish and kcal"
          value={prefs.meals}
          onChange={toggle('meals')}
          locked={proLock}
          onLockedPress={openPaywall}
          testID="toggle-meals"
        />
        <ToggleRow
          icon={Dumbbell}
          title="Workout reminder"
          subtitle={`${prefs.workoutLeadMin} min before ${time(prefs.workoutTime)}`}
          value={prefs.workout}
          onChange={toggle('workout')}
          onPressDetail={editTime('Training time', prefs.workoutTime, (v) =>
            setPref('workoutTime', v),
          )}
          detailHint="Changes your training time"
          detailTestID="time-workout"
          testID="toggle-workout"
        />
        <ToggleRow
          icon={Soup}
          title="Fuel-up nudge"
          subtitle="Your planned snack 60 min before training"
          value={prefs.fuel}
          onChange={toggle('fuel')}
          locked={proLock}
          onLockedPress={openPaywall}
          testID="toggle-fuel"
        />
        <ToggleRow
          icon={Sparkles}
          title="Tomorrow preview"
          subtitle={`${time(prefs.eveningTime)} · tomorrow's workout and breakfast`}
          value={prefs.evening}
          onChange={toggle('evening')}
          locked={proLock}
          onLockedPress={openPaywall}
          onPressDetail={editTime('Tomorrow preview', prefs.eveningTime, (v) =>
            setPref('eveningTime', v),
          )}
          detailHint="Changes the time"
          detailTestID="time-evening"
          testID="toggle-evening"
        />
      </ListGroup>

      {mealsOn ? (
        <Animated.View entering={safe(FadeInDown.duration(t.motion.duration.base))}>
          <ListGroup title="Meal times">
            {MEAL_SLOTS.map((slot) => (
              <ListRow
                key={slot}
                title={slotLabel(slot)}
                value={time(mealTimes[slot])}
                onPress={editTime(slotLabel(slot), mealTimes[slot], (v) => setMealTime(slot, v))}
                testID={`time-${slot}`}
              />
            ))}
          </ListGroup>
        </Animated.View>
      ) : null}

      <ListGroup title="Every week">
        <ToggleRow
          icon={CalendarCheck}
          title="Weekly check-in"
          subtitle={`${WEEKDAYS[prefs.checkinDay]} · ${time(prefs.checkinTime)}`}
          value={prefs.checkin}
          onChange={toggle('checkin')}
          onPressDetail={() =>
            setSheet({
              type: 'weekdayTime',
              title: 'Weekly check-in',
              value: { day: prefs.checkinDay, time: prefs.checkinTime },
              onSave: ({ day, time: hm }) => {
                setPref('checkinDay', day);
                setPref('checkinTime', hm);
              },
            })
          }
          detailHint="Changes the day and time"
          detailTestID="time-checkin"
          testID="toggle-checkin"
        />
        {pro.paymentsEnabled ? (
          <ToggleRow
            icon={CreditCard}
            title="Trial reminder"
            subtitle="2 days before your free trial ends"
            value={prefs.trial}
            onChange={toggle('trial')}
            testID="toggle-trial"
          />
        ) : null}
      </ListGroup>

      <ListGroup title="Quiet hours" footnote="Reminders that fall in quiet hours stay silent.">
        <ToggleRow
          icon={Moon}
          title="Quiet hours"
          subtitle={
            prefs.quietEnabled
              ? `${time(prefs.quietStart)}–${time(prefs.quietEnd)} · nothing buzzes`
              : 'Off'
          }
          value={prefs.quietEnabled}
          onChange={toggle('quietEnabled')}
          testID="toggle-quiet"
        />
        {prefs.quietEnabled ? (
          <ListRow
            title="From"
            value={time(prefs.quietStart)}
            onPress={editTime('Quiet from', prefs.quietStart, (v) => setPref('quietStart', v))}
            testID="time-quiet-start"
          />
        ) : null}
        {prefs.quietEnabled ? (
          <ListRow
            title="To"
            value={time(prefs.quietEnd)}
            onPress={editTime('Quiet until', prefs.quietEnd, (v) => setPref('quietEnd', v))}
            testID="time-quiet-end"
          />
        ) : null}
      </ListGroup>

      <TimeSheet target={sheet} onClose={() => setSheet(null)} twelveHour={h12} />
    </Screen>
  );
}

function Back() {
  return <BackButton />;
}

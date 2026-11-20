import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Button, Sheet, WheelPicker, type WheelItem } from '@/ui';

import { from12h, joinHm, MINUTE_STEP, prefers12h, splitHm, to12h, WEEKDAYS } from '../logic/clock';

export type TimeSheetTarget =
  | { type: 'time'; title: string; value: string; onSave: (hm: string) => void }
  | { type: 'weekday'; title: string; value: number; onSave: (day: number) => void }
  | {
      type: 'weekdayTime';
      title: string;
      value: { day: number; time: string };
      onSave: (v: { day: number; time: string }) => void;
    };

const pad = (n: number) => String(n).padStart(2, '0');
const HOURS_24: WheelItem<number>[] = Array.from({ length: 24 }, (_, h) => ({
  value: h,
  label: pad(h),
}));
/** 12, 1, 2 … 11, like the system clock wheel (12 sits before 1). */
const HOURS_12: WheelItem<number>[] = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => ({
  value: h,
  label: String(h),
}));
const MERIDIEM: WheelItem<number>[] = [
  { value: 0, label: 'AM' },
  { value: 1, label: 'PM' },
];
const MINUTES: WheelItem<number>[] = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => ({
  value: i * MINUTE_STEP,
  label: pad(i * MINUTE_STEP),
}));
const DAYS: WheelItem<number>[] = WEEKDAYS.map((label, value) => ({
  value,
  label: label.slice(0, 3),
}));

function initialTime(target: TimeSheetTarget): string {
  if (target.type === 'time') return target.value;
  if (target.type === 'weekdayTime') return target.value.time;
  return '00:00';
}

function initialDay(target: TimeSheetTarget): number {
  if (target.type === 'weekday') return target.value;
  if (target.type === 'weekdayTime') return target.value.day;
  return 0;
}

function Body({
  target,
  onClose,
  h12,
}: {
  target: TimeSheetTarget;
  onClose: () => void;
  h12: boolean;
}) {
  const t = useTheme();
  const start = splitHm(initialTime(target));
  const [hour, setHour] = useState(start.hour);
  const [minute, setMinute] = useState(start.minute);
  const [day, setDay] = useState(initialDay(target));
  const parts = to12h(hour);

  const save = () => {
    if (target.type === 'time') target.onSave(joinHm(hour, minute));
    else if (target.type === 'weekday') target.onSave(day);
    else target.onSave({ day, time: joinHm(hour, minute) });
    onClose();
  };

  const showDay = target.type !== 'time';
  const showTime = target.type !== 'weekday';

  return (
    <View style={{ gap: t.spacing.lg, paddingBottom: t.spacing.md }}>
      <View style={{ flexDirection: 'row', gap: t.spacing.xs }}>
        {showDay ? (
          <View style={{ flex: target.type === 'weekday' ? 1 : 1.2 }}>
            <WheelPicker
              items={DAYS}
              value={day}
              onChange={setDay}
              accessibilityLabel="Day"
              testID="pick-day"
            />
          </View>
        ) : null}
        {showTime ? (
          <>
            <View style={{ flex: 1 }}>
              {h12 ? (
                <WheelPicker
                  items={HOURS_12}
                  value={parts.hour12}
                  onChange={(v) => setHour(from12h(v, to12h(hour).pm))}
                  accessibilityLabel="Hour"
                  testID="pick-hour"
                />
              ) : (
                <WheelPicker
                  items={HOURS_24}
                  value={hour}
                  onChange={setHour}
                  accessibilityLabel="Hour"
                  testID="pick-hour"
                />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <WheelPicker
                items={MINUTES}
                value={minute}
                onChange={setMinute}
                accessibilityLabel="Minute"
                testID="pick-minute"
              />
            </View>
            {h12 ? (
              <View style={{ flex: 1 }}>
                <WheelPicker
                  items={MERIDIEM}
                  value={parts.pm ? 1 : 0}
                  onChange={(v) => setHour(from12h(to12h(hour).hour12, v === 1))}
                  accessibilityLabel="AM or PM"
                  testID="pick-meridiem"
                />
              </View>
            ) : null}
          </>
        ) : null}
      </View>
      <Button label="Save" onPress={save} testID="time-save" />
    </View>
  );
}

/**
 * Bottom sheet with wheel pickers for a time, a weekday, or both. 12-hour devices get an hour
 * wheel of 1–12 plus an AM/PM wheel (US users never pick "13"); 24-hour devices get 00–23.
 */
export function TimeSheet({
  target,
  onClose,
  twelveHour,
}: {
  target: TimeSheetTarget | null;
  onClose: () => void;
  /** Override the device setting (tests, onboarding's own device context). */
  twelveHour?: boolean;
}) {
  const device = useMemo(() => prefers12h(), []);
  const h12 = twelveHour ?? device;
  return (
    <Sheet open={Boolean(target)} onClose={onClose} title={target?.title} testID="time-sheet">
      {target ? (
        <Body
          key={`${target.title}:${JSON.stringify(target.value)}:${h12}`}
          target={target}
          onClose={onClose}
          h12={h12}
        />
      ) : null}
    </Sheet>
  );
}

import { useState } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Button, Sheet, WheelPicker, type WheelItem } from '@/ui';

import { joinHm, MINUTE_STEP, splitHm, WEEKDAYS } from '../logic/clock';

export type TimeSheetTarget =
  | { type: 'time'; title: string; value: string; onSave: (hm: string) => void }
  | { type: 'weekday'; title: string; value: number; onSave: (day: number) => void };

const pad = (n: number) => String(n).padStart(2, '0');
const HOURS: WheelItem<number>[] = Array.from({ length: 24 }, (_, h) => ({ value: h, label: pad(h) }));
const MINUTES: WheelItem<number>[] = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => ({
  value: i * MINUTE_STEP,
  label: pad(i * MINUTE_STEP),
}));
const DAYS: WheelItem<number>[] = WEEKDAYS.map((label, value) => ({ value, label }));

function Body({ target, onClose }: { target: TimeSheetTarget; onClose: () => void }) {
  const t = useTheme();
  const initial = target.type === 'time' ? splitHm(target.value) : { hour: 0, minute: 0 };
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);
  const [day, setDay] = useState(target.type === 'weekday' ? target.value : 0);

  const save = () => {
    if (target.type === 'time') target.onSave(joinHm(hour, minute));
    else target.onSave(day);
    onClose();
  };

  return (
    <View style={{ gap: t.spacing.lg, paddingBottom: t.spacing.md }}>
      {target.type === 'weekday' ? (
        <WheelPicker items={DAYS} value={day} onChange={setDay} accessibilityLabel="Day" testID="pick-day" />
      ) : (
        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <View style={{ flex: 1 }}>
            <WheelPicker items={HOURS} value={hour} onChange={setHour} accessibilityLabel="Hour" testID="pick-hour" />
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
        </View>
      )}
      <Button label="Save" onPress={save} testID="time-save" />
    </View>
  );
}

/** Bottom sheet with wheel pickers for a time (hour + minute) or a weekday. */
export function TimeSheet({ target, onClose }: { target: TimeSheetTarget | null; onClose: () => void }) {
  return (
    <Sheet open={Boolean(target)} onClose={onClose} title={target?.title} testID="time-sheet">
      {target ? <Body key={`${target.title}:${String(target.value)}`} target={target} onClose={onClose} /> : null}
    </Sheet>
  );
}

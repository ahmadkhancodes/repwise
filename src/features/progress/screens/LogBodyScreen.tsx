import { router, useLocalSearchParams } from 'expo-router';
import { X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Button, IconButton, Screen, Segmented, Text, TextField, showToast } from '@/ui';
import { useTheme } from '@/theme';

import { useToday, useUnits } from '../hooks/useProgress';
import { MEASURES, type MeasureKey } from '../logic/body';
import { buildBodyPatch, type BodyErrors as Errors } from '../logic/bodyEntry';
import { addDays } from '../logic/engine';
import { lengthUnit, weightUnit } from '../logic/units';
import { saveBodyMetric } from '../repo';

type Day = 'today' | 'yesterday';
/** S30 add: weigh-in + optional measurements. Two taps from Progress (Log weight → Save). */
export function LogBodyScreen() {
  const t = useTheme();
  const units = useUnits();
  const today = useToday();
  const params = useLocalSearchParams<{ focus?: string }>();
  const [day, setDay] = useState<Day>('today');
  const [values, setValues] = useState<Partial<Record<'weight' | MeasureKey, string>>>({});
  const [showMeasures, setShowMeasures] = useState(params.focus === 'measurements');
  const [errors, setErrors] = useState<Errors>({});
  const wu = weightUnit(units);
  const lu = lengthUnit(units);
  const date = useMemo(() => (day === 'today' ? today : addDays(today, -1)), [day, today]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/progress'));
  const set = (k: 'weight' | MeasureKey) => (v: string) => {
    setValues((s) => ({ ...s, [k]: v }));
    if (errors[k] || errors.form) setErrors((e) => ({ ...e, [k]: undefined, form: undefined }));
  };

  const save = () => {
    const { patch, errors: errs } = buildBodyPatch(values, units);
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    saveBodyMetric(date, patch);
    // Core action: the success toast is the one success buzz (no manual haptic, audit U2).
    showToast({
      message: patch.weightKg != null ? 'Weight saved' : 'Measurements saved',
      tone: 'success',
    });
    close();
  };

  return (
    <>
      <Screen
        keyboard
        title="Log body"
        testID="screen-progress-log"
        headerLeft={
          <IconButton icon={X} accessibilityLabel="Close" onPress={close} testID="log-close" />
        }
        footer={<Button label="Save" onPress={save} testID="log-save" />}
      >
        <Segmented
          testID="log-day"
          accessibilityLabel="Day"
          options={[
            { value: 'today', label: 'Today' },
            { value: 'yesterday', label: 'Yesterday' },
          ]}
          value={day}
          onChange={setDay}
        />
        <TextField
          label={`Weight (${wu})`}
          testID="log-weight"
          keyboardType="decimal-pad"
          inputMode="decimal"
          returnKeyType="done"
          autoFocus={!showMeasures}
          placeholder={units === 'imperial' ? '181.6' : '82.4'}
          value={values.weight ?? ''}
          onChangeText={set('weight')}
          onSubmitEditing={save}
          error={errors.weight}
          hint="Same time each day gives the steadiest trend."
        />
        {showMeasures ? (
          <View style={{ gap: t.spacing.md }} testID="log-measures">
            {MEASURES.map((m) => (
              <TextField
                key={m.key}
                label={`${m.label} (${m.kind === 'percent' ? '%' : lu})`}
                testID={`log-${m.key}`}
                keyboardType="decimal-pad"
                inputMode="decimal"
                value={values[m.key] ?? ''}
                onChangeText={set(m.key)}
                error={errors[m.key]}
              />
            ))}
          </View>
        ) : (
          <Button
            label="Add measurements"
            variant="tertiary"
            onPress={() => setShowMeasures(true)}
            testID="log-show-measures"
          />
        )}
        {errors.form ? (
          <Text variant="callout" color="danger" accessibilityRole="alert" testID="log-form-error">
            {errors.form}
          </Text>
        ) : null}
      </Screen>
    </>
  );
}

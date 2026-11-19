import { router } from 'expo-router';
import { Bell, ChevronLeft, Dumbbell, Inbox, Play, Trash2, X } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { sizes, spacing, ThemeScope, useTheme, type ColorScheme } from '@/theme';

import { BigNumber } from '../BigNumber';
import { Button } from '../Button';
import { Card } from '../Card';
import { Chip } from '../Chip';
import { EmptyState } from '../EmptyState';
import { IconButton } from '../IconButton';
import { ListRow } from '../ListRow';
import { ProgressRing } from '../ProgressRing';
import { Screen } from '../Screen';
import { Segmented } from '../Segmented';
import { Sheet } from '../Sheet';
import { Stepper } from '../Stepper';
import { Text } from '../Text';
import { showToast, Toast } from '../Toast';
import { WheelPicker } from '../WheelPicker';

type Mode = 'both' | ColorScheme;
const MODES = [
  { value: 'both', label: 'Both' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

/** Small rings for the gallery grid. */
const RING = Math.round(sizes.ring * 0.6);

const REPS = Array.from({ length: 30 }, (_, i) => ({ value: i + 1, label: String(i + 1) }));
const VIEWS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
] as const;

/** A themed block: everything inside renders in `scheme`, on that scheme's background. */
function SchemeBlock({ scheme, children }: { scheme: ColorScheme; children: ReactNode }) {
  return (
    <ThemeScope scheme={scheme}>
      <Block>{children}</Block>
    </ThemeScope>
  );
}

function Block({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={{
        backgroundColor: t.colors.bg,
        borderRadius: t.radius.card,
        borderWidth: t.sizes.hairline,
        borderColor: t.colors.border,
        padding: t.spacing.md,
        gap: t.spacing.sm,
      }}
    >
      <Text variant="caption" color="textTertiary">
        {t.scheme.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function Section({
  title,
  schemes,
  children,
}: {
  title: string;
  schemes: ColorScheme[];
  children: () => ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.xs }}>
      <Text variant="title2">{title}</Text>
      {schemes.map((s) => (
        <SchemeBlock key={s} scheme={s}>
          {children()}
        </SchemeBlock>
      ))}
    </View>
  );
}

/** /dev/ui — every src/ui component in every state, in light and dark. */
export function UiGallery() {
  const [mode, setMode] = useState<Mode>('both');
  const [chips, setChips] = useState<Record<string, boolean>>({ Barbell: true });
  const [view, setView] = useState<'day' | 'week'>('day');
  const [weight, setWeight] = useState(60);
  const [reps, setReps] = useState(8);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState(true);
  const [volume, setVolume] = useState(12450);
  const schemes: ColorScheme[] = mode === 'both' ? ['light', 'dark'] : [mode];

  return (
    <Screen
      title="Design system"
      testID="screen-dev-ui"
      headerLeft={
        <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={() => router.back()} />
      }
    >
      <Segmented
        options={MODES}
        value={mode}
        onChange={setMode}
        accessibilityLabel="Preview theme"
      />

      <Section title="Text" schemes={schemes}>
        {() => (
          <>
            <Text variant="display" tabular>
              12,450
            </Text>
            <Text variant="title1">Title 1</Text>
            <Text variant="title2">Title 2</Text>
            <Text variant="headline">Headline</Text>
            <Text variant="body">Body — the quick brown fox lifts the bar.</Text>
            <Text variant="callout" color="textSecondary">
              Callout secondary
            </Text>
            <Text variant="caption" color="textTertiary">
              Caption tertiary
            </Text>
            <Text variant="callout" color="accentText">
              Accent text (PR)
            </Text>
          </>
        )}
      </Section>

      <Section title="Button" schemes={schemes}>
        {() => (
          <>
            <Button label="Primary" />
            <Button label="Start workout" accent icon={Play} />
            <Button label="Secondary" variant="secondary" />
            <Button label="Tertiary" variant="tertiary" />
            <Button label="Delete workout" variant="destructive" icon={Trash2} />
            <Button label="Disabled" disabled />
            <Button label="Loading" loading />
            <View style={{ flexDirection: 'row' }}>
              <IconButton icon={X} accessibilityLabel="Close" />
              <IconButton icon={Bell} accessibilityLabel="Reminders" />
              <IconButton icon={Bell} accessibilityLabel="Reminders (disabled)" disabled />
            </View>
          </>
        )}
      </Section>

      <Section title="Card" schemes={schemes}>
        {() => (
          <>
            <Card>
              <Text variant="headline">Static card</Text>
              <Text variant="callout" color="textSecondary">
                Upper body · 45 min
              </Text>
            </Card>
            <Card
              onPress={() => setSelectedCard((v) => !v)}
              selected={selectedCard}
              accessibilityLabel="Selectable card"
            >
              <Text variant="headline">{selectedCard ? 'Selected card' : 'Pressable card'}</Text>
            </Card>
          </>
        )}
      </Section>

      <Section title="BigNumber + ProgressRing" schemes={schemes}>
        {() => (
          <>
            <BigNumber value={volume} unit="kg" label="Volume" />
            <BigNumber value={72.4} decimals={1} unit="kg" label="Body weight" animate={false} />
            <Button
              label="Add 1,000 kg"
              variant="secondary"
              onPress={() => setVolume((v) => v + 1000)}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              <ProgressRing progress={0} accessibilityLabel="Empty ring" size={RING} />
              <ProgressRing progress={0.62} accessibilityLabel="Calories" size={RING} />
              <ProgressRing progress={1} accessibilityLabel="Full ring" size={RING} />
              <ProgressRing
                progress={0.4}
                color="macroProtein"
                accessibilityLabel="Protein"
                size={RING}
              />
              <ProgressRing
                progress={0.7}
                color="macroCarb"
                accessibilityLabel="Carbs"
                size={RING}
              />
              <ProgressRing progress={0.5} color="macroFat" accessibilityLabel="Fat" size={RING} />
            </View>
          </>
        )}
      </Section>

      <Section title="ListRow" schemes={schemes}>
        {() => (
          <View>
            <ListRow
              icon={Bell}
              title="Reminders"
              subtitle="Meals and workouts"
              value="On"
              onPress={() => undefined}
              divider
            />
            <ListRow title="Version" value="1.0.0" divider />
            <ListRow
              icon={Trash2}
              title="Delete account"
              destructive
              onPress={() => undefined}
              divider
            />
            <ListRow title="Sync now" disabled onPress={() => undefined} />
          </View>
        )}
      </Section>

      <Section title="Chip + Segmented" schemes={schemes}>
        {() => (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {['Barbell', 'Dumbbells', 'Cables'].map((c) => (
                <Chip
                  key={c}
                  label={c}
                  selected={Boolean(chips[c])}
                  onPress={() => setChips((s) => ({ ...s, [c]: !s[c] }))}
                />
              ))}
              <Chip label="Machines" disabled />
            </View>
            <Segmented options={VIEWS} value={view} onChange={setView} accessibilityLabel="View" />
          </>
        )}
      </Section>

      <Section title="Stepper + WheelPicker" schemes={schemes}>
        {() => (
          <>
            <Stepper
              label="Weight"
              value={weight}
              step={2.5}
              unit="kg"
              min={0}
              max={500}
              onChange={setWeight}
              format={(v) => v.toFixed(1)}
            />
            <Stepper label="Sets" value={1} min={1} max={10} onChange={() => undefined} />
            <WheelPicker items={REPS} value={reps} onChange={setReps} accessibilityLabel="Reps" />
          </>
        )}
      </Section>

      <Section title="Toast" schemes={schemes}>
        {() => (
          <>
            <Toast message="Plan updated" />
            <Toast message="Workout saved" tone="success" />
            <Toast message="Couldn't back up. We'll retry." tone="danger" />
            <Toast message="Set deleted" actionLabel="Undo" onAction={() => undefined} />
            <Button
              label="Show live toast"
              variant="secondary"
              onPress={() => showToast({ message: 'Workout saved', tone: 'success' })}
            />
          </>
        )}
      </Section>

      <Section title="EmptyState" schemes={schemes}>
        {() => (
          <>
            <EmptyState icon={Inbox} title="No workouts yet" body="Your history shows up here." />
            <EmptyState
              icon={Dumbbell}
              title="No results"
              body="Try fewer filters."
              actionLabel="Clear filters"
              onAction={() => undefined}
            />
          </>
        )}
      </Section>

      <Section title="Sheet" schemes={schemes}>
        {() => (
          <Button
            label="Open sheet (app theme)"
            variant="secondary"
            onPress={() => setSheetOpen(true)}
          />
        )}
      </Section>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Swap exercise">
        <ListRow
          title="Dumbbell bench press"
          subtitle="Same muscles · dumbbells"
          onPress={() => setSheetOpen(false)}
          divider
        />
        <ListRow title="Push-up" subtitle="Bodyweight" onPress={() => setSheetOpen(false)} />
      </Sheet>
    </Screen>
  );
}

import { Lock } from 'lucide-react-native';
import { View } from 'react-native';

import { Segmented, Text } from '@/ui';
import { useTheme } from '@/theme';

import { RANGES, type Range } from '../logic/body';

/** Small stat: caption over a tabular value. */
export function Stat({ label, value, testID }: { label: string; value: string; testID?: string }) {
  const t = useTheme();
  return (
    <View
      style={{ flex: 1, gap: t.spacing.xxs }}
      accessible
      accessibilityLabel={`${label}, ${value}`}
      testID={testID}
    >
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
      <Text variant="headline" tabular numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

const RANGE_LABEL: Record<Range, string> = {
  '1M': '1M',
  '3M': '3M',
  '6M': '6M',
  '1Y': '1Y',
  ALL: 'All',
};

/** Time range picker. Free users get 1M; longer ranges route to the paywall (RW-50). */
export function RangePicker({
  value,
  onChange,
  isPro,
  onLocked,
  testID = 'range-picker',
}: {
  value: Range;
  onChange: (r: Range) => void;
  isPro: boolean;
  onLocked: () => void;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.xxs }}>
      <Segmented
        testID={testID}
        accessibilityLabel="Time range"
        options={RANGES.map((r) => ({ value: r, label: RANGE_LABEL[r] }))}
        value={value}
        onChange={(r) => (isPro || r === '1M' ? onChange(r) : onLocked())}
      />
      {!isPro ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xxs }}>
          <Lock
            size={t.sizes.iconSmall}
            color={t.colors.textTertiary}
            strokeWidth={t.sizes.iconStroke}
          />
          <Text variant="caption" color="textTertiary">
            Longer history with Pro
          </Text>
        </View>
      ) : null}
    </View>
  );
}

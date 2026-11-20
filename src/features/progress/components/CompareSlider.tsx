import { MoveHorizontal } from 'lucide-react-native';
import { useState, type ComponentRef, type Ref } from 'react';
import { Image, View, type GestureResponderEvent } from 'react-native';

import { Badge, Text } from '@/ui';
import { useTheme } from '@/theme';

import { daysApart } from '../logic/photos';
import { shortDate } from '../logic/dates';

export type ComparePhoto = { id: string; date: string; uri: string };

const clamp = (v: number) => Math.min(0.98, Math.max(0.02, v));

/**
 * Side-by-side compare (S33): the newer photo sits on top and is revealed by dragging the
 * divider. Works with a finger, and with VoiceOver/TalkBack as an adjustable control.
 */
export type ViewRef = ComponentRef<typeof View>;

export function CompareSlider({
  before,
  after,
  viewRef,
  testID = 'compare-slider',
}: {
  before: ComparePhoto;
  after: ComparePhoto;
  /** The snapshot target for "Share comparison". */
  viewRef?: Ref<ViewRef>;
  testID?: string;
}) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const [split, setSplit] = useState(0.5);
  const height = Math.round(width * (4 / 3));
  const move = (e: GestureResponderEvent) => {
    if (width > 0) setSplit(clamp(e.nativeEvent.locationX / width));
  };
  const pct = Math.round(split * 100);
  return (
    <View style={{ gap: t.spacing.xs }}>
      <View
        ref={viewRef}
        collapsable={false}
        testID={testID}
        onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={move}
        onResponderMove={move}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`Compare ${shortDate(before.date)} and ${shortDate(after.date)}`}
        accessibilityValue={{ text: `${pct}% of the newer photo shown` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) =>
          setSplit((s) => clamp(s + (e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1)))
        }
        style={{
          width: '100%',
          height: height || undefined,
          aspectRatio: height ? undefined : 3 / 4,
          borderRadius: t.radius.card,
          overflow: 'hidden',
          backgroundColor: t.colors.surface,
        }}
      >
        {width > 0 ? (
          <>
            <Image
              source={{ uri: before.uri }}
              style={{ position: 'absolute', width, height }}
              resizeMode="cover"
              pointerEvents="none"
            />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: split * width,
                overflow: 'hidden',
              }}
            >
              <Image source={{ uri: after.uri }} style={{ width, height }} resizeMode="cover" />
            </View>
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: split * width - t.sizes.borderThick / 2,
                width: t.sizes.borderThick,
                backgroundColor: t.colors.bg,
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: height / 2 - t.sizes.touch / 2,
                left: split * width - t.sizes.touch / 2,
                width: t.sizes.touch,
                height: t.sizes.touch,
                borderRadius: t.radius.pill,
                backgroundColor: t.colors.bg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MoveHorizontal
                size={t.sizes.iconMedium}
                color={t.colors.textPrimary}
                strokeWidth={t.sizes.iconStroke}
              />
            </View>
            <Tag text={`Now · ${shortDate(after.date)}`} side="left" />
            <Tag text={`Then · ${shortDate(before.date)}`} side="right" />
          </>
        ) : null}
      </View>
      <Text variant="caption" color="textSecondary" align="center" testID="compare-days">
        {`${daysApart(before.date, after.date)} days apart`}
      </Text>
    </View>
  );
}

/** Over a photo, the inverse badge reads best (DS: CompareSlider Tag → Badge inverse). */
function Tag({ text, side }: { text: string; side: 'left' | 'right' }) {
  const t = useTheme();
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', bottom: t.spacing.sm, [side]: t.spacing.sm }}
    >
      <Badge label={text} tone="inverse" />
    </View>
  );
}

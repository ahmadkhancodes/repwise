import { Image } from 'expo-image';
import { Dumbbell } from 'lucide-react-native';
import { useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';
import { Text } from '@/ui';

import { exerciseMediaUrls } from '../logic/media';

type Props = { mediaId: string | null; name: string; testID?: string };

/** Calm offline placeholder: icon tile on the surface colour (media are not uploaded yet). */
function Placeholder({
  size,
  caption,
  style,
  testID,
  label,
}: {
  size: number;
  caption?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** Spoken label; without one the tile is decorative and hidden from screen readers. */
  label?: string;
}) {
  const t = useTheme();
  const a11y = label
    ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label }
    : {
        importantForAccessibility: 'no-hide-descendants' as const,
        accessibilityElementsHidden: true,
      };
  return (
    <View
      testID={testID}
      {...a11y}
      style={[
        { alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.surface },
        style,
      ]}
    >
      <Dumbbell color={t.colors.textTertiary} size={size} strokeWidth={t.sizes.iconStroke} />
      {caption ? (
        <Text variant="caption" color="textSecondary" style={{ marginTop: t.spacing.xs }}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

/** 56 px list thumbnail: the ≤ 15 KB first-frame poster only, never the loop. */
export function ExerciseThumb({ mediaId, name, testID }: Props) {
  const t = useTheme();
  const urls = exerciseMediaUrls(mediaId);
  const [failed, setFailed] = useState(false);
  const box: ViewStyle = {
    width: t.sizes.row,
    height: t.sizes.row,
    borderRadius: t.radius.button,
    overflow: 'hidden',
  };
  if (!urls || failed) {
    return <Placeholder size={t.sizes.icon} style={box} testID={testID} />;
  }
  return (
    <View style={[box, { backgroundColor: t.colors.surface }]} testID={testID}>
      <Image
        source={urls.thumb}
        recyclingKey={mediaId ?? undefined}
        cachePolicy="memory-disk"
        contentFit="cover"
        transition={t.motion.duration.fast}
        accessibilityLabel={`${name} demo`}
        onError={() => setFailed(true)}
        style={{ width: '100%', height: '100%' }}
      />
    </View>
  );
}

/**
 * Detail hero (S19): the poster paints first (placeholder), the animated loop replaces it when
 * ready. Without media (or offline with an empty cache) a placeholder keeps the layout stable.
 */
export function ExerciseHero({ mediaId, name, testID }: Props) {
  const t = useTheme();
  const urls = exerciseMediaUrls(mediaId);
  const [failed, setFailed] = useState(false);
  const box: ViewStyle = {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: t.radius.card,
    overflow: 'hidden',
    backgroundColor: t.colors.surface,
  };
  if (!urls || failed) {
    return (
      <Placeholder
        size={t.sizes.touch}
        caption="Demo coming soon"
        label={`${name}: demo coming soon`}
        style={box}
        testID={testID ? `${testID}-placeholder` : undefined}
      />
    );
  }
  return (
    <View style={box} testID={testID}>
      <Image
        source={urls.loop}
        placeholder={{ uri: urls.poster }}
        placeholderContentFit="contain"
        cachePolicy="memory-disk"
        contentFit="contain"
        transition={t.motion.duration.fast}
        autoplay
        accessibilityLabel={`${name} demonstration`}
        onError={() => setFailed(true)}
        style={{ width: '100%', height: '100%' }}
      />
    </View>
  );
}

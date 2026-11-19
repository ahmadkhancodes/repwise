import { ScrollView, View } from 'react-native';

import { useTheme } from '@/theme';
import { PressableScale, Text } from '@/ui';

import { itemSubtitle, type LibraryItem } from '../logic/libraryItem';

import { ExerciseThumb } from './ExerciseMedia';

/** Horizontal rail of compact exercise cards (Favourites, Recently used). */
export function Shelf({
  title,
  items,
  onPress,
  testID,
}: {
  title: string;
  items: LibraryItem[];
  onPress: (item: LibraryItem) => void;
  testID?: string;
}) {
  const t = useTheme();
  const cardW = t.sizes.ring + t.spacing.xxxl;
  return (
    <View style={{ gap: t.spacing.sm }} testID={testID}>
      <Text variant="title2" accessibilityRole="header">
        {title}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -t.spacing.screen }}
        contentContainerStyle={{ paddingHorizontal: t.spacing.screen, gap: t.spacing.sm }}
      >
        {items.map((item) => (
          <PressableScale
            key={item.id}
            testID={`${testID ?? 'shelf'}-${item.id}`}
            onPress={() => onPress(item)}
            accessibilityRole="button"
            accessibilityLabel={item.name}
            style={{
              width: cardW,
              padding: t.spacing.sm,
              gap: t.spacing.xs,
              borderRadius: t.radius.card,
              backgroundColor: t.colors.surface,
            }}
          >
            <ExerciseThumb mediaId={item.mediaId} name={item.name} />
            <Text variant="callout" numberOfLines={2}>
              {item.name}
            </Text>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {itemSubtitle(item)}
            </Text>
          </PressableScale>
        ))}
      </ScrollView>
    </View>
  );
}

import { Heart } from 'lucide-react-native';
import { memo } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { PressableScale, Text } from '@/ui';

import { itemSubtitle, type LibraryItem } from '../logic/libraryItem';
import { useIsFavourite, useLibraryPrefs } from '../prefs';

import { ExerciseThumb } from './ExerciseMedia';

type Props = {
  item: LibraryItem;
  onPress: (item: LibraryItem) => void;
  /** Show the heart toggle (default true). */
  favouriteToggle?: boolean;
};

/** Library row: poster thumb, name, "Muscle · Equipment", heart toggle (48 dp). */
export const ExerciseRow = memo(function ExerciseRow({
  item,
  onPress,
  favouriteToggle = true,
}: Props) {
  const t = useTheme();
  const fav = useIsFavourite(item.id);
  const toggle = useLibraryPrefs((s) => s.toggleFavourite);
  const subtitle = itemSubtitle(item);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <PressableScale
        testID={`exercise-row-${item.id}`}
        onPress={() => onPress(item)}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}${item.custom ? ', your exercise' : ''}${subtitle ? `, ${subtitle}` : ''}`}
        style={{
          flex: 1,
          minHeight: t.sizes.row + t.spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
          paddingVertical: t.spacing.xs,
          borderRadius: t.radius.button,
        }}
      >
        <ExerciseThumb mediaId={item.mediaId} name={item.name} />
        <View style={{ flex: 1, gap: t.spacing.xxs }}>
          <Text
            variant="body"
            numberOfLines={2}
            style={{ fontFamily: t.typography.headline.fontFamily }}
          >
            {item.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}>
            {item.custom ? (
              <View
                style={{
                  paddingHorizontal: t.spacing.xs,
                  borderRadius: t.radius.pill,
                  backgroundColor: t.colors.accentSoft,
                }}
              >
                <Text variant="caption" color="accentText">
                  Yours
                </Text>
              </View>
            ) : null}
            {subtitle ? (
              <Text
                variant="callout"
                color="textSecondary"
                numberOfLines={1}
                style={{ flexShrink: 1 }}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
      </PressableScale>
      {favouriteToggle ? (
        <PressableScale
          testID={`favourite-${item.id}`}
          feedback="selection"
          onPress={() => toggle(item.id)}
          accessibilityRole="button"
          accessibilityLabel={
            fav ? `Remove ${item.name} from favourites` : `Add ${item.name} to favourites`
          }
          accessibilityState={{ selected: fav }}
          style={{
            width: t.sizes.touch,
            height: t.sizes.touch,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: t.radius.pill,
          }}
        >
          <Heart
            color={fav ? t.colors.accent : t.colors.textTertiary}
            fill={fav ? t.colors.accent : 'transparent'}
            size={t.sizes.icon}
            strokeWidth={t.sizes.iconStroke}
          />
        </PressableScale>
      ) : null}
    </View>
  );
});

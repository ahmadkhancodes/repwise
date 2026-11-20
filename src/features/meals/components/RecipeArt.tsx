import { Image } from 'expo-image';
import {
  Apple,
  Bean,
  Beef,
  CookingPot,
  Croissant,
  CupSoda,
  Drumstick,
  Egg,
  Fish,
  Milk,
  Nut,
  Salad,
  Sandwich,
  Shrimp,
  Soup,
  Sprout,
  UtensilsCrossed,
  Wheat,
  type LucideIcon,
} from 'lucide-react-native';
import { memo, useId, useState, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { cloudName } from '@/features/library/logic/media';
import { useTheme } from '@/theme';

import { artPalette, recipeImageUrl, type ArtGlyph, type RecipeArt as Art } from '../logic/art';

export const GLYPH_ICON: Record<ArtGlyph, LucideIcon> = {
  drumstick: Drumstick,
  beef: Beef,
  fish: Fish,
  shrimp: Shrimp,
  egg: Egg,
  milk: Milk,
  bean: Bean,
  sprout: Sprout,
  nut: Nut,
  wheat: Wheat,
  croissant: Croissant,
  salad: Salad,
  soup: Soup,
  pot: CookingPot,
  sandwich: Sandwich,
  shake: CupSoda,
  apple: Apple,
  plate: UtensilsCrossed,
};

export type RecipeArtSize = 'thumb' | 'hero';

type Props = {
  art: Art;
  /** 'thumb' = 56dp square (lists, swap options); 'hero' = full-width 16:10 (recipe detail). */
  size?: RecipeArtSize;
  /** Spoken label; without one the art is decorative (the row already names the dish). */
  accessibilityLabel?: string;
  /** Overlay content for the hero (badges). */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Designed recipe art (never a broken image): a soft token-tinted gradient, a large food glyph
 * and an oversized faint echo of it in the corner. When the recipe has a photo (`mediaId` and a
 * Cloudinary cloud name), the photo loads on top and the art stays as its placeholder.
 */
export const RecipeArt = memo(function RecipeArt({
  art,
  size = 'thumb',
  accessibilityLabel,
  children,
  style,
  testID,
}: Props) {
  const t = useTheme();
  const gradientId = `art${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [failed, setFailed] = useState(false);
  const pal = artPalette(art.tint, t.colors, t.scheme);
  const Icon = GLYPH_ICON[art.glyph];
  const hero = size === 'hero';
  const glyph = hero ? t.spacing.huge + t.spacing.md : t.sizes.icon + t.spacing.xs;
  const echo = hero ? t.sizes.ring + t.spacing.xxxl : t.sizes.row;
  const uri = failed ? null : recipeImageUrl(art.mediaId, size, cloudName());
  const a11y = accessibilityLabel
    ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel }
    : {
        importantForAccessibility: 'no-hide-descendants' as const,
        accessibilityElementsHidden: true,
      };

  const box: ViewStyle = hero
    ? { width: '100%', aspectRatio: 16 / 10, borderRadius: t.radius.card }
    : { width: t.sizes.row, height: t.sizes.row, borderRadius: t.radius.button };

  return (
    <View
      testID={testID}
      {...a11y}
      style={[box, { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, style]}
    >
      <Svg width="100%" height="100%" style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={pal.from} />
            <Stop offset="1" stopColor={pal.to} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>
      <View
        style={{
          position: 'absolute',
          right: -echo / 4,
          bottom: -echo / 4,
          opacity: 0.12,
          transform: [{ rotate: '-18deg' }],
        }}
      >
        <Icon color={pal.glyph} size={echo} strokeWidth={t.sizes.iconStroke} />
      </View>
      <View testID={testID ? `${testID}-glyph-${art.glyph}` : undefined}>
        <Icon color={pal.glyph} size={glyph} strokeWidth={t.sizes.iconStroke} />
      </View>
      {uri ? (
        <Image
          testID={testID ? `${testID}-photo` : undefined}
          source={{ uri }}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={art.mediaId ?? undefined}
          transition={t.motion.duration.fast}
          onError={() => setFailed(true)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      ) : null}
      {children}
    </View>
  );
});

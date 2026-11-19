import { Search, SlidersHorizontal, X } from 'lucide-react-native';
import { useEffect, useRef, type ComponentRef } from 'react';
import { TextInput, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { IconButton, PressableScale, Text } from '@/ui';

type Props = {
  value: string;
  onChange: (q: string) => void;
  placeholder: string;
  filterCount: number;
  onOpenFilters: () => void;
};

/** Uber "Where to?" search field (sheet 11) with a clear button and a filter button + badge. */
export function SearchBar({ value, onChange, placeholder, filterCount, onOpenFilters }: Props) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const badge = useSharedValue(filterCount ? 1 : 0);
  useEffect(() => {
    const to = filterCount ? 1 : 0;
    badge.set(reduceMotion ? to : withSpring(to, t.motion.spring));
  }, [filterCount, reduceMotion, badge, t.motion.spring]);
  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badge.value }],
    opacity: badge.value,
  }));

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}>
      <View
        style={{
          flex: 1,
          minHeight: t.sizes.button,
          borderRadius: t.radius.pill,
          backgroundColor: t.colors.surface,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: t.spacing.md,
          gap: t.spacing.xs,
        }}
      >
        <Search color={t.colors.textPrimary} size={t.sizes.icon} strokeWidth={t.sizes.iconStroke} />
        <TextInput
          ref={input}
          testID="library-search"
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          accessibilityLabel="Search exercises"
          placeholderTextColor={t.colors.textSecondary}
          selectionColor={t.colors.accent}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="never"
          style={{
            flex: 1,
            minHeight: t.sizes.touch,
            color: t.colors.textPrimary,
            fontFamily: t.typography.headline.fontFamily,
            fontSize: t.typography.body.fontSize,
          }}
        />
        {value ? (
          <IconButton
            icon={X}
            accessibilityLabel="Clear search"
            onPress={() => {
              onChange('');
              input.current?.focus();
            }}
            color="textSecondary"
            testID="library-search-clear"
          />
        ) : (
          <View style={{ width: t.spacing.xs }} />
        )}
      </View>
      <PressableScale
        testID="library-filters"
        onPress={onOpenFilters}
        accessibilityRole="button"
        accessibilityLabel={filterCount ? `Filters, ${filterCount} on` : 'Filters'}
        style={{
          width: t.sizes.button,
          height: t.sizes.button,
          borderRadius: t.radius.pill,
          backgroundColor: filterCount ? t.colors.inverse : t.colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'visible',
        }}
      >
        <SlidersHorizontal
          color={filterCount ? t.colors.onInverse : t.colors.textPrimary}
          size={t.sizes.icon}
          strokeWidth={t.sizes.iconStroke}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: 0,
              right: 0,
              minWidth: t.spacing.lg,
              height: t.spacing.lg,
              paddingHorizontal: t.spacing.xxs,
              borderRadius: t.radius.pill,
              backgroundColor: t.colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
            },
            badgeStyle,
          ]}
        >
          <Text variant="caption" color="onAccent" tabular maxFontSizeMultiplier={1.2}>
            {filterCount || ''}
          </Text>
        </Animated.View>
      </PressableScale>
    </View>
  );
}

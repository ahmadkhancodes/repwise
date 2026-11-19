import { Search, SlidersHorizontal, X } from 'lucide-react-native';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentRef,
} from 'react';
import { TextInput, View } from 'react-native';

import { useTheme } from '@/theme';

import { IconButton } from './IconButton';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

/** Default debounce for search-as-you-type (ms): fast enough to feel live, no query per key. */
export const SEARCH_DEBOUNCE_MS = 200;

/**
 * Debounced callback with `flush` (run now) and `cancel`. Always calls the latest `fn`.
 * Cleans up on unmount.
 */
export function useDebouncedCallback<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  const fnRef = useRef(fn);
  useLayoutEffect(() => {
    fnRef.current = fn;
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<A | null>(null);

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
  }, []);

  const flush = useCallback(() => {
    const args = pending.current;
    cancel();
    if (args) fnRef.current(...args);
  }, [cancel]);

  const call = useCallback(
    (...args: A) => {
      if (timer.current) clearTimeout(timer.current);
      pending.current = args;
      timer.current = setTimeout(() => {
        timer.current = null;
        const a = pending.current;
        pending.current = null;
        if (a) fnRef.current(...a);
      }, ms);
    },
    [ms],
  );

  useEffect(() => cancel, [cancel]);
  return { call, flush, cancel };
}

export type SearchBarProps = {
  /** Controlled text (optional). Without it the bar keeps its own text. */
  value?: string;
  /** Every keystroke (immediate). */
  onChangeText?: (text: string) => void;
  /** Debounced query (trimmed). Fires immediately on clear and on the keyboard's search key. */
  onSearch?: (query: string) => void;
  debounceMs?: number;
  placeholder: string;
  /** Spoken name, e.g. "Search exercises". */
  accessibilityLabel: string;
  autoFocus?: boolean;
  /** Shows a trailing filter button when set. */
  onOpenFilters?: () => void;
  /** Active filter count: fills the button and shows a count badge. */
  filterCount?: number;
  testID?: string;
};

/** Uber "Where to?" field (sheet 11): big rounded search, clear button, optional filters. */
export function SearchBar({
  value,
  onChangeText,
  onSearch,
  debounceMs = SEARCH_DEBOUNCE_MS,
  placeholder,
  accessibilityLabel,
  autoFocus,
  onOpenFilters,
  filterCount = 0,
  testID,
}: SearchBarProps) {
  const t = useTheme();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [own, setOwn] = useState(value ?? '');
  const text = value ?? own;
  const debounced = useDebouncedCallback((q: string) => onSearch?.(q.trim()), debounceMs);

  const change = (next: string) => {
    if (value === undefined) setOwn(next);
    onChangeText?.(next);
    debounced.call(next);
  };

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
          testID={testID}
          value={text}
          onChangeText={change}
          onSubmitEditing={() => debounced.flush()}
          placeholder={placeholder}
          accessibilityLabel={accessibilityLabel}
          placeholderTextColor={t.colors.textSecondary}
          selectionColor={t.colors.accent}
          cursorColor={t.colors.textPrimary}
          autoFocus={autoFocus}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="never"
          style={{
            flex: 1,
            minHeight: t.sizes.touch,
            paddingVertical: 0,
            color: t.colors.textPrimary,
            fontFamily: t.typography.headline.fontFamily,
            fontSize: t.typography.body.fontSize,
          }}
        />
        {text ? (
          <IconButton
            icon={X}
            accessibilityLabel="Clear search"
            color="textSecondary"
            onPress={() => {
              if (value === undefined) setOwn('');
              onChangeText?.('');
              debounced.cancel();
              onSearch?.('');
              input.current?.focus();
            }}
            testID={testID ? `${testID}-clear` : undefined}
          />
        ) : (
          <View style={{ width: t.spacing.xs }} />
        )}
      </View>
      {onOpenFilters ? (
        <PressableScale
          testID={testID ? `${testID}-filters` : undefined}
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
          {filterCount ? (
            <View
              pointerEvents="none"
              style={{
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
              }}
            >
              <Text variant="caption" color="onAccent" tabular maxFontSizeMultiplier={1.2}>
                {filterCount}
              </Text>
            </View>
          ) : null}
        </PressableScale>
      ) : null}
    </View>
  );
}

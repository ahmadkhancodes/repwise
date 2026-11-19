import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import * as RN from 'react-native';

import { kv } from '@/services/storage';

import { resolveScheme } from '../resolveScheme';
import { useThemeStore } from '../themeStore';
import { colors, typography } from '../tokens';
import { ThemeScope, useTheme } from '../useTheme';

describe('resolveScheme', () => {
  it('follows the system when preference is system', () => {
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
    expect(resolveScheme('system', null)).toBe('light');
    expect(resolveScheme('system', 'unspecified')).toBe('light');
  });
  it('lets the user override win', () => {
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
  });
});

describe('tokens', () => {
  it('light and dark define the same token names', () => {
    expect(Object.keys(colors.dark).sort()).toEqual(Object.keys(colors.light).sort());
  });
  it('body text is 16px Inter', () => {
    expect(typography.body.fontSize).toBe(16);
    expect(typography.body.fontFamily).toMatch(/^Inter_/);
  });
  it('display sizes still allow 130% font scale', () => {
    for (const t of Object.values(typography)) {
      if (t.maxFontSizeMultiplier !== undefined)
        expect(t.maxFontSizeMultiplier).toBeGreaterThanOrEqual(1.3);
    }
  });
});

describe('useTheme', () => {
  const spy = jest.spyOn(RN, 'useColorScheme');
  afterEach(async () => {
    await act(() => useThemeStore.getState().setPreference('system'));
  });

  it('follows the system scheme', async () => {
    spy.mockReturnValue('dark');
    const { result } = await renderHook(() => useTheme());
    expect(result.current.scheme).toBe('dark');
    expect(result.current.colors.bg).toBe(colors.dark.bg);
  });

  it('applies and persists the user override in MMKV', async () => {
    spy.mockReturnValue('dark');
    const { result } = await renderHook(() => useTheme());
    await act(() => useThemeStore.getState().setPreference('light'));
    expect(result.current.scheme).toBe('light');
    expect(kv.getString('theme')).toContain('"preference":"light"');
  });

  it('ThemeScope overrides everything for its subtree', async () => {
    spy.mockReturnValue('light');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ThemeScope scheme="dark">{children}</ThemeScope>
    );
    const { result } = await renderHook(() => useTheme(), { wrapper });
    expect(result.current.scheme).toBe('dark');
  });
});

/**
 * react-native-android-widget double: the widget primitives are inert functions (trees are
 * inspected with `walkWidgetTree`), and the native calls are jest.fn().
 */
import type { ReactElement } from 'react';

export const FlexWidget = () => null;
export const TextWidget = () => null;
export const SvgWidget = () => null;
export const ImageWidget = () => null;
export const requestWidgetUpdate = jest.fn(async () => undefined);
export const registerWidgetTaskHandler = jest.fn();

const PRIMITIVES = new Set<unknown>([FlexWidget, TextWidget, SvgWidget, ImageWidget]);

export type WidgetNode = { type: string; props: Record<string, unknown> };

/** Flatten a widget JSX tree (calling our own function components) into primitive nodes. */
export function walkWidgetTree(el: unknown, out: WidgetNode[] = []): WidgetNode[] {
  if (el == null || typeof el === 'boolean') return out;
  if (Array.isArray(el)) {
    for (const c of el) walkWidgetTree(c, out);
    return out;
  }
  const e = el as ReactElement<Record<string, unknown>>;
  if (typeof e.type === 'function' && !PRIMITIVES.has(e.type)) {
    return walkWidgetTree((e.type as (p: unknown) => unknown)(e.props), out);
  }
  if (PRIMITIVES.has(e.type)) {
    out.push({ type: (e.type as { name: string }).name, props: e.props });
    walkWidgetTree(e.props.children, out);
  }
  return out;
}

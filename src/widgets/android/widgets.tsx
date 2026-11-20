/**
 * Android home-screen widgets (react-native-android-widget), sheet 17:
 * WG-1 Today (workout + one-tap Start, next meal + "Ate it", kcal/protein ring, quick log),
 * WG-2 Macros (kcal/protein ring + P/C/F), WG-3 Streak.
 * Rendered from the widget snapshot, in light and dark (WidgetRepresentation), and laid out for
 * the size the launcher gives (Today shrinks to a 2×2 card; Macros drops rows when short).
 */
import { FlexWidget, SvgWidget, TextWidget, type WidgetRepresentation } from 'react-native-android-widget';

import type { ColorScheme } from '@/theme';

import { ringProgress, WIDGET_LINKS, workoutCta, workoutLines, type WidgetSnapshot } from '../snapshot';
import { dualRingSvg, palette, ringSvg, WIDGET_FONTS, WIDGET_METRICS as M, type WidgetPalette } from './palette';

export const WIDGET_NAMES = { today: 'RepwiseToday', macros: 'RepwiseMacros', streak: 'RepwiseStreak' } as const;
export type WidgetName = (typeof WIDGET_NAMES)[keyof typeof WIDGET_NAMES];

/** Launcher size in dp (WidgetInfo.width/height). Unknown = the configured default size. */
export type WidgetSize = { width: number; height: number };

/** Below this width Today uses the 2×2 layout. */
const COMPACT_WIDTH = 200;
/** Below this height Macros shows protein only. */
const SHORT_HEIGHT = 150;
const RING_TODAY = 76;
const RING_MACROS = 56;
const RING_STROKE = 7;

type Props = { snapshot: WidgetSnapshot; scheme: ColorScheme; size?: WidgetSize };

function Pill({
  label,
  uri,
  a11y,
  bg,
  fg,
}: {
  label: string;
  uri: string;
  a11y: string;
  bg: WidgetPalette[keyof WidgetPalette];
  fg: WidgetPalette[keyof WidgetPalette];
}) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri }}
      accessibilityLabel={a11y}
      style={{
        backgroundColor: bg,
        borderRadius: M.pill,
        paddingHorizontal: M.pillPadH,
        paddingVertical: M.pillPadV,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <TextWidget text={label} style={{ fontSize: M.callout, fontFamily: WIDGET_FONTS.semibold, color: fg }} />
    </FlexWidget>
  );
}

function ProLock({ scheme }: { scheme: ColorScheme }) {
  const c = palette(scheme);
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: WIDGET_LINKS.today }}
      accessibilityLabel="Widgets are part of Repwise Pro. Open Repwise to unlock."
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: c.bg,
        borderRadius: M.radius,
        padding: M.pad,
        justifyContent: 'center',
      }}
    >
      <TextWidget text="Widgets are part of Repwise Pro" style={{ fontSize: M.callout, fontFamily: WIDGET_FONTS.semibold, color: c.text }} />
      <TextWidget text="Open Repwise to unlock" style={{ fontSize: M.small, fontFamily: WIDGET_FONTS.regular, color: c.text2, marginTop: M.gapSmall }} />
    </FlexWidget>
  );
}

function kcalA11y(s: WidgetSnapshot): string {
  return `${s.kcal.eaten} of ${s.kcal.target} calories, ${s.macros.p.eaten} of ${s.macros.p.target} grams protein`;
}

function TodayCompact({ snapshot: s, scheme }: Props) {
  const c = palette(scheme);
  const lines = workoutLines(s.workout);
  const cta = workoutCta(s.workout);
  const meal = s.nextMeal;
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: s.workout ? WIDGET_LINKS.workout(s.workout.sessionId, false) : WIDGET_LINKS.today }}
      accessibilityLabel={`Today: ${lines.title}, ${lines.meta}`}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: c.bg,
        borderRadius: M.radius,
        padding: M.padCompact,
        justifyContent: 'space-between',
      }}
    >
      <FlexWidget style={{ width: 'match_parent' }}>
        <TextWidget text="TODAY" style={{ fontSize: M.label, fontFamily: WIDGET_FONTS.semibold, color: c.text2 }} />
        <TextWidget
          text={lines.title}
          maxLines={2}
          truncate="END"
          style={{ fontSize: M.headline, fontFamily: WIDGET_FONTS.bold, color: c.text, marginTop: M.gapSmall }}
        />
        <TextWidget text={lines.meta} maxLines={1} truncate="END" style={{ fontSize: M.small, fontFamily: WIDGET_FONTS.regular, color: c.text2 }} />
      </FlexWidget>
      {cta ? (
        <Pill label={cta.label} uri={cta.url} a11y={`${cta.label} ${lines.title}`} bg={c.accent} fg={c.onAccent} />
      ) : meal ? (
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: WIDGET_LINKS.tickMeal(meal.id) }}
          accessibilityLabel={`${meal.label} at ${meal.time}: ${meal.name}. Mark as eaten`}
          style={{ width: 'match_parent' }}
        >
          <TextWidget text={`${meal.label} · ${meal.time}`} style={{ fontSize: M.small, fontFamily: WIDGET_FONTS.regular, color: c.text2 }} />
          <TextWidget text={meal.name} maxLines={1} truncate="END" style={{ fontSize: M.callout, fontFamily: WIDGET_FONTS.semibold, color: c.text }} />
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}

export function TodayWidget({ snapshot: s, scheme, size }: Props) {
  if (!s.pro) return <ProLock scheme={scheme} />;
  if (size && size.width > 0 && size.width < COMPACT_WIDTH) return <TodayCompact snapshot={s} scheme={scheme} size={size} />;
  const c = palette(scheme);
  const lines = workoutLines(s.workout);
  const cta = workoutCta(s.workout);
  const meal = s.nextMeal;
  const ring = dualRingSvg(ringProgress(s.kcal), ringProgress(s.macros.p), RING_TODAY, RING_STROKE, {
    outer: c.accent,
    inner: c.protein,
    track: c.surface2,
  });
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: s.workout ? WIDGET_LINKS.workout(s.workout.sessionId, false) : WIDGET_LINKS.today }}
      accessibilityLabel={`Today: ${lines.title}, ${lines.meta}`}
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: c.bg, borderRadius: M.radius, padding: M.pad }}
    >
      <FlexWidget style={{ flex: 1, width: 'match_parent', flexDirection: 'row' }}>
        <FlexWidget style={{ flex: 1, height: 'match_parent', justifyContent: 'space-between' }}>
          <FlexWidget style={{ width: 'match_parent' }}>
            <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', alignItems: 'center' }}>
              <TextWidget text="TODAY" style={{ fontSize: M.label, fontFamily: WIDGET_FONTS.semibold, color: c.text2 }} />
              <FlexWidget style={{ flex: 1 }} />
              <FlexWidget
                clickAction="OPEN_URI"
                clickActionData={{ uri: WIDGET_LINKS.quickLog }}
                accessibilityLabel="Quick log food"
                style={{ paddingHorizontal: M.gap, paddingVertical: M.gapSmall }}
              >
                <TextWidget text="+ Log" style={{ fontSize: M.small, fontFamily: WIDGET_FONTS.semibold, color: c.accentText }} />
              </FlexWidget>
            </FlexWidget>
            <TextWidget
              text={lines.title}
              maxLines={1}
              truncate="END"
              style={{ fontSize: M.headline, fontFamily: WIDGET_FONTS.bold, color: c.text }}
            />
            <TextWidget text={lines.meta} maxLines={1} truncate="END" style={{ fontSize: M.small, fontFamily: WIDGET_FONTS.regular, color: c.text2 }} />
          </FlexWidget>
          {cta ? <Pill label={cta.label} uri={cta.url} a11y={`${cta.label} ${lines.title}`} bg={c.accent} fg={c.onAccent} /> : null}
        </FlexWidget>
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: WIDGET_LINKS.eat }}
          accessibilityLabel={kcalA11y(s)}
          style={{ alignItems: 'center', justifyContent: 'center', marginLeft: M.sm }}
        >
          <SvgWidget svg={ring} style={{ width: RING_TODAY, height: RING_TODAY }} />
          <TextWidget
            text={`${s.kcal.eaten} / ${s.kcal.target} kcal`}
            style={{ fontSize: M.small, fontFamily: WIDGET_FONTS.semibold, color: c.text, marginTop: M.gapSmall }}
          />
          <TextWidget
            text={`${s.macros.p.eaten} / ${s.macros.p.target} g protein`}
            style={{ fontSize: M.small, fontFamily: WIDGET_FONTS.regular, color: c.text2 }}
          />
        </FlexWidget>
      </FlexWidget>
      {meal ? (
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: WIDGET_LINKS.eat }}
          accessibilityLabel={`${meal.label} at ${meal.time}: ${meal.name}`}
          style={{
            width: 'match_parent',
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: c.surface,
            borderRadius: M.innerRadius,
            paddingHorizontal: M.sm,
            paddingVertical: M.gap,
            marginTop: M.gap,
          }}
        >
          <FlexWidget style={{ flex: 1 }}>
            <TextWidget text={`${meal.label} · ${meal.time}`} style={{ fontSize: M.small, fontFamily: WIDGET_FONTS.regular, color: c.text2 }} />
            <TextWidget text={meal.name} maxLines={1} truncate="END" style={{ fontSize: M.callout, fontFamily: WIDGET_FONTS.semibold, color: c.text }} />
          </FlexWidget>
          <Pill label="Ate it" uri={WIDGET_LINKS.tickMeal(meal.id)} a11y={`Mark ${meal.name} as eaten`} bg={c.inverse} fg={c.onInverse} />
        </FlexWidget>
      ) : (
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: WIDGET_LINKS.quickLog }}
          accessibilityLabel="No meals planned. Quick log food"
          style={{ width: 'match_parent', backgroundColor: c.surface, borderRadius: M.innerRadius, padding: M.gap, marginTop: M.gap }}
        >
          <TextWidget text="No meals planned" style={{ fontSize: M.small, fontFamily: WIDGET_FONTS.regular, color: c.text2 }} />
        </FlexWidget>
      )}
    </FlexWidget>
  );
}

function MacroRow({ label, eaten, target, color, scheme }: { label: string; eaten: number; target: number; color: string; scheme: ColorScheme }) {
  const c = palette(scheme);
  return (
    <FlexWidget
      accessibilityLabel={`${label} ${eaten} of ${target} grams`}
      style={{ flexDirection: 'row', alignItems: 'center', marginTop: M.gapSmall + 2, width: 'match_parent' }}
    >
      <SvgWidget svg={ringSvg(target > 0 ? eaten / target : 0, 18, 4, color, c.surface2)} style={{ width: 18, height: 18 }} />
      <TextWidget text={label} style={{ fontSize: M.small, fontFamily: WIDGET_FONTS.regular, color: c.text2, marginLeft: M.gap }} />
      <FlexWidget style={{ flex: 1 }} />
      <TextWidget text={`${eaten}/${target} g`} style={{ fontSize: M.small, fontFamily: WIDGET_FONTS.semibold, color: c.text }} />
    </FlexWidget>
  );
}

export function MacrosWidget({ snapshot: s, scheme, size }: Props) {
  if (!s.pro) return <ProLock scheme={scheme} />;
  const c = palette(scheme);
  const left = Math.max(0, s.kcal.target - s.kcal.eaten);
  const short = !!size && size.height > 0 && size.height < SHORT_HEIGHT;
  const ring = dualRingSvg(ringProgress(s.kcal), ringProgress(s.macros.p), RING_MACROS, 6, {
    outer: c.accent,
    inner: c.protein,
    track: c.surface2,
  });
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: WIDGET_LINKS.eat }}
      accessibilityLabel={`${left} calories left. ${kcalA11y(s)}`}
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: c.bg, borderRadius: M.radius, padding: M.padCompact }}
    >
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent' }}>
        <SvgWidget svg={ring} style={{ width: RING_MACROS, height: RING_MACROS }} />
        <FlexWidget style={{ marginLeft: M.gap }}>
          <TextWidget text={`${left}`} style={{ fontSize: M.number, fontFamily: WIDGET_FONTS.bold, color: c.text }} />
          <TextWidget text="kcal left" style={{ fontSize: M.small, fontFamily: WIDGET_FONTS.regular, color: c.text2 }} />
        </FlexWidget>
      </FlexWidget>
      <MacroRow label="Protein" eaten={s.macros.p.eaten} target={s.macros.p.target} color={c.protein} scheme={scheme} />
      {short ? null : <MacroRow label="Carbs" eaten={s.macros.c.eaten} target={s.macros.c.target} color={c.carb} scheme={scheme} />}
      {short ? null : <MacroRow label="Fat" eaten={s.macros.f.eaten} target={s.macros.f.target} color={c.fat} scheme={scheme} />}
    </FlexWidget>
  );
}

export function StreakWidget({ snapshot: s, scheme }: Props) {
  if (!s.pro) return <ProLock scheme={scheme} />;
  const c = palette(scheme);
  const unit = s.streakWeeks === 1 ? 'week in a row' : 'weeks in a row';
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: WIDGET_LINKS.progress }}
      accessibilityLabel={`${s.streakWeeks} ${unit}`}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: c.bg,
        borderRadius: M.radius,
        padding: M.padCompact,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <TextWidget text={`${s.streakWeeks}`} style={{ fontSize: M.big, fontFamily: WIDGET_FONTS.bold, color: c.accentText }} />
      <TextWidget text={unit} style={{ fontSize: M.small, fontFamily: WIDGET_FONTS.regular, color: c.text2 }} />
    </FlexWidget>
  );
}

function pickWidget(name: WidgetName, snapshot: WidgetSnapshot, scheme: ColorScheme, size?: WidgetSize) {
  switch (name) {
    case WIDGET_NAMES.today:
      return <TodayWidget snapshot={snapshot} scheme={scheme} size={size} />;
    case WIDGET_NAMES.macros:
      return <MacrosWidget snapshot={snapshot} scheme={scheme} size={size} />;
    case WIDGET_NAMES.streak:
      return <StreakWidget snapshot={snapshot} scheme={scheme} size={size} />;
  }
}

/** Light + dark versions of one of our widgets (the launcher picks by system theme). */
export function renderKnownWidget(
  name: WidgetName,
  snapshot: WidgetSnapshot,
  size?: WidgetSize,
): { light: React.JSX.Element; dark: React.JSX.Element } {
  return { light: pickWidget(name, snapshot, 'light', size), dark: pickWidget(name, snapshot, 'dark', size) };
}

function isWidgetName(name: string): name is WidgetName {
  return (Object.values(WIDGET_NAMES) as string[]).includes(name);
}

/** Light + dark versions of one widget by launcher name; null for names we do not own. */
export function renderWidget(name: string, snapshot: WidgetSnapshot, size?: WidgetSize): WidgetRepresentation | null {
  return isWidgetName(name) ? renderKnownWidget(name, snapshot, size) : null;
}

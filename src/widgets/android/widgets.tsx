/**
 * Android home-screen widgets (react-native-android-widget), sheet 17:
 * WG-1 Today (workout + calorie ring + quick log), WG-2 Macros, WG-3 Streak.
 * Rendered from the widget snapshot, in light and dark (WidgetRepresentation).
 */
import { FlexWidget, SvgWidget, TextWidget, type WidgetRepresentation } from 'react-native-android-widget';

import type { ColorScheme } from '@/theme';

import { ringProgress, WIDGET_LINKS, type WidgetSnapshot } from '../snapshot';
import { palette, ringSvg, WIDGET_FONTS } from './palette';

export const WIDGET_NAMES = { today: 'RepwiseToday', macros: 'RepwiseMacros', streak: 'RepwiseStreak' } as const;
export type WidgetName = (typeof WIDGET_NAMES)[keyof typeof WIDGET_NAMES];

const PAD = 16;
const RADIUS = 12;

function workoutLine(s: WidgetSnapshot): string {
  const w = s.workout;
  if (!w) return 'Rest day';
  if (w.status === 'done') return `${w.title} · done`;
  return w.minutes > 0 ? `${w.title} · ${w.minutes} min` : w.title;
}

function ProLock({ scheme }: { scheme: ColorScheme }) {
  const c = palette(scheme);
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: WIDGET_LINKS.today }}
      accessibilityLabel="Widgets are part of Repwise Pro. Open Repwise to unlock."
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: c.bg, borderRadius: RADIUS, padding: PAD, justifyContent: 'center' }}
    >
      <TextWidget text="Widgets are part of Repwise Pro" style={{ fontSize: 14, fontFamily: WIDGET_FONTS.semibold, color: c.text }} />
      <TextWidget text="Open Repwise to unlock" style={{ fontSize: 12, fontFamily: WIDGET_FONTS.regular, color: c.text2, marginTop: 4 }} />
    </FlexWidget>
  );
}

export function TodayWidget({ snapshot: s, scheme }: { snapshot: WidgetSnapshot; scheme: ColorScheme }) {
  if (!s.pro) return <ProLock scheme={scheme} />;
  const c = palette(scheme);
  const ring = ringSvg(ringProgress(s.kcal), 84, 8, c.accent, c.surface2);
  const meal = s.nextMeal;
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: WIDGET_LINKS.workout(s.workout?.sessionId, false) }}
      accessibilityLabel={`Today: ${workoutLine(s)}`}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'row',
        backgroundColor: c.bg,
        borderRadius: RADIUS,
        padding: PAD,
      }}
    >
      <FlexWidget style={{ flex: 1, height: 'match_parent', justifyContent: 'space-between' }}>
        <FlexWidget>
          <TextWidget text="TODAY" style={{ fontSize: 11, fontFamily: WIDGET_FONTS.semibold, color: c.text2 }} />
          <TextWidget
            text={workoutLine(s)}
            maxLines={2}
            truncate="END"
            style={{ fontSize: 17, fontFamily: WIDGET_FONTS.bold, color: c.text, marginTop: 4 }}
          />
        </FlexWidget>
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: WIDGET_LINKS.eat }}
          accessibilityLabel={meal ? `${meal.label} at ${meal.time}: ${meal.name}` : 'No meals planned'}
        >
          <TextWidget
            text={meal ? `${meal.label} · ${meal.time}` : 'No meals planned'}
            style={{ fontSize: 12, fontFamily: WIDGET_FONTS.regular, color: c.text2 }}
          />
          {meal ? (
            <TextWidget
              text={meal.name}
              maxLines={1}
              truncate="END"
              style={{ fontSize: 14, fontFamily: WIDGET_FONTS.semibold, color: c.text, marginTop: 2 }}
            />
          ) : null}
        </FlexWidget>
      </FlexWidget>
      <FlexWidget style={{ alignItems: 'center', justifyContent: 'center', marginLeft: 12 }}>
        <FlexWidget
          accessibilityLabel={`${s.kcal.eaten} of ${s.kcal.target} calories`}
          style={{ width: 84, height: 84, alignItems: 'center', justifyContent: 'center' }}
        >
          <SvgWidget svg={ring} style={{ width: 84, height: 84 }} />
        </FlexWidget>
        <TextWidget
          text={`${s.kcal.eaten} / ${s.kcal.target} kcal`}
          style={{ fontSize: 11, fontFamily: WIDGET_FONTS.semibold, color: c.text, marginTop: 4 }}
        />
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: WIDGET_LINKS.quickLog }}
          accessibilityLabel="Quick log food"
          style={{
            marginTop: 8,
            backgroundColor: c.accent,
            borderRadius: 999,
            paddingHorizontal: 16,
            paddingVertical: 8,
          }}
        >
          <TextWidget text="+ Log" style={{ fontSize: 13, fontFamily: WIDGET_FONTS.semibold, color: c.onAccent }} />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}

function MacroRow({ label, eaten, target, color, scheme }: { label: string; eaten: number; target: number; color: string; scheme: ColorScheme }) {
  const c = palette(scheme);
  return (
    <FlexWidget
      accessibilityLabel={`${label} ${eaten} of ${target} grams`}
      style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, width: 'match_parent' }}
    >
      <SvgWidget svg={ringSvg(target > 0 ? eaten / target : 0, 22, 4, color, c.surface2)} style={{ width: 22, height: 22 }} />
      <TextWidget text={label} style={{ fontSize: 12, fontFamily: WIDGET_FONTS.regular, color: c.text2, marginLeft: 8 }} />
      <FlexWidget style={{ flex: 1 }} />
      <TextWidget text={`${eaten} g`} style={{ fontSize: 12, fontFamily: WIDGET_FONTS.semibold, color: c.text }} />
    </FlexWidget>
  );
}

export function MacrosWidget({ snapshot: s, scheme }: { snapshot: WidgetSnapshot; scheme: ColorScheme }) {
  if (!s.pro) return <ProLock scheme={scheme} />;
  const c = palette(scheme);
  const left = Math.max(0, s.kcal.target - s.kcal.eaten);
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: WIDGET_LINKS.eat }}
      accessibilityLabel={`${left} calories left`}
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: c.bg, borderRadius: RADIUS, padding: PAD }}
    >
      <TextWidget text={`${left}`} style={{ fontSize: 28, fontFamily: WIDGET_FONTS.bold, color: c.text }} />
      <TextWidget text="kcal left" style={{ fontSize: 12, fontFamily: WIDGET_FONTS.regular, color: c.text2 }} />
      <MacroRow label="Protein" eaten={s.macros.p.eaten} target={s.macros.p.target} color={c.protein} scheme={scheme} />
      <MacroRow label="Carbs" eaten={s.macros.c.eaten} target={s.macros.c.target} color={c.carb} scheme={scheme} />
      <MacroRow label="Fat" eaten={s.macros.f.eaten} target={s.macros.f.target} color={c.fat} scheme={scheme} />
    </FlexWidget>
  );
}

export function StreakWidget({ snapshot: s, scheme }: { snapshot: WidgetSnapshot; scheme: ColorScheme }) {
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
        borderRadius: RADIUS,
        padding: 12,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <TextWidget text={`${s.streakWeeks}`} style={{ fontSize: 32, fontFamily: WIDGET_FONTS.bold, color: c.accent }} />
      <TextWidget text={unit} style={{ fontSize: 11, fontFamily: WIDGET_FONTS.regular, color: c.text2 }} />
    </FlexWidget>
  );
}

/** Light + dark versions of one widget (the launcher picks by system theme). */
export function renderWidget(name: string, snapshot: WidgetSnapshot): WidgetRepresentation | null {
  const pick = (scheme: ColorScheme) => {
    switch (name) {
      case WIDGET_NAMES.today:
        return <TodayWidget snapshot={snapshot} scheme={scheme} />;
      case WIDGET_NAMES.macros:
        return <MacrosWidget snapshot={snapshot} scheme={scheme} />;
      case WIDGET_NAMES.streak:
        return <StreakWidget snapshot={snapshot} scheme={scheme} />;
      default:
        return null;
    }
  };
  const light = pick('light');
  if (!light) return null;
  return { light, dark: pick('dark') };
}

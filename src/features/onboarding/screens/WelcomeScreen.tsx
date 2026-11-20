import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  Image,
  ScrollView,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';
import { Button, Text } from '@/ui';

import { isOnboarded, trackStep } from '../actions';
import { WelcomeArt } from '../components/WelcomeArt';
import { useOnboarding } from '../store';

type Slide = { eyebrow: string; title: string; body: string };

export const SLIDES: Slide[] = [
  {
    eyebrow: 'TRAIN',
    title: 'Your workouts and meals, planned daily',
    body: 'One plan for the gym and the kitchen, built around your goal, kit and schedule.',
  },
  {
    eyebrow: 'EAT',
    title: 'Meals that hit your numbers',
    body: 'Real recipes for your diet, allergies and budget, portioned to your calories and protein.',
  },
  {
    eyebrow: 'PROGRESS',
    title: 'Never the same week twice',
    body: 'Fresh sessions and menus every week that adapt as you get stronger.',
  },
];

const AUTO_MS = 4000;

const LOGO = require('../../../../assets/images/adaptive-icon-monochrome.png') as number;

function Dot({ active }: { active: boolean }) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const style = useAnimatedStyle(() => {
    const w = active ? t.spacing.xl : t.spacing.xs;
    return { width: reduceMotion ? w : withSpring(w, t.motion.spring) };
  });
  return (
    <Animated.View
      style={[
        {
          height: t.spacing.xs,
          borderRadius: t.radius.pill,
          backgroundColor: active ? t.colors.textPrimary : t.colors.surface2,
        },
        style,
      ]}
    />
  );
}

/** S02 Welcome: value carousel, "Get started", "I already use Repwise". No account asked. */
export function WelcomeScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [page, setPage] = useState(0);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const touched = useRef(false);

  useFocusEffect(
    useCallback(() => {
      // Back from "I already use Repwise" after a restore: the synced profile says we're done.
      if (isOnboarded()) {
        useOnboarding.getState().complete();
        router.replace('/today');
        return;
      }
      trackStep('welcome', 0);
    }, []),
  );

  // Gentle auto-advance until the user swipes (off with Reduce Motion).
  useEffect(() => {
    if (reduceMotion) return;
    const id = setInterval(() => {
      if (touched.current) return;
      setPage((p) => {
        const nextPage = (p + 1) % SLIDES.length;
        scroller.current?.scrollTo({ x: nextPage * width, animated: true });
        return nextPage;
      });
    }, AUTO_MS);
    return () => clearInterval(id);
  }, [reduceMotion, width]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const p = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width));
    if (p !== page && p >= 0 && p < SLIDES.length) setPage(p);
  };

  const start = () => {
    useOnboarding.getState().start();
    router.push({
      pathname: '/q/[step]',
      params: { step: useOnboarding.getState().step ?? 'goal' },
    });
  };

  return (
    <View
      testID="screen-welcome"
      style={{ flex: 1, backgroundColor: t.colors.bg, paddingTop: insets.top + t.spacing.lg }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.xs,
          paddingHorizontal: t.spacing.screen,
        }}
        accessible
        accessibilityRole="header"
        accessibilityLabel="Repwise"
      >
        <Image
          source={LOGO}
          // The mark fills the middle ~half of the adaptive-icon canvas: 48dp box → ~22dp mark.
          style={{
            width: t.sizes.touch,
            height: t.sizes.touch,
            marginLeft: -t.spacing.sm,
            marginRight: -t.spacing.sm,
            tintColor: t.colors.textPrimary,
          }}
          resizeMode="contain"
        />
        <Text variant="title2">Repwise</Text>
      </View>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => {
          touched.current = true;
        }}
        onMomentumScrollEnd={onScroll}
        testID="welcome-carousel"
        style={{ flex: 1 }}
      >
        {SLIDES.map((s, i) => {
          return (
            <View
              key={s.eyebrow}
              style={{
                width,
                paddingHorizontal: t.spacing.screen,
                justifyContent: 'center',
                gap: t.spacing.xl,
              }}
              accessible
              accessibilityLabel={`${s.title}. ${s.body}`}
              testID={`welcome-slide-${i}`}
            >
              <Animated.View
                entering={FadeInDown.springify()
                  .damping(t.motion.spring.damping)
                  .stiffness(t.motion.spring.stiffness)}
              >
                <WelcomeArt slide={i} />
              </Animated.View>
              <View style={{ gap: t.spacing.sm }}>
                <Text variant="caption" color="accentText">
                  {s.eyebrow}
                </Text>
                <Text variant="title1" numberOfLines={3}>
                  {s.title}
                </Text>
                <Text variant="body" color="textSecondary">
                  {s.body}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
      <View
        style={{ flexDirection: 'row', gap: t.spacing.xs, paddingHorizontal: t.spacing.screen }}
        accessible
        accessibilityLabel={`Page ${page + 1} of ${SLIDES.length}`}
        testID="welcome-dots"
      >
        {SLIDES.map((s, i) => (
          <Dot key={s.eyebrow} active={i === page} />
        ))}
      </View>
      <View
        style={{
          paddingHorizontal: t.spacing.screen,
          paddingTop: t.spacing.xl,
          paddingBottom: insets.bottom + t.spacing.sm,
          gap: t.spacing.xs,
        }}
      >
        <Button label="Get started" onPress={start} testID="welcome-start" />
        <Button
          label="I already use Repwise"
          variant="tertiary"
          onPress={() => router.push('/settings/account')}
          testID="welcome-restore"
        />
        <Text variant="caption" color="textSecondary" align="center">
          No account needed. Your data stays on this phone.
        </Text>
      </View>
    </View>
  );
}

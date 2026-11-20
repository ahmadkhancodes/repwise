import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';
import {
  Button,
  IconButton,
  PressableScale,
  SCREEN_KEYBOARD_BEHAVIOR,
  StepProgress,
  Text,
} from '@/ui';

export type QuizFrameProps = {
  title: string;
  subtitle?: string;
  index: number;
  total: number;
  children: ReactNode;
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  /** Shown above the button and announced (validation). */
  error?: string | null;
  /** Optional steps show "Skip" top right. */
  onSkip?: () => void;
  testID?: string;
};

/**
 * One question per screen (S03–S05): back + progress on top, big bold question, content, and the
 * single primary action pinned to the bottom (sheet 11).
 */
export function QuizFrame({
  title,
  subtitle,
  index,
  total,
  children,
  onBack,
  onNext,
  nextLabel = 'Continue',
  error,
  onSkip,
  testID,
}: QuizFrameProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const enter = FadeInRight.springify()
    .damping(t.motion.spring.damping)
    .stiffness(t.motion.spring.stiffness);

  return (
    <KeyboardAvoidingView
      testID={testID}
      behavior={SCREEN_KEYBOARD_BEHAVIOR}
      style={{ flex: 1, backgroundColor: t.colors.bg, paddingTop: insets.top }}
    >
      <View
        style={{
          minHeight: t.sizes.touch,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: t.spacing.xs,
        }}
      >
        <IconButton
          icon={ChevronLeft}
          accessibilityLabel="Back"
          onPress={onBack}
          testID="quiz-back"
        />
        {onSkip ? (
          <PressableScale
            onPress={onSkip}
            accessibilityRole="button"
            accessibilityLabel="Skip"
            testID="quiz-skip"
            style={{
              minHeight: t.sizes.touch,
              minWidth: t.sizes.touch,
              paddingHorizontal: t.spacing.sm,
              justifyContent: 'center',
            }}
          >
            <Text variant="callout" color="textSecondary">
              Skip
            </Text>
          </PressableScale>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: t.spacing.screen }}>
        <StepProgress
          total={total}
          current={index}
          accessibilityLabel="Quiz progress"
          testID="quiz-progress"
        />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: t.spacing.screen,
          paddingTop: t.spacing.xl,
          paddingBottom: t.spacing.xl,
          gap: t.spacing.lg,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View entering={enter} style={{ gap: t.spacing.xs }}>
          <Text variant="title1" accessibilityRole="header" testID="quiz-title">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="body" color="textSecondary">
              {subtitle}
            </Text>
          ) : null}
        </Animated.View>
        <Animated.View
          entering={enter.delay(t.motion.listStagger * 3)}
          style={{ gap: t.spacing.sm }}
        >
          {children}
        </Animated.View>
      </ScrollView>

      <View
        style={{
          paddingHorizontal: t.spacing.screen,
          paddingTop: t.spacing.sm,
          paddingBottom: insets.bottom + t.spacing.sm,
          gap: t.spacing.xs,
          backgroundColor: t.colors.bg,
        }}
      >
        {error ? (
          <Animated.View entering={FadeIn.duration(t.motion.duration.fast)}>
            <Text
              variant="callout"
              color="danger"
              align="center"
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              testID="quiz-error"
            >
              {error}
            </Text>
          </Animated.View>
        ) : null}
        <Button label={nextLabel} onPress={onNext} testID="quiz-next" />
      </View>
    </KeyboardAvoidingView>
  );
}

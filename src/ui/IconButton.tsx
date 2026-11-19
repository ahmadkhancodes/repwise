import type { LucideIcon } from 'lucide-react-native';

import { useTheme, type ColorToken } from '@/theme';

import { PressableScale, type PressableScaleProps } from './PressableScale';

export type IconButtonProps = {
  icon: LucideIcon;
  /** Required: icon-only controls must be labelled for VoiceOver/TalkBack. */
  accessibilityLabel: string;
  onPress?: () => void;
  color?: ColorToken;
  disabled?: boolean;
  testID?: string;
  feedback?: PressableScaleProps['feedback'];
};

/** 48×48 icon-only button. */
export function IconButton({
  icon: Icon,
  accessibilityLabel,
  onPress,
  color = 'textPrimary',
  disabled,
  testID,
  feedback,
}: IconButtonProps) {
  const t = useTheme();
  return (
    <PressableScale
      testID={testID}
      feedback={feedback}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={{
        width: t.sizes.touch,
        height: t.sizes.touch,
        borderRadius: t.radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Icon color={t.colors[color]} size={t.sizes.icon} strokeWidth={t.sizes.iconStroke} />
    </PressableScale>
  );
}

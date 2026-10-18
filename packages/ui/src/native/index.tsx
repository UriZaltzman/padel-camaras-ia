// React Native renderers: thin wrappers that turn the shared variants into RN styles.
// RN takes letterSpacing in points and one family name per weight (no fontWeight).
import type { ReactNode } from 'react';
import {
  Pressable,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { resolveNativeFontFamily } from '../fonts';
import {
  buttonLayout,
  buttonVariants,
  cardLayout,
  cardVariants,
  dataLabelText,
  dataLabelVariants,
  scorePillLayout,
  scorePillVariants,
  type ButtonVariant,
  type CardVariant,
  type DataLabelVariant,
  type ScorePillVariant,
  type TextStyleSpec,
} from '../variants';

export function nativeTextStyle(t: TextStyleSpec): TextStyle {
  return {
    fontFamily: resolveNativeFontFamily(t.role, t.weight),
    fontSize: t.fontSize,
    letterSpacing: t.letterSpacingEm * t.fontSize,
    textTransform: t.uppercase ? 'uppercase' : 'none',
  };
}

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: ButtonVariant;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, variant = 'primary', style, disabled, ...rest }: ButtonProps) {
  const v = buttonVariants[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      {...rest}
      style={({ pressed }) => [
        {
          backgroundColor: pressed ? v.pressedBackground : v.background,
          borderColor: v.border,
          borderWidth: buttonLayout.borderWidth,
          borderRadius: buttonLayout.borderRadius,
          paddingVertical: buttonLayout.paddingVertical,
          paddingHorizontal: buttonLayout.paddingHorizontal,
          minHeight: buttonLayout.minHeight,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.6 : 1,
        },
        style,
      ]}
    >
      <Text style={[nativeTextStyle(buttonLayout.text), { color: v.foreground }]}>{label}</Text>
    </Pressable>
  );
}

export interface CardProps {
  children: ReactNode;
  variant?: CardVariant;
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, variant = 'light', style }: CardProps) {
  const v = cardVariants[variant];
  return (
    <View
      style={[
        {
          backgroundColor: v.background,
          borderColor: v.border,
          borderWidth: cardLayout.borderWidth,
          borderRadius: cardLayout.borderRadius,
          padding: cardLayout.padding,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export interface DataLabelProps {
  label: string;
  variant?: DataLabelVariant;
  style?: StyleProp<TextStyle>;
}

export function DataLabel({ label, variant = 'default', style }: DataLabelProps) {
  return (
    <Text
      style={[
        nativeTextStyle(dataLabelText),
        { color: dataLabelVariants[variant].foreground },
        style,
      ]}
    >
      {label}
    </Text>
  );
}

export interface ScorePillProps {
  /** Pre-formatted score, e.g. "6-4 3-2". */
  score: string;
  /** Accessible description, from the es-AR translations. */
  accessibilityLabel?: string;
  variant?: ScorePillVariant;
  style?: StyleProp<ViewStyle>;
}

export function ScorePill({ score, accessibilityLabel, variant = 'light', style }: ScorePillProps) {
  const v = scorePillVariants[variant];
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          alignSelf: 'flex-start',
          backgroundColor: v.background,
          borderColor: v.border,
          borderWidth: scorePillLayout.borderWidth,
          borderRadius: scorePillLayout.borderRadius,
          paddingVertical: scorePillLayout.paddingVertical,
          paddingHorizontal: scorePillLayout.paddingHorizontal,
        },
        style,
      ]}
    >
      <Text
        style={[
          nativeTextStyle(scorePillLayout.text),
          { color: v.foreground, fontVariant: ['tabular-nums'] },
        ]}
      >
        {score}
      </Text>
    </View>
  );
}

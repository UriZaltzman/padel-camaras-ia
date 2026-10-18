// React DOM renderers: thin wrappers that turn the shared variants into inline styles.
import { useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';

import { webFontFamily } from '../fonts';
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

export function webTextStyle(t: TextStyleSpec): CSSProperties {
  return {
    fontFamily: webFontFamily(t.role),
    fontWeight: t.weight,
    fontSize: t.fontSize,
    letterSpacing: `${t.letterSpacingEm}em`,
    textTransform: t.uppercase ? 'uppercase' : 'none',
  };
}

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string;
  variant?: ButtonVariant;
}

export function Button({ label, variant = 'primary', style, disabled, ...rest }: ButtonProps) {
  const [pressed, setPressed] = useState(false);
  const v = buttonVariants[variant];
  const release = () => setPressed(false);
  return (
    <button
      type="button"
      data-variant={variant}
      data-pressed={pressed || undefined}
      disabled={disabled}
      onPointerDown={() => setPressed(true)}
      onPointerUp={release}
      onPointerLeave={release}
      {...rest}
      style={{
        ...webTextStyle(buttonLayout.text),
        color: v.foreground,
        backgroundColor: pressed ? v.pressedBackground : v.background,
        border: `${buttonLayout.borderWidth}px solid ${v.border}`,
        borderRadius: buttonLayout.borderRadius,
        padding: `${buttonLayout.paddingVertical}px ${buttonLayout.paddingHorizontal}px`,
        minHeight: buttonLayout.minHeight,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        ...style,
      }}
    >
      {label}
    </button>
  );
}

export interface CardProps {
  children: ReactNode;
  variant?: CardVariant;
  style?: CSSProperties;
  className?: string;
}

export function Card({ children, variant = 'light', style, className }: CardProps) {
  const v = cardVariants[variant];
  return (
    <div
      data-variant={variant}
      className={className}
      style={{
        backgroundColor: v.background,
        color: v.foreground,
        border: `${cardLayout.borderWidth}px solid ${v.border}`,
        borderRadius: cardLayout.borderRadius,
        padding: cardLayout.padding,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export interface DataLabelProps {
  label: string;
  variant?: DataLabelVariant;
  style?: CSSProperties;
}

export function DataLabel({ label, variant = 'default', style }: DataLabelProps) {
  return (
    <span
      data-variant={variant}
      style={{
        ...webTextStyle(dataLabelText),
        color: dataLabelVariants[variant].foreground,
        ...style,
      }}
    >
      {label}
    </span>
  );
}

export interface ScorePillProps {
  /** Pre-formatted score, e.g. "6-4 3-2". */
  score: string;
  /** Accessible description, from the es-AR translations. */
  accessibilityLabel?: string;
  variant?: ScorePillVariant;
  style?: CSSProperties;
}

export function ScorePill({ score, accessibilityLabel, variant = 'light', style }: ScorePillProps) {
  const v = scorePillVariants[variant];
  return (
    <span
      data-variant={variant}
      role={accessibilityLabel ? 'img' : undefined}
      aria-label={accessibilityLabel}
      style={{
        ...webTextStyle(scorePillLayout.text),
        display: 'inline-flex',
        alignItems: 'center',
        fontVariantNumeric: 'tabular-nums',
        color: v.foreground,
        backgroundColor: v.background,
        border: `${scorePillLayout.borderWidth}px solid ${v.border}`,
        borderRadius: scorePillLayout.borderRadius,
        padding: `${scorePillLayout.paddingVertical}px ${scorePillLayout.paddingHorizontal}px`,
        ...style,
      }}
    >
      {score}
    </span>
  );
}

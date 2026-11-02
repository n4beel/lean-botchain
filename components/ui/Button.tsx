"use client";

import { ButtonHTMLAttributes, CSSProperties, forwardRef } from "react";

type Variant = "primary" | "ghost" | "danger" | "release";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

/**
 * Lean button component.
 *
 * Four variants:
 *  - primary: coral accent fill (the one transaction: lean BOT)
 *  - ghost:   bordered, muted — secondary actions
 *  - danger:  danger-bordered — destructive confirmations
 *  - release: quiet underlined text button, per spec:
 *             "a quiet text button with a 'your weight will leave the tally' confirm"
 *
 * Three sizes: sm / md / lg. Most screens use md; lg is used for the
 * primary lean CTA on the poll detail page.
 *
 * The border-radius is 3px (var(--radius)) — slightly softer than the 2px
 * template but still square relative to the tilt bars.
 */

const variantStyles: Record<Variant, CSSProperties> = {
  primary: {
    background: "var(--accent)",
    color: "var(--accent-ink)",
  },
  ghost: {
    background: "transparent",
    border: "1px solid var(--border-default)",
    color: "var(--text-secondary)",
  },
  danger: {
    background: "transparent",
    border: "1px solid var(--danger)",
    color: "var(--danger)",
  },
  release: {
    background: "transparent",
    color: "var(--text-muted)",
    textDecoration: "underline",
    textUnderlineOffset: "3px",
    letterSpacing: "0.01em",
  },
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-1.5 text-[11px]",
  md: "px-5 py-2.5 text-[13px]",
  lg: "px-7 py-3.5 text-[14px]",
};

const Spinner = () => (
  <span
    className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin"
    aria-hidden="true"
  />
);

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading,
      disabled,
      children,
      className = "",
      style,
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={[
        "inline-flex items-center justify-center gap-2",
        "font-medium tracking-[0.03em] uppercase transition-opacity",
        "cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed",
        sizeClasses[size],
        className,
      ].join(" ")}
      style={{
        borderRadius: "var(--radius)",
        fontFamily: "var(--font-sans)",
        ...variantStyles[variant],
        ...style,
      }}
      {...props}
    >
      {loading ? (
        <>
          <Spinner />
          {children}
        </>
      ) : (
        children
      )}
    </button>
  ),
);

Button.displayName = "Button";
export default Button;

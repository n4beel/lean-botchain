import { HTMLAttributes } from "react";

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
  noPadding?: boolean;
  /** Applies the .lean-surface class for the standard aqua-tinted bordered card */
  surface?: boolean;
}

/**
 * Lean surface panel.
 *
 * Wraps the aqua tint palette. Most Lean content lives in white cards on the
 * aqua ground — the `surface` prop applies the .lean-surface CSS class which
 * sets bg-surface (#FFFFFF) + border-subtle (#D5F2EE) + radius-md (6px).
 *
 * The tilt bars themselves are rendered directly in TiltScale, not in a Panel,
 * because they need the full container width without padding.
 */
export default function Panel({
  elevated,
  noPadding,
  surface,
  children,
  className = "",
  style,
  ...props
}: PanelProps) {
  return (
    <div
      className={[
        surface ? "lean-surface" : "",
        noPadding ? "" : "p-5",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        surface
          ? style
          : {
              background: elevated ? "var(--bg-elevated)" : "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              ...style,
            }
      }
      {...props}
    >
      {children}
    </div>
  );
}

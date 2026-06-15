import React from "react";

export type PixelBadgeTone = "online" | "muted" | "info" | "warn";

export interface PixelBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: PixelBadgeTone;
}

/** Small status pill. */
export const PixelBadge = React.forwardRef<HTMLSpanElement, PixelBadgeProps>(
  function PixelBadge({ tone = "muted", className, children, ...rest }, ref) {
    const cls = ["px-badge", `px-badge--${tone}`, className]
      .filter(Boolean)
      .join(" ");
    return (
      <span ref={ref} className={cls} {...rest}>
        {children}
      </span>
    );
  },
);

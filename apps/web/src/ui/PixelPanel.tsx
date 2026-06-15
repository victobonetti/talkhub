import React from "react";

export type PixelPanelTone = "default" | "raised" | "inset";

export interface PixelPanelProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Optional title bar rendered above children. Overrides the native
   *  string-only `title` attribute so callers can pass rich nodes. */
  title?: React.ReactNode;
  tone?: PixelPanelTone;
}

/** Chunky bordered card/container with optional title bar. */
export const PixelPanel = React.forwardRef<HTMLDivElement, PixelPanelProps>(
  function PixelPanel(
    { title, tone = "default", className, children, ...rest },
    ref,
  ) {
    const cls = ["px-panel", `px-panel--${tone}`, className]
      .filter(Boolean)
      .join(" ");

    return (
      <div ref={ref} className={cls} {...rest}>
        {title != null && <span className="px-panel__title">{title}</span>}
        {children}
      </div>
    );
  },
);

import React from "react";

export type PixelToolbarProps = React.HTMLAttributes<HTMLDivElement>;

/** Flex row container for grouping buttons/controls with consistent gap. */
export const PixelToolbar = React.forwardRef<
  HTMLDivElement,
  PixelToolbarProps
>(function PixelToolbar({ className, children, ...rest }, ref) {
  const cls = ["px-toolbar", className].filter(Boolean).join(" ");
  return (
    <div ref={ref} className={cls} {...rest}>
      {children}
    </div>
  );
});

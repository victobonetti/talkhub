import React from "react";

export type PixelSelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

/** Styled pixel-art select. Children are <option>s. */
export const PixelSelect = React.forwardRef<
  HTMLSelectElement,
  PixelSelectProps
>(function PixelSelect({ className, children, ...rest }, ref) {
  const cls = ["px-field", "px-select", className].filter(Boolean).join(" ");
  return (
    <select ref={ref} className={cls} {...rest}>
      {children}
    </select>
  );
});

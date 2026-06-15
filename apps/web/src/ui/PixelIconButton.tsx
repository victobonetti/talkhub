import React from "react";
import type { PixelButtonVariant, PixelButtonSize } from "./PixelButton";

export interface PixelIconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PixelButtonVariant;
  size?: PixelButtonSize;
}

/** Square, compact button for icons/emoji. */
export const PixelIconButton = React.forwardRef<
  HTMLButtonElement,
  PixelIconButtonProps
>(function PixelIconButton(
  { variant = "default", size = "md", className, type, children, ...rest },
  ref,
) {
  const cls = [
    "px-btn",
    "px-iconbtn",
    `px-btn--${variant}`,
    `px-btn--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button ref={ref} type={type ?? "button"} className={cls} {...rest}>
      {children}
    </button>
  );
});

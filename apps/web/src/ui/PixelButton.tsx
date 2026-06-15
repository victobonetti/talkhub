import React from "react";

export type PixelButtonVariant = "primary" | "default" | "ghost" | "danger";
export type PixelButtonSize = "sm" | "md";

export interface PixelButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PixelButtonVariant;
  size?: PixelButtonSize;
}

/** Chunky pixel-art button with tactile press. */
export const PixelButton = React.forwardRef<
  HTMLButtonElement,
  PixelButtonProps
>(function PixelButton(
  { variant = "default", size = "md", className, type, children, ...rest },
  ref,
) {
  const cls = [
    "px-btn",
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

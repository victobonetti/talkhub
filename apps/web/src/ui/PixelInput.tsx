import React from "react";

export type PixelInputProps = React.InputHTMLAttributes<HTMLInputElement>;

/** Styled pixel-art text input. Forwards all native input props. */
export const PixelInput = React.forwardRef<HTMLInputElement, PixelInputProps>(
  function PixelInput({ className, type, ...rest }, ref) {
    const cls = ["px-field", "px-input", className].filter(Boolean).join(" ");
    return <input ref={ref} type={type ?? "text"} className={cls} {...rest} />;
  },
);

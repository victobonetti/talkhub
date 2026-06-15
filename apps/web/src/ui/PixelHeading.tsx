import React from "react";

export type PixelHeadingAs = "h1" | "h2" | "h3";

export interface PixelHeadingProps
  extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: PixelHeadingAs;
}

/** Pixel display-font heading. */
export const PixelHeading = React.forwardRef<
  HTMLHeadingElement,
  PixelHeadingProps
>(function PixelHeading({ as = "h2", className, children, ...rest }, ref) {
  const Tag = as;
  const cls = ["px-heading", `px-heading--${as}`, className]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag ref={ref} className={cls} {...rest}>
      {children}
    </Tag>
  );
});

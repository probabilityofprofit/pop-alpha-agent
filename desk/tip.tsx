import type { ElementType, ReactNode } from "react";

type TipProps = {
  tip: string;
  children: ReactNode;
  className?: string;
  /** Prefer below for topbar / panel heads so the tip is not clipped. */
  below?: boolean;
  as?: ElementType;
};

/** Hover / focus tooltip. Uses data-tip; keep copy short. */
export function Tip({ tip, children, className, below = false, as: Tag = "span" }: TipProps) {
  return (
    <Tag
      className={["tip", className].filter(Boolean).join(" ")}
      data-tip={tip}
      data-tip-pos={below ? "below" : undefined}
      tabIndex={0}
    >
      {children}
    </Tag>
  );
}

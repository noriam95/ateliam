import { cn } from "@/lib/utils";

type BFFlowMarkProps = {
  className?: string;
  markClassName?: string;
  variant?: "theme" | "color" | "white";
};

export function BFFlowMark({ className, markClassName, variant = "theme" }: BFFlowMarkProps) {
  const colorClass =
    variant === "color"
      ? "block"
      : variant === "white"
        ? "hidden"
        : "block dark:hidden";
  const whiteClass =
    variant === "white"
      ? "block"
      : variant === "color"
        ? "hidden"
        : "hidden dark:block";

  return (
    <span
      aria-label="BF Flow"
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
    >
      <img
        src="/brand/bom-futuro-light.png"
        alt=""
        aria-hidden="true"
        className={cn(colorClass, "h-full w-auto object-contain", markClassName)}
      />
      <img
        src="/brand/bom-futuro-dark.png"
        alt=""
        aria-hidden="true"
        className={cn(whiteClass, "h-full w-auto object-contain", markClassName)}
      />
    </span>
  );
}

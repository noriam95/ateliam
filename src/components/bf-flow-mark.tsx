import { cn } from "@/lib/utils";

type BFFlowMarkProps = {
  className?: string;
  markClassName?: string;
};

export function BFFlowMark({ className, markClassName }: BFFlowMarkProps) {
  return (
    <span
      aria-label="BF Flow"
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
    >
      <img
        src="/brand/bom-futuro-light.png"
        alt=""
        aria-hidden="true"
        className={cn("block h-full w-auto object-contain dark:hidden", markClassName)}
      />
      <img
        src="/brand/bom-futuro-dark.png"
        alt=""
        aria-hidden="true"
        className={cn("hidden h-full w-auto object-contain dark:block", markClassName)}
      />
    </span>
  );
}

import { cn } from "@/lib/utils";

type AteliamMarkProps = {
  className?: string;
  markClassName?: string;
};

export function AteliamMark({ className, markClassName }: AteliamMarkProps) {
  return (
    <span
      aria-label="Ateliam"
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-lg bg-background/10 text-brand",
        className,
      )}
    >
      <span
        className={cn(
          "relative block rounded-full border-2 border-current",
          "after:absolute after:left-1/2 after:top-1/2 after:block after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-current after:content-['']",
          markClassName,
        )}
      />
    </span>
  );
}

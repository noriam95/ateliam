import { cn } from "@/lib/utils";

type BFFlowMarkProps = {
  className?: string;
  markClassName?: string;
};

export function BFFlowMark({ className }: BFFlowMarkProps) {
  return (
    <span
      aria-label="BF Flow"
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
    >
      <svg
        viewBox="0 0 520 980"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-auto"
        role="img"
      >
        {/* Folha verde — superior esquerda */}
        <path
          d="M340 10 C300 60 240 140 170 240 C100 340 40 430 10 510
             C50 450 110 360 180 260 C255 155 310 70 340 10 Z"
          fill="#1BAA72"
        />
        {/* Lâmina teal — diagonal principal */}
        <path
          d="M470 140 C445 210 400 300 340 410 C270 535 185 670 100 800
             C75 840 55 875 42 900
             C70 845 110 780 165 700 C240 585 325 455 390 335
             C435 255 460 190 470 140 Z"
          fill="#1A8AAD"
        />
        {/* Gota dourada — inferior direita */}
        <path
          d="M318 495 C270 545 215 605 175 678 C120 775 118 860 195 910
             C272 960 390 952 460 878 C518 816 522 710 478 626
             C442 555 385 508 318 495 Z"
          fill="#F5B324"
        />
      </svg>
    </span>
  );
}

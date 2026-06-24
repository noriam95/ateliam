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
        viewBox="0 0 1019 1933"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-auto"
        role="img"
      >
        {/* Folha verde — chama superior-esquerda */}
        <path
          d="M705 18
             C640 180, 520 420, 380 660
             C250 880, 140 1000, 50 1082
             C180 920, 330 680, 470 440
             C580 250, 660 90, 705 18 Z"
          fill="#1A9E6F"
        />
        {/* Lâmina teal — varredura principal */}
        <path
          d="M935 335
             C880 520, 760 760, 600 1020
             C420 1310, 230 1620, 95 1830
             C80 1865, 72 1890, 70 1905
             C140 1740, 260 1520, 410 1270
             C580 990, 760 710, 870 510
             C905 445, 925 385, 935 335 Z"
          fill="#157E9B"
        />
        {/* Gota dourada — pétala inferior-direita */}
        <path
          d="M638 985
             C545 1075, 440 1175, 360 1300
             C250 1470, 240 1620, 360 1700
             C490 1788, 690 1775, 810 1660
             C915 1555, 925 1370, 850 1230
             C785 1108, 715 1020, 638 985 Z"
          fill="#F5B324"
        />
      </svg>
    </span>
  );
}

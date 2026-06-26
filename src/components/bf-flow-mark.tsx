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
        viewBox="0 0 260 260"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-auto"
        role="img"
      >
        {/*
          Três gotas idênticas em diagonal (verde → teal → dourado).
          A forma da gota é definida uma vez e reutilizada via transform
          (translate até o centro · rotação · escala · centraliza), de modo
          que todas renderizam completas em qualquer tamanho.
        */}
        <defs>
          <path
            id="bf-drop"
            d="M90 10
               C128 56 150 104 110 150
               C74 182 30 162 30 118
               C30 78 58 44 90 10 Z"
          />
        </defs>
        <use
          href="#bf-drop"
          fill="#1BAA72"
          transform="translate(178 66) rotate(-35) scale(0.62) translate(-90 -96)"
        />
        <use
          href="#bf-drop"
          fill="#1A8AAD"
          transform="translate(130 130) rotate(-35) scale(0.62) translate(-90 -96)"
        />
        <use
          href="#bf-drop"
          fill="#F5B324"
          transform="translate(82 194) rotate(-35) scale(0.62) translate(-90 -96)"
        />
      </svg>
    </span>
  );
}

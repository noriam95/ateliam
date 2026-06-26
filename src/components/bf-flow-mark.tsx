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
      <svg viewBox="0 0 180 340" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-full w-auto">
        <path
          d="M18 285 C18 235 40 170 68 118 C88 78 115 45 132 18 C140 6 148 3 151 9 C136 36 108 82 88 130 C68 178 54 228 48 270 C43 295 33 308 22 308 C19 308 18 298 18 285Z"
          fill="#00A878"
        />
        <path
          d="M5 318 C5 292 24 255 54 210 C80 168 112 128 136 86 C154 52 166 26 168 18 C170 12 172 16 170 26 C160 58 140 98 114 142 C87 188 60 232 42 276 C29 307 18 328 10 332 C6 334 5 328 5 318Z"
          fill="#1B7E96"
        />
        <path
          d="M78 192 C96 162 138 152 158 170 C172 184 170 214 163 236 C153 264 136 298 114 310 C94 320 74 308 67 287 C59 266 60 238 67 216 C72 204 76 197 78 192Z"
          fill="#F5A623"
        />
      </svg>
    </span>
  );
}

import type { Reason } from "@/lib/match/score";
import { cn } from "@/components/ui/cn";

const TONE: Record<Reason["tone"], string> = {
  good: "bg-success-soft text-success",
  ok: "bg-secondary text-foreground/70",
  bad: "bg-warning-soft text-warning",
  block: "bg-danger-soft text-danger",
};

export function ReasonChips({ reasons }: { reasons: Reason[] }) {
  const order: Reason["factor"][] = ["location", "skills", "nice", "domain", "degree", "years", "availability", "status", "consent"];
  const sorted = [...reasons].sort((a, b) => order.indexOf(a.factor) - order.indexOf(b.factor));
  return (
    <div className="flex flex-wrap gap-1">
      {sorted
        .filter((r) => !(r.tone === "ok" && r.points === r.max && r.factor !== "skills"))
        .map((r, i) => (
          <span key={i} className={cn("rounded-md px-1.5 py-0.5 text-[11px] leading-4", TONE[r.tone])} title={r.max ? `${r.points} of ${r.max} points` : undefined}>
            {r.text}
            {r.max ? <span className="ml-1 opacity-60">{r.points}/{r.max}</span> : null}
          </span>
        ))}
    </div>
  );
}

export function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="tabular w-7 text-right font-medium text-foreground">{score}</span>
      <div className="h-1 w-16 overflow-hidden rounded-full bg-secondary">
        <div className={cn("h-1 rounded-full", score >= 75 ? "bg-success" : score >= 50 ? "bg-foreground/60" : "bg-warning")} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}


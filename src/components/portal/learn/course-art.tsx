// The line drawings on Learn cards (courses.art), in the FynoLabs house style (the playbook's
// playart.py and the website's LandingArt): hairline strokes, square nodes, the brand blue for the
// one thing that matters, no fills beyond white. Each drawing is 240 x 140 and scales to its box.
import type { ReactNode } from "react";
import { artKey, type ArtKey } from "@/lib/learn/labels";
import { cn } from "@/components/ui/cn";

const ns = { vectorEffect: "non-scaling-stroke" as const };

/** A muted hairline (opacity as in playart: 0.2 to 0.5). */
function Line({ d, o = 0.45, w = 1, dash }: { d: string; o?: number; w?: number; dash?: string }) {
  return <path d={d} className="stroke-muted-foreground" strokeOpacity={o} strokeWidth={w} strokeDasharray={dash} strokeLinecap="square" fill="none" {...ns} />;
}
/** A blue stroke. */
function Blue({ d, w = 1.5, dash }: { d: string; w?: number; dash?: string }) {
  return <path d={d} className="stroke-primary" strokeWidth={w} strokeDasharray={dash} strokeLinecap="square" fill="none" {...ns} />;
}
/** Thick muted bars that stand for lines of text. */
function TextLines({ rows, w = 4, o = 0.22 }: { rows: [number, number, number][]; w?: number; o?: number }) {
  return <path d={rows.map(([x, y, len]) => `M${x} ${y}h${len}`).join("")} className="stroke-muted-foreground" strokeOpacity={o} strokeWidth={w} strokeLinecap="butt" fill="none" />;
}
/** A white panel with a hairline border. */
function Panel({ x, y, w, h, blue, dash, o = 0.4 }: { x: number; y: number; w: number; h: number; blue?: boolean; dash?: string; o?: number }) {
  return <rect x={x} y={y} width={w} height={h} className={cn("fill-card", blue ? "stroke-primary" : "stroke-muted-foreground")} strokeOpacity={blue ? 1 : o} strokeWidth={blue ? 1.25 : 1} strokeDasharray={dash} {...ns} />;
}
/** A square node: filled blue, filled muted, or a hollow outline. */
function Node({ x, y, r = 3, tone = "blue" }: { x: number; y: number; r?: number; tone?: "blue" | "muted" | "hollow" | "outline-blue" }) {
  if (tone === "hollow") return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} className="fill-card stroke-muted-foreground" strokeOpacity={0.6} {...ns} />;
  if (tone === "outline-blue") return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} className="fill-card stroke-primary" strokeWidth={1.25} {...ns} />;
  return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} className={tone === "blue" ? "fill-primary" : "fill-muted-foreground"} fillOpacity={tone === "muted" ? 0.45 : 1} />;
}
/** A blue square with a white tick: the verdict. */
function Tick({ x, y, r = 8 }: { x: number; y: number; r?: number }) {
  return (
    <g>
      <rect x={x - r} y={y - r} width={2 * r} height={2 * r} className="fill-primary" />
      <path d={`M${x - r * 0.45} ${y}l${r * 0.35} ${r * 0.35} ${r * 0.6} -${r * 0.7}`} className="stroke-primary-foreground" strokeWidth={1.5} strokeLinecap="butt" fill="none" {...ns} />
    </g>
  );
}

/** The playbook: an open booklet, its right page holding four parts that must agree. */
function Booklet() {
  return (
    <>
      <Panel x={28} y={20} w={92} h={100} />
      <Panel x={120} y={20} w={92} h={100} />
      <TextLines rows={[[40, 38, 44]]} w={5} o={0.4} />
      <TextLines rows={[[40, 54, 64], [40, 64, 56], [40, 74, 66], [40, 84, 48], [40, 94, 60], [40, 104, 38]]} w={2.5} o={0.2} />
      <TextLines rows={[[132, 38, 40]]} w={5} o={0.4} />
      <Line d="M138 74h52" o={0.35} dash="2 4" />
      <Node x={138} y={74} r={5} tone="hollow" />
      <Node x={155} y={74} r={5} tone="hollow" />
      <Node x={172} y={74} r={5} tone="hollow" />
      <Node x={190} y={74} r={6} />
      <TextLines rows={[[132, 98, 56], [132, 106, 44]]} w={2.5} o={0.2} />
      <path d="M194 20v20l5-4 5 4V20" className="fill-primary" />
    </>
  );
}

/** Terminal-Bench: a terminal, a blinking cursor, and the machine checked: 1. */
function Terminal() {
  return (
    <>
      <Panel x={18} y={14} w={204} h={112} />
      <Line d="M18 32h204" o={0.25} />
      <Node x={30} y={23} r={2} tone="muted" />
      <Node x={40} y={23} r={2} tone="muted" />
      <Node x={50} y={23} r={2} tone="muted" />
      <Line d="M30 48l5 4-5 4M30 76l5 4-5 4" o={0.55} />
      <TextLines rows={[[42, 52, 78], [42, 64, 104], [42, 80, 56]]} w={4} o={0.22} />
      <rect x={102} y={74} width={6} height={12} className="fill-primary" />
      <Line d="M30 104h120" o={0.2} />
      <Blue d="M30 104h28" w={2} />
      <Tick x={198} y={104} r={9} />
    </>
  );
}

/** PaperBench: a rubric tree; leaves pass (blue) or fail (hollow), scores flow up. */
function Rubric() {
  const mids = [64, 120, 176];
  const leaves = [
    [44, "blue"],
    [64, "blue"],
    [84, "hollow"],
    [108, "blue"],
    [132, "blue"],
    [160, "blue"],
    [176, "hollow"],
    [192, "blue"],
  ] as const;
  const parent = (x: number) => (x < 96 ? 64 : x < 148 ? 120 : 176);
  return (
    <>
      <Line d={mids.map((m) => `M120 30L${m} 66`).join("")} o={0.4} />
      <Line d={leaves.map(([x]) => `M${parent(x)} 66L${x} 106`).join("")} o={0.3} />
      <Node x={120} y={26} r={7} tone="outline-blue" />
      <Node x={120} y={26} r={3} />
      {mids.map((m) => (
        <Node key={m} x={m} y={66} r={5} tone="hollow" />
      ))}
      {leaves.map(([x, tone]) => (
        <Node key={x} x={x} y={108} r={4} tone={tone} />
      ))}
      <Line d="M40 126h160" o={0.2} />
      <Blue d="M40 126h118" w={2} />
    </>
  );
}

/** ML tasks: runs as dots, weak baselines below a dashed blue pass bar, the oracle's runs above it. */
function Ml() {
  const base = [
    [46, 100],
    [62, 94],
    [78, 104],
    [94, 96],
    [110, 102],
  ];
  const oracle = [
    [140, 46],
    [156, 40],
    [172, 50],
    [188, 42],
    [204, 48],
  ];
  return (
    <>
      <Line d="M30 18V118H218" o={0.4} />
      <Line d="M30 98h-4M30 70h-4M30 42h-4" o={0.3} />
      <Blue d="M30 70H218" w={1.25} dash="4 4" />
      {base.map(([x, y]) => (
        <Node key={`b${x}`} x={x} y={y} r={3.5} tone="hollow" />
      ))}
      {oracle.map(([x, y]) => (
        <Node key={`o${x}`} x={x} y={y} r={3.5} />
      ))}
    </>
  );
}

/** RL: the environment (the paper) inside the harness (the exam hall), and the loop: try, score, again. */
function Loop() {
  return (
    <>
      <Panel x={14} y={12} w={212} h={116} dash="3 4" o={0.45} />
      <Panel x={32} y={30} w={96} h={80} />
      <TextLines rows={[[44, 46, 52]]} w={4} o={0.4} />
      <TextLines rows={[[44, 60, 70], [44, 70, 60], [44, 80, 66], [44, 90, 44]]} w={2.5} o={0.2} />
      <Line d="M152 70a26 26 0 1 1 26 26" o={0.45} />
      <Blue d="M178 96a26 26 0 0 1 -26 -26" w={1.5} />
      <Blue d="M147 71l5-6 5 6" w={1.5} />
      <Node x={178} y={70} r={6} />
      <Line d="M128 70h20" o={0.35} dash="2 3" />
    </>
  );
}

/** Quality: three review gates; only the work that passes all three reaches the end. */
function Review() {
  const gates = [86, 136, 186];
  return (
    <>
      {gates.map((x) => (
        <g key={x}>
          <Line d={`M${x} 18V122`} o={0.35} dash="2 5" />
          <Blue d={`M${x} 62v16`} w={2} />
        </g>
      ))}
      <Line d="M28 34C58 34 62 60 80 60" o={0.4} />
      <Node x={80} y={60} r={3.5} tone="hollow" />
      <Line d="M28 106C58 106 70 84 98 84C112 84 118 80 130 80" o={0.4} />
      <Node x={130} y={80} r={3.5} tone="hollow" />
      <Blue d="M28 70H208" w={1.5} />
      <Node x={28} y={34} r={3} tone="muted" />
      <Node x={28} y={106} r={3} tone="muted" />
      <Node x={28} y={70} r={3.5} />
      <Tick x={216} y={70} r={8} />
    </>
  );
}

/** The AI Trainer Quiz: a question, two answer cards, one picked, and the 3-2-1 countdown. */
function Quiz() {
  return (
    <>
      <TextLines rows={[[60, 22, 120]]} w={5} o={0.4} />
      <Panel x={24} y={38} w={88} h={66} />
      <Panel x={128} y={38} w={88} h={66} blue />
      <TextLines rows={[[38, 62, 56], [38, 74, 40], [142, 62, 56], [142, 74, 44]]} w={3} o={0.22} />
      <rect x={36} y={86} width={10} height={10} className="fill-card stroke-muted-foreground" strokeOpacity={0.5} {...ns} />
      <Tick x={200} y={38} r={8} />
      <Node x={108} y={122} r={3} tone="muted" />
      <Node x={120} y={122} r={3} tone="muted" />
      <Node x={132} y={122} r={3} />
    </>
  );
}

/** Any other course: a path with stops, ending at a blue target. */
function Path() {
  return (
    <>
      <Line d="M128 66C142 66 142 28 156 28H182" o={0.45} dash="3 4" />
      <Line d="M20 104H58C76 104 76 66 94 66H128C146 66 146 100 164 100H184C202 100 202 44 220 44" o={0.4} />
      {[
        [58, 104],
        [94, 66],
        [128, 66],
        [164, 100],
        [184, 100],
      ].map(([x, y]) => (
        <Node key={x} x={x} y={y} r={3} tone="muted" />
      ))}
      <Node x={20} y={104} r={5} />
      <Node x={220} y={44} r={8} tone="outline-blue" />
      <Node x={220} y={44} r={3.5} />
    </>
  );
}

const DRAWINGS: Record<ArtKey, () => ReactNode> = { booklet: Booklet, terminal: Terminal, rubric: Rubric, ml: Ml, loop: Loop, review: Review, quiz: Quiz, path: Path };

/** The drawing alone (fills its box). */
export function CourseArt({ art, className }: { art: string | null | undefined; className?: string }) {
  const Draw = DRAWINGS[artKey(art)];
  return (
    <svg viewBox="0 0 240 140" fill="none" preserveAspectRatio="xMidYMid meet" className={cn("h-full w-full overflow-visible", className)} aria-hidden="true">
      <Draw />
    </svg>
  );
}

/** The drawing on a faint dot field, as on the website's cards. */
export function CourseArtPanel({ art, className }: { art: string | null | undefined; className?: string }) {
  return (
    <div
      className={cn("relative overflow-hidden bg-card", className)}
      style={{ backgroundImage: "radial-gradient(hsl(var(--muted-foreground) / 0.2) 0.9px, transparent 1px)", backgroundSize: "14px 14px", backgroundPosition: "7px 7px" }}
    >
      {/* top/bottom in % of the height, left/right of the width: the drawing keeps its margins at any size. */}
      <div className="absolute inset-x-[10%] inset-y-[11%]">
        <CourseArt art={art} />
      </div>
    </div>
  );
}

/** A small seal for a finished course (certificates). */
export function CertificateSeal({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={cn("h-12 w-12 shrink-0", className)} aria-hidden="true">
      <circle cx="24" cy="24" r="21" className="stroke-border" strokeDasharray="2 3" {...ns} />
      <circle cx="24" cy="24" r="15" className="stroke-primary" strokeWidth={1.25} {...ns} />
      <path d="M17.5 24.5l4.5 4.5 8.5-9" className="stroke-primary" strokeWidth={1.75} strokeLinecap="square" {...ns} />
    </svg>
  );
}

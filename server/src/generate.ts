import { N, W, FLOOR, WALL, KEY, EXIT, solve, validateLevel, type Level } from "../../shared/engine.ts";

export type Generated = {
  title: string;
  cells: number[];
  start: [number, number];
  move_cap: number;
  optimal_moves: number;
  source: "llm" | "procedural";
};

export const MAX_OPTIMAL = 36; // move_cap = optimal + 4 must stay <= 40
export const MIN_OPTIMAL = 4;

export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Turns a level into the response shape if it is valid and solvable. Otherwise null. */
export function finalize(
  title: string,
  cells: number[],
  start: [number, number],
  source: Generated["source"],
): Generated | null {
  if (cells.length !== N) return null;
  const probe: Level = { cells, start, moveCap: 40 };
  if ("error" in validateLevel(probe)) return null;
  const sol = solve(probe);
  if (!sol || sol.length < MIN_OPTIMAL || sol.length > MAX_OPTIMAL) return null;
  return {
    title: cleanTitle(title),
    cells,
    start,
    move_cap: sol.length + 4,
    optimal_moves: sol.length,
    source,
  };
}

export function cleanTitle(t: string): string {
  const s = t.replace(/[^\x20-\x7e]/g, "").replace(/\s+/g, " ").trim();
  return (s || "Untitled level").slice(0, 48).trim();
}

function titleFromSentence(sentence: string): string {
  const words = sentence.replace(/[^A-Za-z0-9' -]/g, " ").split(/\s+/).filter(Boolean).slice(0, 5);
  if (!words.length) return "Untitled level";
  return words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

/** Hand-made level that is always valid; last resort so the demo never fails. */
const FALLBACK_ROWS = ["0000K3", "011110", "0K0000", "010110", "000K00", "110001"];

export function fallbackLevel(title: string): Generated {
  const cells = FALLBACK_ROWS.join("").replace(/K/g, "2").split("").map(Number);
  // start at (0,5)? that is a wall; use (0,0)
  const g = finalize(title, cells, [0, 0], "procedural");
  if (!g) throw new Error("fallback level is broken");
  return g;
}

export function proceduralLevel(sentence: string): Generated {
  const rng = mulberry32(hashString(sentence.trim().toLowerCase()));
  const title = titleFromSentence(sentence);
  let best: Generated | null = null;
  for (let attempt = 0; attempt < 4000; attempt++) {
    const density = 0.18 + rng() * 0.17;
    const cells = new Array(N).fill(FLOOR);
    for (let i = 0; i < N; i++) if (rng() < density) cells[i] = WALL;
    const free = cells.map((c, i) => (c === FLOOR ? i : -1)).filter((i) => i >= 0);
    const nKeys = 1 + Math.floor(rng() * 3);
    if (free.length < nKeys + 2) continue;
    // draw distinct cells
    const pick = () => free.splice(Math.floor(rng() * free.length), 1)[0];
    const s = pick();
    const e = pick();
    cells[e] = EXIT;
    for (let k = 0; k < nKeys; k++) cells[pick()] = KEY;
    const g = finalize(title, cells, [s % W, (s / W) | 0], "procedural");
    if (!g) continue;
    if (!best || g.optimal_moves > best.optimal_moves) best = g;
    if (g.optimal_moves >= 14 && g.optimal_moves <= 30) return g;
  }
  return best ?? fallbackLevel(title);
}

// TypeScript reference of programs/prompt2play/src/engine.rs.
// Same rules, same error names, checked against the same fixtures (fixtures/replay.json).
//
// Grid 6x6 row-major. Cells: 0 floor, 1 wall, 2 key, 3 exit.
// The exit blocks movement until every key is collected. A blocked move or a move off the
// grid changes nothing but counts. Keys are collected by standing on them (start included).
// The run ends when the exit is entered; extra moves after that are rejected.

export const W = 6;
export const N = 36;
export const MAX_KEYS = 3;
export const MAX_MOVES = 40;
export const FLOOR = 0, WALL = 1, KEY = 2, EXIT = 3;

export type Level = { cells: number[]; start: [number, number]; moveCap: number };
export type LevelError =
  | "BadCell" | "BadStart" | "StartOnWall" | "StartOnExit" | "NoExit"
  | "TooManyExits" | "TooManyKeys" | "BadMoveCap" | "Unreachable";
export type RunError = "Empty" | "TooManyMoves" | "BadMove" | "NotSolved" | "TrailingMoves";

/** 0..3 = U D L R */
export const MOVE_CHARS = "UDLR";
export const DELTAS: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];

export function movesFromString(s: string): number[] {
  return [...s].map((c) => {
    const i = MOVE_CHARS.indexOf(c);
    return i < 0 ? 9 : i;
  });
}
export const movesToString = (m: number[]) => m.map((i) => MOVE_CHARS[i]).join("");

export function rowsToCells(rows: string[]): number[] {
  return rows.join("").split("").map(Number);
}

/** Returns number of keys, or a LevelError. Mirrors validate_level in Rust. */
export function validateLevel(l: Level): { keys: number } | { error: LevelError } {
  const { cells, start, moveCap } = l;
  if (moveCap < 1 || moveCap > MAX_MOVES) return { error: "BadMoveCap" };
  if (start[0] < 0 || start[0] >= W || start[1] < 0 || start[1] >= W) return { error: "BadStart" };
  let keys = 0, exits = 0;
  for (const c of cells) {
    if (c === KEY) keys++;
    else if (c === EXIT) exits++;
    else if (c !== FLOOR && c !== WALL) return { error: "BadCell" };
  }
  if (cells.length !== N) return { error: "BadCell" };
  if (exits === 0) return { error: "NoExit" };
  if (exits > 1) return { error: "TooManyExits" };
  if (keys > MAX_KEYS) return { error: "TooManyKeys" };
  const s = start[1] * W + start[0];
  if (cells[s] === WALL) return { error: "StartOnWall" };
  if (cells[s] === EXIT) return { error: "StartOnExit" };
  const seen = new Array(N).fill(false);
  const stack = [s];
  seen[s] = true;
  let keysSeen = 0, exitTouched = false;
  while (stack.length) {
    const i = stack.pop()!;
    if (cells[i] === KEY) keysSeen++;
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of DELTAS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue;
      const j = ny * W + nx;
      if (cells[j] === WALL || seen[j]) continue;
      if (cells[j] === EXIT) { exitTouched = true; continue; }
      seen[j] = true;
      stack.push(j);
    }
  }
  if (keysSeen !== keys || !exitTouched) return { error: "Unreachable" };
  return { keys };
}

export type Step = { x: number; y: number; keysLeft: number; cells: number[]; done: boolean };

/** Applies one move to a game state (used by the UI and by replay). */
export function step(level: Level, st: { x: number; y: number; cells: number[]; keysLeft: number }, m: number):
  { x: number; y: number; cells: number[]; keysLeft: number; won: boolean } | "BadMove" {
  const d = DELTAS[m];
  if (!d) return "BadMove";
  const nx = st.x + d[0], ny = st.y + d[1];
  if (nx < 0 || ny < 0 || nx >= W || ny >= W) return { ...st, won: false };
  const c = st.cells[ny * W + nx];
  if (c === WALL) return { ...st, won: false };
  if (c === EXIT) {
    if (st.keysLeft > 0) return { ...st, won: false };
    return { ...st, x: nx, y: ny, won: true };
  }
  const cells = st.cells;
  if (c === KEY) {
    const next = cells.slice();
    next[ny * W + nx] = FLOOR;
    return { x: nx, y: ny, cells: next, keysLeft: st.keysLeft - 1, won: false };
  }
  return { x: nx, y: ny, cells, keysLeft: st.keysLeft, won: false };
}

export function initialState(level: Level) {
  const cells = level.cells.slice();
  let keysLeft = cells.filter((c) => c === KEY).length;
  const [x, y] = level.start;
  if (cells[y * W + x] === KEY) {
    cells[y * W + x] = FLOOR;
    keysLeft--;
  }
  return { x, y, cells, keysLeft };
}

/** Mirrors replay in Rust. Returns steps used or a RunError. */
export function replay(level: Level, moves: number[]): { steps: number } | { error: RunError } {
  if (moves.length === 0) return { error: "Empty" };
  if (moves.length > level.moveCap || moves.length > MAX_MOVES) return { error: "TooManyMoves" };
  let st = initialState(level);
  for (let n = 0; n < moves.length; n++) {
    const r = step(level, st, moves[n]);
    if (r === "BadMove") return { error: "BadMove" };
    if (r.won) return n + 1 === moves.length ? { steps: moves.length } : { error: "TrailingMoves" };
    st = r;
  }
  return { error: "NotSolved" };
}

/** Shortest solution by BFS over (position, collected keys). null if unsolvable. */
export function solve(level: Level): number[] | null {
  const keyIdx = new Map<number, number>();
  level.cells.forEach((c, i) => { if (c === KEY) keyIdx.set(i, keyIdx.size); });
  const full = (1 << keyIdx.size) - 1;
  const [sx, sy] = level.start;
  const s = sy * W + sx;
  const startMask = keyIdx.has(s) ? 1 << keyIdx.get(s)! : 0;
  const key = (p: number, m: number) => p * 8 + m;
  const prev = new Map<number, [number, number]>(); // state -> [prev state, move]
  const first = key(s, startMask);
  prev.set(first, [-1, -1]);
  let frontier = [first];
  while (frontier.length) {
    const next: number[] = [];
    for (const cur of frontier) {
      const p = (cur / 8) | 0, mask = cur % 8;
      const x = p % W, y = (p / W) | 0;
      for (let m = 0; m < 4; m++) {
        const nx = x + DELTAS[m][0], ny = y + DELTAS[m][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue;
        const j = ny * W + nx;
        const c = level.cells[j];
        if (c === WALL) continue;
        if (c === EXIT) {
          if (mask !== full) continue;
          const out = [m];
          let k = cur;
          while (prev.get(k)![0] !== -1) {
            const [pk, pm] = prev.get(k)!;
            out.push(pm);
            k = pk;
          }
          return out.reverse();
        }
        const nm = c === KEY ? mask | (1 << keyIdx.get(j)!) : mask;
        const nk = key(j, nm);
        if (prev.has(nk)) continue;
        prev.set(nk, [cur, m]);
        next.push(nk);
      }
    }
    frontier = next;
  }
  return null;
}

/** Account layout helpers. */
export function packMoves(moves: number[]): Uint8Array {
  const out = new Uint8Array(MAX_MOVES / 4);
  moves.slice(0, MAX_MOVES).forEach((m, i) => { out[i >> 2] |= (m & 3) << ((i & 3) * 2); });
  return out;
}
export function unpackMoves(packed: Uint8Array, len: number): number[] {
  return Array.from({ length: Math.min(len, MAX_MOVES) }, (_, i) => (packed[i >> 2] >> ((i & 3) * 2)) & 3);
}

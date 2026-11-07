import { finalize, MIN_OPTIMAL, MAX_OPTIMAL, type Generated } from "./generate.ts";
import { validateLevel, solve, DELTAS, W, WALL, EXIT, type Level } from "../../shared/engine.ts";

// The model draws the level as ASCII. We convert and verify everything ourselves.
const CHARS: Record<string, number> = { ".": 0, "#": 1, K: 2, E: 3 };

export const SCHEMA = {
  name: "level",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["title", "rows"],
    properties: {
      title: { type: "string", description: "Short level name, at most 40 characters" },
      rows: {
        type: "array",
        minItems: 6,
        maxItems: 6,
        items: {
          type: "string",
          description: "Exactly 6 characters from: . floor, # wall, K key, E exit, S start",
        },
      },
    },
  },
} as const;

const SYSTEM = [
  "Design one puzzle level on a 6x6 grid inspired by the player's sentence; output JSON only.",
  "Characters: . floor, # wall, K key, E exit, S start. Exactly one S, one E, and 0 to 3 K.",
  "Design the path first, then add walls. Keep every key and the exit connected by an open floor path from S without passing through E.",
  "The player moves orthogonally; walls block movement and E stays locked until all keys are collected.",
  "Aim for a shortest solution of 12 to 28 moves (allowed 4 to 36).",
  'Valid example: {"title":"Walk","rows":["S....E","######","######","######","######","######"]}.',
].join(" ");

type Evaluation = { level: Generated } | { reason: string; feedback: string };

/** Coordinates in diagnostics are zero-based, matching the grid indices. */
function unreachableFeedback(cells: number[], start: [number, number]): string {
  const seen = new Set<number>([start[1] * W + start[0]]);
  const stack = [...seen];
  const exits = new Set<number>();
  while (stack.length) {
    const i = stack.pop()!;
    for (const [dx, dy] of DELTAS) {
      const x = i % W + dx, y = Math.floor(i / W) + dy;
      if (x < 0 || y < 0 || x >= W || y >= W) continue;
      const j = y * W + x;
      if (cells[j] === WALL || seen.has(j)) continue;
      if (cells[j] === EXIT) { exits.add(j); continue; }
      seen.add(j);
      stack.push(j);
    }
  }
  const cutOff = cells.flatMap((c, i) =>
    c !== WALL && !(c === EXIT ? exits.has(i) : seen.has(i))
      ? [`row ${Math.floor(i / W)}, col ${i % W}`] : []);
  return `Unreachable cells (zero-based): ${cutOff.join("; ")}. Remove walls to connect every key and E to S by open floor paths without passing through E. The exit may stay locked until all keys are collected.`;
}

export function evaluateLevel(raw: unknown): Evaluation {
  const reject = (reason: string, feedback: string): Evaluation => ({ reason, feedback });
  if (!raw || typeof raw !== "object") return reject("BadShape", "Return an object with a title and six rows of six characters each.");
  const { title, rows } = raw as { title?: unknown; rows?: unknown };
  if (typeof title !== "string" || !Array.isArray(rows) || rows.length !== 6 ||
      rows.some(row => typeof row !== "string" || row.length !== 6)) {
    return reject("BadShape", "Provide a string title and exactly six rows of six characters each.");
  }
  const cells: number[] = [];
  let start: [number, number] | null = null;
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 6; x++) {
      const ch = (rows[y] as string)[x].toUpperCase();
      if (ch === "S") {
        if (start) return reject("MultipleStart", "Use exactly one S start cell.");
        start = [x, y];
        cells.push(0);
      } else if (Object.hasOwn(CHARS, ch)) cells.push(CHARS[ch]);
      else return reject("BadChar", "Use only ., #, K, E, and S in the grid.");
    }
  }
  if (!start) return reject("NoStart", "Add exactly one S start cell.");
  const probe: Level = { cells, start, moveCap: 40 };
  const validation = validateLevel(probe);
  if ("error" in validation) {
    const instructions: Record<string, string> = {
      NoExit: "Add exactly one E exit cell.",
      TooManyExits: "Keep exactly one E exit cell.",
      TooManyKeys: "Use at most three K key cells.",
    };
    return reject(validation.error, validation.error === "Unreachable"
      ? unreachableFeedback(cells, start)
      : instructions[validation.error] ?? `Fix ${validation.error} using valid grid cells and a floor start.`);
  }
  const solution = solve(probe);
  if (!solution) return reject("Unreachable", unreachableFeedback(cells, start));
  const length = solution.length;
  if (length < MIN_OPTIMAL || length > MAX_OPTIMAL) {
    return reject(length < MIN_OPTIMAL ? "TooShort" : "TooLong",
      `The shortest solution is ${length} ${length === 1 ? "move" : "moves"}. Adjust paths and keys to require ${MIN_OPTIMAL} to ${MAX_OPTIMAL} moves.`);
  }
  return { level: finalize(title, cells, start, "llm")! };
}

export function parseLevel(raw: unknown): Generated | null {
  const result = evaluateLevel(raw);
  return "level" in result ? result.level : null;
}

export type RepairOptions = { attempts: number; fetchImpl?: typeof fetch };

export async function llmLevelWithRepair(
  sentence: string, apiKey: string, model: string, { attempts, fetchImpl = globalThis.fetch }: RepairOptions,
): Promise<{ level: Generated | null; attempts: number; failures: string[] }> {
  const original = [{ role: "system", content: SYSTEM }, { role: "user", content: sentence }];
  let messages = [...original];
  const failures: string[] = [];
  const budget = Number.isFinite(attempts) ? Math.max(0, Math.floor(attempts)) : 0;
  for (let attempt = 1; attempt <= budget; attempt++) {
    let text: string;
    let raw: unknown;
    try {
      const res = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, temperature: 0.7, max_tokens: 400,
          response_format: { type: "json_schema", json_schema: SCHEMA }, messages }),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        failures.push(`Http${res.status}`);
        messages = [...original];
        continue;
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        failures.push("EmptyReply");
        messages = [...original];
        continue;
      }
      text = content;
      raw = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    } catch (error) {
      failures.push(error instanceof SyntaxError ? "BadJson" : "NetworkError");
      messages = [...original];
      continue;
    }
    const result = evaluateLevel(raw);
    if ("level" in result) return { level: result.level, attempts: attempt, failures };
    failures.push(result.reason);
    messages = [...messages, { role: "assistant", content: text },
      { role: "user", content: `${result.feedback} Return corrected JSON only.` }];
  }
  return { level: null, attempts: budget, failures };
}

export async function llmLevel(sentence: string, apiKey: string, model: string): Promise<Generated | null> {
  return (await llmLevelWithRepair(sentence, apiKey, model, { attempts: 1 })).level;
}

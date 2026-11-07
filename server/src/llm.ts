import { finalize, type Generated } from "./generate.ts";

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
  "You design one small puzzle level on a 6x6 grid for a sentence the player typed.",
  "Characters: '.' floor, '#' wall, 'K' key, 'E' exit, 'S' start.",
  "Rules: exactly one S, exactly one E, between 0 and 3 K. The player walks one cell per move.",
  "The exit stays locked until every key is collected. Walls block movement.",
  "Make every key and the exit reachable from S. Make it a real puzzle: use walls to force detours,",
  "put keys off the direct path, and aim for a shortest solution of 12 to 28 moves.",
  "Let the sentence inspire the layout and the title. Output JSON only.",
].join(" ");

export function parseLevel(raw: unknown): Generated | null {
  if (!raw || typeof raw !== "object") return null;
  const { title, rows } = raw as { title?: unknown; rows?: unknown };
  if (typeof title !== "string" || !Array.isArray(rows) || rows.length !== 6) return null;
  const cells: number[] = [];
  let start: [number, number] | null = null;
  for (let y = 0; y < 6; y++) {
    const row = rows[y];
    if (typeof row !== "string" || row.length !== 6) return null;
    for (let x = 0; x < 6; x++) {
      const ch = row[x].toUpperCase();
      if (ch === "S") {
        if (start) return null;
        start = [x, y];
        cells.push(0);
      } else if (ch in CHARS) {
        cells.push(CHARS[ch]);
      } else return null;
    }
  }
  if (!start) return null;
  return finalize(title, cells, start, "llm");
}

export async function llmLevel(sentence: string, apiKey: string, model: string): Promise<Generated | null> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.8,
      max_tokens: 400,
      response_format: { type: "json_schema", json_schema: SCHEMA },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: sentence },
      ],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`llm http ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content;
  if (!text) return null;
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return parseLevel(JSON.parse(json));
}

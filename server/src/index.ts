import express from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { type Generated } from "./generate.ts";
import { generateWith } from "./flow.ts";

// Secrets come from the environment only. The key is never logged.
const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.GEN_MODEL || "anthropic/claude-haiku-4.5";
const PORT = Number(process.env.PORT || 8787);
const ATTEMPTS = 4;

// Public demo guard: per-IP request cap, and a global hourly cap on paid LLM calls
// (past it the endpoint keeps working with the procedural generator).
const IP_LIMIT = Number(process.env.IP_LIMIT_PER_MIN || 12);
const LLM_HOURLY = Number(process.env.LLM_HOURLY_CAP || 150);
const hits = new Map<string, number[]>();
let llmWindow: number[] = [];

function tooMany(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter(t => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < 60_000)) hits.delete(k);
  return recent.length > IP_LIMIT;
}

function llmAllowed(now = Date.now()): boolean {
  llmWindow = llmWindow.filter(t => now - t < 3_600_000);
  if (llmWindow.length >= LLM_HOURLY) return false;
  llmWindow.push(now);
  return true;
}

export async function generate(sentence: string): Promise<Generated> {
  return generateWith(sentence, { apiKey: API_KEY && llmAllowed() ? API_KEY : undefined, model: MODEL, attempts: ATTEMPTS });
}

const app = express();
app.use(express.json({ limit: "4kb" }));
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  next();
});
app.options("/api/generate", (_req, res) => void res.sendStatus(204));
app.get("/api/health", (_req, res) => void res.json({ ok: true, llm: Boolean(API_KEY) }));
app.post("/api/generate", async (req, res) => {
  const ip = String(req.headers["cf-connecting-ip"] ?? req.ip ?? "?");
  if (tooMany(ip)) {
    res.status(429).json({ error: "too many requests, slow down" });
    return;
  }
  const raw = typeof req.body?.sentence === "string" ? req.body.sentence : "";
  const sentence = raw.trim().slice(0, 120);
  if (!sentence) {
    res.status(400).json({ error: "sentence is required" });
    return;
  }
  res.json(await generate(sentence));
});

// Optional: serve the built web client from the same process (one origin, no CORS, one tunnel).
const STATIC_DIR = process.env.STATIC_DIR ? resolve(process.env.STATIC_DIR) : "";
if (STATIC_DIR && existsSync(resolve(STATIC_DIR, "index.html"))) {
  app.use(express.static(STATIC_DIR));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
    res.sendFile(resolve(STATIC_DIR, "index.html"));
  });
}

app.listen(PORT, () => console.log(`level server on :${PORT} (llm ${API_KEY ? "on" : "off, procedural only"})`));

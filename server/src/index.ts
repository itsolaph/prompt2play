import express from "express";
import { type Generated } from "./generate.ts";
import { generateWith } from "./flow.ts";

// Secrets come from the environment only. The key is never logged.
const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.GEN_MODEL || "anthropic/claude-haiku-4.5";
const PORT = Number(process.env.PORT || 8787);
const ATTEMPTS = 4;

export async function generate(sentence: string): Promise<Generated> {
  return generateWith(sentence, { apiKey: API_KEY, model: MODEL, attempts: ATTEMPTS });
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
  const raw = typeof req.body?.sentence === "string" ? req.body.sentence : "";
  const sentence = raw.trim().slice(0, 120);
  if (!sentence) {
    res.status(400).json({ error: "sentence is required" });
    return;
  }
  res.json(await generate(sentence));
});

app.listen(PORT, () => console.log(`level server on :${PORT} (llm ${API_KEY ? "on" : "off, procedural only"})`));

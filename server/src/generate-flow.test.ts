import { describe, expect, it } from "vitest";
import { generateWith } from "./flow.ts";

const GOOD = ["S.#...", "......", "#.#.#.", "...#K.", "#K#...", "....#E"];
const BAD = ["S.#...", "..#K..", "##.#..", "K.....", "..#K#.", "..#E#."];
const mk = (rows: string[]) => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content: JSON.stringify({ title: "T", rows }) } }] }),
});

describe("generateWith (server flow)", () => {
  it("labels llm only when the llm level passed validation", async () => {
    const q = [mk(BAD), mk(GOOD)];
    const g = await generateWith("a lighthouse", { apiKey: "k", model: "m", attempts: 3, fetchImpl: (async () => q.shift()) as any });
    expect(g.source).toBe("llm");
  });
  it("falls back to procedural, labelled procedural, when all attempts fail", async () => {
    const g = await generateWith("a lighthouse", { apiKey: "k", model: "m", attempts: 3, fetchImpl: (async () => mk(BAD)) as any });
    expect(g.source).toBe("procedural");
  });
  it("is procedural without a key and never calls the network", async () => {
    let called = false;
    const g = await generateWith("a lighthouse", { apiKey: undefined, model: "m", attempts: 3, fetchImpl: (async () => ((called = true), mk(GOOD))) as any });
    expect(g.source).toBe("procedural");
    expect(called).toBe(false);
  });
});

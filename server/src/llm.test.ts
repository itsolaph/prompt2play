import { describe, expect, it } from "vitest";
import { evaluateLevel, llmLevelWithRepair } from "./llm.ts";

const GOOD = ["S.#...", "......", "#.#.#.", "...#K.", "#K#...", "....#E"];
// Real failure seen from the model: key at row 3 col 3 and exit are walled off.
const UNREACHABLE = ["S.#...", "..#K..", "##.#..", "K.....", "..#K#.", "..#E#."];
const TOO_SHORT = ["SE....", "......", "......", "......", "......", "......"];

const reply = (rows: string[], title = "T") => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content: JSON.stringify({ title, rows }) } }], usage: { cost: 0.0006 } }),
});

describe("evaluateLevel diagnostics", () => {
  it("accepts a valid level as llm", () => {
    const r = evaluateLevel({ title: "T", rows: GOOD });
    expect("level" in r && r.level.source).toBe("llm");
  });
  it("names unreachable cells so the model can fix them", () => {
    const r = evaluateLevel({ title: "T", rows: UNREACHABLE });
    expect("reason" in r && r.reason).toBe("Unreachable");
    expect("reason" in r && r.feedback).toMatch(/unreachable/i);
    expect("reason" in r && r.feedback).toMatch(/row 1/i); // names a coordinate of the cut-off cell
  });
  it("reports too-short solutions with the actual length", () => {
    const r = evaluateLevel({ title: "T", rows: TOO_SHORT });
    expect("reason" in r && r.reason).toBe("TooShort");
    expect("reason" in r && r.feedback).toMatch(/1 move/);
  });
  it("reports shape and character problems", () => {
    const a = evaluateLevel({ title: "T", rows: ["S", "......"] });
    expect("reason" in a && a.reason).toBe("BadShape");
    const b = evaluateLevel({ title: "T", rows: ["S....K", "..x...", "......", "......", "......", "E....."] });
    expect("reason" in b && b.reason).toBe("BadChar");
    const c = evaluateLevel({ title: "T", rows: ["......", "......", "......", "......", "......", "E....."] });
    expect("reason" in c && c.reason).toBe("NoStart");
  });
});

describe("llmLevelWithRepair", () => {
  it("retries with concrete feedback and returns the repaired level as llm", async () => {
    const bodies: any[] = [];
    const queue = [reply(UNREACHABLE), reply(GOOD)];
    const fetchImpl = (async (_u: string, init: any) => {
      bodies.push(JSON.parse(init.body));
      return queue.shift()!;
    }) as any;
    const out = await llmLevelWithRepair("three keys and a cat", "k", "m", { attempts: 3, fetchImpl });
    expect(out.level?.source).toBe("llm");
    expect(out.attempts).toBe(2);
    expect(out.failures).toEqual(["Unreachable"]);
    const msgs = bodies[1].messages;
    expect(msgs.length).toBeGreaterThan(2);
    expect(msgs.some((m: any) => m.role === "assistant" && String(m.content).includes("..#E#."))).toBe(true);
    expect(String(msgs[msgs.length - 1].content)).toMatch(/unreachable/i);
  });
  it("gives up after the attempt budget without inventing a level", async () => {
    let calls = 0;
    const fetchImpl = (async () => (calls++, reply(UNREACHABLE))) as any;
    const out = await llmLevelWithRepair("x", "k", "m", { attempts: 3, fetchImpl });
    expect(out.level).toBeNull();
    expect(calls).toBe(3);
    expect(out.failures).toEqual(["Unreachable", "Unreachable", "Unreachable"]);
  });
  it("records http failures and keeps going", async () => {
    const queue: any[] = [{ ok: false, status: 502, json: async () => ({}) }, reply(GOOD)];
    const fetchImpl = (async () => queue.shift()) as any;
    const out = await llmLevelWithRepair("x", "k", "m", { attempts: 3, fetchImpl });
    expect(out.level?.source).toBe("llm");
    expect(out.failures).toEqual(["Http502"]);
  });
});

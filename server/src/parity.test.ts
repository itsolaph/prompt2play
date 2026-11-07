import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { movesFromString, replay, rowsToCells, validateLevel, solve, packMoves, unpackMoves } from "../../shared/engine.ts";
import { fallbackLevel, proceduralLevel, finalize } from "./generate.ts";
import { parseLevel } from "./llm.ts";

type Fixture = {
  name: string;
  rows: string[];
  start: [number, number];
  move_cap: number;
  moves: string;
  expect: { level_error?: string; run_error?: string; steps?: number };
};

const fixtures: Fixture[] = JSON.parse(readFileSync(new URL("../../fixtures/replay.json", import.meta.url), "utf8"));

describe("Rust/TS parity (same fixtures as engine.rs)", () => {
  for (const f of fixtures) {
    it(f.name, () => {
      const level = { cells: rowsToCells(f.rows), start: f.start, moveCap: f.move_cap };
      const v = validateLevel(level);
      if (f.expect.level_error) {
        expect("error" in v && v.error).toBe(f.expect.level_error);
        return;
      }
      expect("error" in v).toBe(false);
      const r = replay(level, movesFromString(f.moves));
      if (f.expect.run_error) expect("error" in r && r.error).toBe(f.expect.run_error);
      else expect("steps" in r && r.steps).toBe(f.expect.steps);
    });
  }
  it("pack/unpack roundtrip", () => {
    const m = Array.from({ length: 40 }, (_, i) => (i * 7 + 1) % 4);
    expect(unpackMoves(packMoves(m), 40)).toEqual(m);
  });
});

describe("solver", () => {
  it("solutions replay to the same length", () => {
    for (const f of fixtures.filter((x) => !x.expect.level_error)) {
      const level = { cells: rowsToCells(f.rows), start: f.start, moveCap: 40 };
      const sol = solve(level);
      expect(sol).not.toBeNull();
      expect(replay(level, sol!)).toEqual({ steps: sol!.length });
      if (f.expect.steps) expect(sol!.length).toBeLessThanOrEqual(f.expect.steps);
    }
  });
});

describe("generator", () => {
  it("fallback level is valid", () => {
    const g = fallbackLevel("x");
    expect(g.move_cap).toBe(g.optimal_moves + 4);
  });
  it("procedural is deterministic and always solvable", () => {
    for (const s of ["a haunted lighthouse", "x", "🙂", "ドラゴン", "a".repeat(120), "three keys and a cat"]) {
      const a = proceduralLevel(s);
      const b = proceduralLevel(s);
      expect(a).toEqual(b);
      expect(a.title.length).toBeLessThanOrEqual(48);
      expect(a.source).toBe("procedural");
      const level = { cells: a.cells, start: a.start, moveCap: a.move_cap };
      const sol = solve(level)!;
      expect(sol.length).toBe(a.optimal_moves);
      expect(a.move_cap).toBeLessThanOrEqual(40);
    }
  });
  it("different sentences give different levels", () => {
    expect(proceduralLevel("one").cells).not.toEqual(proceduralLevel("two").cells);
  });
  it("llm output is validated", () => {
    const ok = parseLevel({ title: "T", rows: ["S....K", ".####.", "......", ".####.", "......", "E....."] });
    expect(ok?.source).toBe("llm");
    expect(parseLevel({ title: "T", rows: ["S....K", "......", "......", "......", "......", "......"] })).toBeNull(); // no exit
    expect(parseLevel({ title: "T", rows: ["S#E...", "##....", "......", "......", "......", "......"] })).toBeNull(); // unreachable
    expect(parseLevel({ title: "T", rows: ["SE....", "......", "......", "......", "......", "......"] })).toBeNull(); // too short
    expect(parseLevel({ title: "T", rows: ["S", "......"] })).toBeNull();
    expect(parseLevel("nope")).toBeNull();
    expect(finalize("t", new Array(36).fill(0), [0, 0], "llm")).toBeNull();
  });
});

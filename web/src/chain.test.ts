import { describe, expect, it } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { decodeLevel, publishIx, submitIx, levelPda, DEFAULT_PROGRAM_ID } from "../../shared/chain";

const program = new PublicKey(DEFAULT_PROGRAM_ID);

describe("chain encoding", () => {
  it("publish instruction has the Borsh layout the program expects", () => {
    const creator = Keypair.generate().publicKey;
    const ix = publishIx(program, {
      creator, levelId: 7n, title: "Hi", prompt: "there", cells: new Array(36).fill(0),
      start: [1, 2], moveCap: 9, tipLamports: 5n,
    });
    // 8 disc + 8 id + (4+2) + (4+5) + 36 + 3 + 8
    expect(ix.data.length).toBe(8 + 8 + 6 + 9 + 36 + 3 + 8);
    expect(ix.keys[1].pubkey.equals(levelPda(program, creator, 7n))).toBe(true);
  });

  it("submit instruction carries a length-prefixed move vector", () => {
    const player = Keypair.generate().publicKey;
    const lvl = { address: Keypair.generate().publicKey, creator: Keypair.generate().publicKey } as never;
    const ix = submitIx(program, player, lvl, [1, 0, 3]);
    expect(Array.from(ix.data.slice(8))).toEqual([3, 0, 0, 0, 1, 0, 3]);
    expect(ix.keys.map((k) => k.isSigner)).toEqual([true, false, false, false, false]);
  });

  it("decodes a level account laid out like the Rust struct", () => {
    const creator = Keypair.generate().publicKey;
    const solver = Keypair.generate().publicKey;
    const parts: number[] = new Array(8).fill(0);
    const u64 = (v: bigint) => Array.from(new Uint8Array(new BigUint64Array([v]).buffer));
    const u32 = (v: number) => Array.from(new Uint8Array(new Uint32Array([v]).buffer));
    const s = (t: string) => [...u32(t.length), ...new TextEncoder().encode(t)];
    const cells = new Array(36).fill(0); cells[5] = 3;
    parts.push(...creator.toBytes(), ...u64(42n), ...s("Title"), ...s("prompt"), ...cells, 0, 1, 12, 9, ...solver.toBytes(),
      ...u32(4), ...u32(2), ...u64(1000n), ...u64(99n), 255);
    const l = decodeLevel(Keypair.generate().publicKey, Uint8Array.from(parts));
    expect(l).toMatchObject({ levelId: 42n, title: "Title", prompt: "prompt", start: [0, 1], moveCap: 12, bestMoves: 9, plays: 4, solves: 2, tipLamports: 1000n, createdSlot: 99n });
    expect(l.creator.equals(creator) && l.bestSolver.equals(solver)).toBe(true);
    expect(l.cells[5]).toBe(3);
  });
});

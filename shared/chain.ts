// Hand-rolled client for the prompt2play program (no Anchor TS dependency).
// Discriminators come from target/idl/prompt2play.json.
import { Connection, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import bs58 from "bs58";
import { Buffer } from "buffer";

export const DEFAULT_PROGRAM_ID = "HGtnqfg2hWFz6mC6J872r9vUtNS8VKBDwio1C7AraFZ2";

const IX_PUBLISH = Uint8Array.from([128, 13, 47, 112, 53, 158, 40, 49]);
const IX_SUBMIT = Uint8Array.from([134, 48, 139, 231, 20, 213, 17, 23]);
const ACC_LEVEL = Uint8Array.from([127, 87, 27, 221, 153, 207, 254, 76]);
const ACC_RUN = Uint8Array.from([199, 54, 155, 86, 235, 115, 246, 189]);

export type OnchainLevel = {
  address: PublicKey;
  creator: PublicKey;
  levelId: bigint;
  title: string;
  prompt: string;
  cells: number[];
  start: [number, number];
  moveCap: number;
  bestMoves: number; // 0 = unsolved
  bestSolver: PublicKey;
  plays: number;
  solves: number;
  tipLamports: bigint;
  createdSlot: bigint;
};

export type OnchainRun = { movesLen: number; moves: Uint8Array; solved: boolean };

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const u64 = (v: bigint) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, v, true); return b; };
const str = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, bytes.length, true);
  return concat(len, bytes);
};

export const levelPda = (programId: PublicKey, creator: PublicKey, id: bigint) =>
  PublicKey.findProgramAddressSync([new TextEncoder().encode("level"), creator.toBytes(), u64(id)], programId)[0];

export const runPda = (programId: PublicKey, level: PublicKey, player: PublicKey) =>
  PublicKey.findProgramAddressSync([new TextEncoder().encode("run"), level.toBytes(), player.toBytes()], programId)[0];

export function publishIx(programId: PublicKey, p: {
  creator: PublicKey; levelId: bigint; title: string; prompt: string; cells: number[];
  start: [number, number]; moveCap: number; tipLamports: bigint;
}): TransactionInstruction {
  const data = concat(
    IX_PUBLISH, u64(p.levelId), str(p.title), str(p.prompt), Uint8Array.from(p.cells),
    Uint8Array.from([p.start[0], p.start[1], p.moveCap]), u64(p.tipLamports),
  );
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: p.creator, isSigner: true, isWritable: true },
      { pubkey: levelPda(programId, p.creator, p.levelId), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export function submitIx(programId: PublicKey, player: PublicKey, level: OnchainLevel, moves: number[]): TransactionInstruction {
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, moves.length, true);
  const data = concat(IX_SUBMIT, len, Uint8Array.from(moves));
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: player, isSigner: true, isWritable: true },
      { pubkey: level.address, isSigner: false, isWritable: true },
      { pubkey: level.creator, isSigner: false, isWritable: true },
      { pubkey: runPda(programId, level.address, player), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export function decodeLevel(address: PublicKey, raw: Uint8Array): OnchainLevel {
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  let o = 8;
  const pk = () => { const k = new PublicKey(raw.slice(o, o + 32)); o += 32; return k; };
  const u8 = () => raw[o++];
  const u32 = () => { const v = dv.getUint32(o, true); o += 4; return v; };
  const u64r = () => { const v = dv.getBigUint64(o, true); o += 8; return v; };
  const string = () => { const n = u32(); const s = new TextDecoder().decode(raw.slice(o, o + n)); o += n; return s; };
  const creator = pk();
  const levelId = u64r();
  const title = string();
  const prompt = string();
  const cells = Array.from(raw.slice(o, o + 36)); o += 36;
  const start: [number, number] = [u8(), u8()];
  const moveCap = u8();
  const bestMoves = u8();
  const bestSolver = pk();
  const plays = u32();
  const solves = u32();
  const tipLamports = u64r();
  const createdSlot = u64r();
  return { address, creator, levelId, title, prompt, cells, start, moveCap, bestMoves, bestSolver, plays, solves, tipLamports, createdSlot };
}

export function decodeRun(raw: Uint8Array): OnchainRun {
  // disc 8 + level 32 + player 32 + moves_len 1 + moves 10 + solved 1
  const o = 8 + 64;
  return { movesLen: raw[o], moves: raw.slice(o + 1, o + 11), solved: raw[o + 11] === 1 };
}

export async function fetchLevels(conn: Connection, programId: PublicKey): Promise<OnchainLevel[]> {
  const accts = await conn.getProgramAccounts(programId, {
    filters: [{ memcmp: { offset: 0, bytes: bs58.encode(ACC_LEVEL) } }],
  });
  const out: OnchainLevel[] = [];
  for (const a of accts) {
    try { out.push(decodeLevel(a.pubkey, a.account.data)); } catch { /* skip malformed */ }
  }
  return out.sort((x, y) => Number(y.createdSlot - x.createdSlot));
}

export async function fetchLevel(conn: Connection, address: PublicKey): Promise<OnchainLevel | null> {
  const a = await conn.getAccountInfo(address);
  return a ? decodeLevel(address, a.data) : null;
}

export async function fetchRun(conn: Connection, programId: PublicKey, level: PublicKey, player: PublicKey): Promise<OnchainRun | null> {
  const a = await conn.getAccountInfo(runPda(programId, level, player));
  if (!a || a.data.length < 8 + 74 || !a.data.slice(0, 8).every((b, i) => b === ACC_RUN[i])) return null;
  return decodeRun(a.data);
}

export const randomLevelId = () => BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));

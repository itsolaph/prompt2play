// Publishes three seed levels and solves each with its shortest BFS solution.
// Usage: tsx scripts/seed.mts <payer-keypair.json> <rpc-url> <program-id> [solver-keypair.json]
// With a solver keypair the levels are solved by a different wallet, so the creator tip is paid for real.
// Idempotent: levels with ids 1..3 that already exist are left alone.
import { readFileSync } from "node:fs";
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { solve, replay, movesToString } from "../shared/engine.ts";
import { fetchLevel, levelPda, publishIx, submitIx } from "../shared/chain.ts";
import { proceduralLevel } from "../server/src/generate.ts";

const [keyPath, rpc, programArg, solverPath] = process.argv.slice(2);
if (!keyPath || !rpc || !programArg) {
  console.error("usage: tsx scripts/seed.ts <payer-keypair.json> <rpc-url> <program-id>");
  process.exit(2);
}
if (!/devnet|localhost/.test(rpc)) {
  console.error("refusing to run: this project is devnet only");
  process.exit(2);
}

const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keyPath, "utf8"))));
const solver = solverPath ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(solverPath, "utf8")))) : payer;
const programId = new PublicKey(programArg);
const conn = new Connection(rpc, "confirmed");

const SEEDS = [
  "the lighthouse keeper's lost lamps",
  "a flooded library with three lanterns",
  "bank vault at midnight",
];

for (let i = 0; i < SEEDS.length; i++) {
  const id = BigInt(i + 1);
  const address = levelPda(programId, payer.publicKey, id);
  if (await fetchLevel(conn, address)) {
    console.log(`level ${id} exists at ${address.toBase58()}, skipping`);
    continue;
  }
  const g = proceduralLevel(SEEDS[i]);
  const level = { cells: g.cells, start: g.start, moveCap: g.move_cap };
  const moves = solve(level)!;
  const check = replay(level, moves);
  if (!("steps" in check)) throw new Error("seed solution does not replay");

  const pub = publishIx(programId, {
    creator: payer.publicKey, levelId: id, title: g.title, prompt: SEEDS[i],
    cells: g.cells, start: g.start, moveCap: g.move_cap, tipLamports: BigInt(0.001 * LAMPORTS_PER_SOL),
  });
  const pubSig = await sendAndConfirmTransaction(conn, new Transaction().add(pub), [payer]);
  const onchain = await fetchLevel(conn, address);
  const solveSig = await sendAndConfirmTransaction(conn, new Transaction().add(submitIx(programId, solver.publicKey, onchain!, moves)), [solver]);
  const after = await fetchLevel(conn, address);
  console.log(`level ${id} "${g.title}" ${address.toBase58()} solved in ${after!.bestMoves} (${movesToString(moves)})\n  publish ${pubSig}\n  solve   ${solveSig} by ${solver.publicKey.toBase58()}`);
}

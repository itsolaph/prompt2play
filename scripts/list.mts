// Lists levels from the gallery query. Usage: tsx scripts/list.mts <rpc-url> <program-id>
import { Connection, PublicKey } from "@solana/web3.js";
import { fetchLevels } from "../shared/chain.ts";

const [rpc, program] = process.argv.slice(2);
const levels = await fetchLevels(new Connection(rpc, "confirmed"), new PublicKey(program));
for (const l of levels) {
  console.log(`${l.address.toBase58()} "${l.title}" plays=${l.plays} solves=${l.solves} best=${l.bestMoves}`);
}

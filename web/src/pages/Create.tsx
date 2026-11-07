import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { solve, validateLevel } from "../../../shared/engine";
import { levelPda, publishIx, randomLevelId } from "../../../shared/chain";
import { API_URL, MAX_TIP_SOL, PROGRAM_ID } from "../config";
import { Grid } from "../Grid";
import { go } from "../App";

type Generated = {
  title: string;
  cells: number[];
  start: [number, number];
  move_cap: number;
  optimal_moves: number;
  source: "llm" | "procedural";
};

const EXAMPLES = ["a flooded library with three lanterns", "bank vault at midnight", "a quiet garden maze"];

export function Create() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [sentence, setSentence] = useState("");
  const [gen, setGen] = useState<Generated | null>(null);
  const [title, setTitle] = useState("");
  const [tip, setTip] = useState("0.001");
  const [busy, setBusy] = useState<"" | "gen" | "pub">("");
  const [msg, setMsg] = useState("");

  async function generate() {
    setBusy("gen"); setMsg(""); setGen(null);
    try {
      const r = await fetch(`${API_URL}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sentence }),
      });
      if (!r.ok) throw new Error(`server said ${r.status}`);
      const g = (await r.json()) as Generated;
      // Never trust the server: check the level again here.
      const level = { cells: g.cells, start: g.start, moveCap: g.move_cap };
      const v = validateLevel(level);
      const sol = solve({ ...level, moveCap: 40 });
      if ("error" in v || !sol || sol.length > g.move_cap) throw new Error("generated level failed the local check");
      setGen(g);
      setTitle(g.title);
    } catch (e) {
      setMsg(`Could not generate: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  }

  async function publish() {
    if (!gen || !wallet.publicKey) return;
    setBusy("pub"); setMsg("");
    try {
      const tipSol = Math.min(Math.max(Number(tip) || 0, 0), MAX_TIP_SOL);
      const levelId = randomLevelId();
      const ix = publishIx(PROGRAM_ID, {
        creator: wallet.publicKey, levelId, title: title.slice(0, 48), prompt: sentence.slice(0, 120),
        cells: gen.cells, start: gen.start, moveCap: gen.move_cap,
        tipLamports: BigInt(Math.round(tipSol * LAMPORTS_PER_SOL)),
      });
      const tx = new Transaction().add(ix);
      const sig = await wallet.sendTransaction(tx, connection);
      const latest = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: sig, ...latest }, "confirmed");
      go(`#/play/${levelPda(PROGRAM_ID, wallet.publicKey, levelId).toBase58()}`);
    } catch (e) {
      setMsg(`Publish failed: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="stack">
      <h1>Say what the level is about.</h1>
      <p className="lede">One sentence in, a 6x6 puzzle out. You get a level account you own; every solution is replayed by the program before it counts.</p>
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (sentence.trim()) void generate(); }}>
        <input
          value={sentence}
          maxLength={120}
          onChange={(e) => setSentence(e.target.value)}
          placeholder="a flooded library with three lanterns"
          aria-label="Level description"
        />
        <button className="btn primary" disabled={!sentence.trim() || busy !== ""}>{busy === "gen" ? "Drawing..." : "Generate"}</button>
      </form>
      <div className="chips">
        {EXAMPLES.map((x) => (<button key={x} className="chip" onClick={() => setSentence(x)}>{x}</button>))}
      </div>
      {msg && <p className="note err">{msg}</p>}
      {gen && (
        <div className="preview">
          <Grid cells={gen.cells} start={gen.start} player={gen.start} />
          <div className="stack">
            <label className="field">Title
              <input value={title} maxLength={48} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <dl className="facts">
              <div><dt>Shortest solution</dt><dd>{gen.optimal_moves} moves</dd></div>
              <div><dt>Move cap</dt><dd>{gen.move_cap}</dd></div>
              <div><dt>Drawn by</dt><dd>{gen.source === "llm" ? "language model" : "seeded generator"}</dd></div>
            </dl>
            <label className="field">Tip paid to you on each first solve (SOL, max {MAX_TIP_SOL})
              <input value={tip} inputMode="decimal" onChange={(e) => setTip(e.target.value)} />
            </label>
            <button className="btn primary" disabled={!wallet.publicKey || busy !== "" || !title.trim()} onClick={publish}>
              {!wallet.publicKey ? "Connect a wallet to publish" : busy === "pub" ? "Publishing..." : "Publish on devnet"}
            </button>
            <p className="note">The level passes a solver check in your browser first. The program checks the shape again when you publish.</p>
          </div>
        </div>
      )}
    </section>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { initialState, movesToString, step } from "../../../shared/engine";
import { fetchLevel, fetchRun, submitIx, type OnchainLevel, type OnchainRun } from "../../../shared/chain";
import { PROGRAM_ID, short } from "../config";
import { Grid } from "../Grid";

const KEYS: Record<string, number> = {
  ArrowUp: 0, ArrowDown: 1, ArrowLeft: 2, ArrowRight: 3, w: 0, s: 1, a: 2, d: 3,
};

export function Play({ address }: { address: string }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [level, setLevel] = useState<OnchainLevel | null>(null);
  const [err, setErr] = useState("");
  const [moves, setMoves] = useState<number[]>([]);
  const [mine, setMine] = useState<OnchainRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const l = await fetchLevel(connection, new PublicKey(address));
      if (!l) setErr("No level at this address.");
      else setLevel(l);
      if (l && wallet.publicKey) setMine(await fetchRun(connection, PROGRAM_ID, l.address, wallet.publicKey));
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [connection, address, wallet.publicKey]);
  useEffect(() => { void load(); }, [load]);

  const lv = useMemo(() => level && { cells: level.cells, start: level.start, moveCap: level.moveCap }, [level]);

  // Replay the move list to get the current state. 40 moves at most.
  const game = useMemo(() => {
    if (!lv) return null;
    let st = initialState(lv);
    const trail: [number, number][] = [];
    let won = false;
    for (const m of moves) {
      const r = step(lv, st, m);
      if (r === "BadMove") break;
      trail.push([st.x, st.y]);
      st = r;
      if (r.won) { won = true; break; }
    }
    return { ...st, won, trail };
  }, [lv, moves]);

  const full = !!lv && moves.length >= lv.moveCap;
  const over = !!game && !game.won && full;

  const push = useCallback((m: number) => {
    if (!lv || !game || game.won || moves.length >= lv.moveCap) return;
    setMsg("");
    setMoves((x) => [...x, m]);
  }, [lv, game, moves.length]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const m = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (m !== undefined) { e.preventDefault(); push(m); }
      if (e.key === "Backspace") setMoves((x) => x.slice(0, -1));
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [push]);

  const touch = useRef<[number, number] | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { touch.current = [e.touches[0].clientX, e.touches[0].clientY]; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current[0];
    const dy = e.changedTouches[0].clientY - touch.current[1];
    touch.current = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    push(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 3 : 2) : dy > 0 ? 1 : 0);
  };

  async function submit() {
    if (!level || !wallet.publicKey) return;
    setBusy(true); setMsg("");
    try {
      const tx = new Transaction().add(submitIx(PROGRAM_ID, wallet.publicKey, level, moves));
      const sig = await wallet.sendTransaction(tx, connection);
      const latest = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: sig, ...latest }, "confirmed");
      setMsg("Verified on-chain. Your run is recorded.");
      await load();
    } catch (e) {
      const text = (e as Error).message;
      setMsg(/NotBetter|not shorter/.test(text) ? "The program rejected it: not shorter than your earlier solution." : `Submit failed: ${text}`);
    } finally {
      setBusy(false);
    }
  }

  if (err) return <p className="note err">{err}</p>;
  if (!level || !game) return <p className="note">Loading level...</p>;

  const betterThanMine = !mine?.solved || moves.length < mine.movesLen;
  const tipSol = Number(level.tipLamports) / 1e9;

  return (
    <section className="play">
      <div className="stack">
        <h1>{level.title}</h1>
        <p className="quote">"{level.prompt}" by {short(level.creator)}</p>
        <div className="boardwrap" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <Grid cells={game.cells} player={[game.x, game.y]} locked={game.keysLeft > 0} trail={game.trail} />
        </div>
        <div className="dpad" aria-label="Controls">
          <button onClick={() => push(0)} className="up" aria-label="Up">U</button>
          <button onClick={() => push(2)} className="left" aria-label="Left">L</button>
          <button onClick={() => push(3)} className="right" aria-label="Right">R</button>
          <button onClick={() => push(1)} className="down" aria-label="Down">D</button>
        </div>
      </div>
      <aside className="stack">
        <div className="counter" aria-live="polite">
          <span className="big">{moves.length}</span><span> / {level.moveCap} moves</span>
        </div>
        <p className="note">Keys left: {game.keysLeft}. The exit opens when you hold them all. Bumping a wall still costs a move.</p>
        <div className="row">
          <button className="btn" onClick={() => setMoves((x) => x.slice(0, -1))} disabled={!moves.length}>Undo</button>
          <button className="btn" onClick={() => { setMoves([]); setMsg(""); }} disabled={!moves.length}>Reset</button>
        </div>
        {moves.length > 0 && <code className="moves">{movesToString(moves)}</code>}
        {game.won && (
          <div className="win">
            <strong>Solved in {moves.length}.</strong>
            {!betterThanMine && <p className="note">Your recorded best is {mine!.movesLen}. Find a shorter route to improve it.</p>}
            <button className="btn primary" disabled={busy || !wallet.publicKey || !betterThanMine} onClick={submit}>
              {!wallet.publicKey ? "Connect a wallet to submit" : busy ? "Submitting..." : "Submit run to the chain"}
            </button>
            {tipSol > 0 && !mine?.solved && <p className="note">First solve pays the creator a tip of {tipSol} SOL.</p>}
          </div>
        )}
        {over && <p className="note err">Out of moves. Undo or reset.</p>}
        {msg && <p className="note">{msg}</p>}
        <dl className="facts">
          <div><dt>Plays / solves</dt><dd>{level.plays} / {level.solves}</dd></div>
          <div><dt>Best</dt><dd>{level.bestMoves ? `${level.bestMoves} by ${short(level.bestSolver)}` : "unsolved"}</dd></div>
          {mine?.solved && <div><dt>Your best</dt><dd>{mine.movesLen}</dd></div>}
        </dl>
      </aside>
    </section>
  );
}

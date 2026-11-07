import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { fetchLevels, type OnchainLevel } from "../../../shared/chain";
import { PROGRAM_ID, short } from "../config";
import { Grid } from "../Grid";

export function Gallery() {
  const { connection } = useConnection();
  const [levels, setLevels] = useState<OnchainLevel[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let live = true;
    fetchLevels(connection, PROGRAM_ID)
      .then((l) => live && setLevels(l))
      .catch((e) => live && setErr((e as Error).message));
    return () => { live = false; };
  }, [connection]);

  return (
    <section className="stack">
      <h1>Gallery</h1>
      {err && <p className="note err">Could not load levels: {err}</p>}
      {!levels && !err && <p className="note">Reading accounts from devnet...</p>}
      {levels && levels.length === 0 && <p className="note">No levels yet. <a href="#/">Make the first one.</a></p>}
      <div className="cards">
        {levels?.map((l) => (
          <a key={l.address.toBase58()} className="card" href={`#/play/${l.address.toBase58()}`}>
            <Grid cells={l.cells} start={l.start} />
            <h2>{l.title}</h2>
            <p className="quote">"{l.prompt}"</p>
            <dl className="facts tight">
              <div><dt>Creator</dt><dd>{short(l.creator)}</dd></div>
              <div><dt>Plays / solves</dt><dd>{l.plays} / {l.solves}</dd></div>
              <div><dt>Best</dt><dd>{l.bestMoves ? `${l.bestMoves} by ${short(l.bestSolver)}` : "unsolved"}</dd></div>
              <div><dt>Cap</dt><dd>{l.moveCap}</dd></div>
            </dl>
          </a>
        ))}
      </div>
    </section>
  );
}

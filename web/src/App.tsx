import { useEffect, useMemo, useState } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { RPC } from "./config";
import { Create } from "./pages/Create";
import { Gallery } from "./pages/Gallery";
import { Play } from "./pages/Play";

function useHash() {
  const [hash, setHash] = useState(window.location.hash || "#/");
  useEffect(() => {
    const on = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

export const go = (to: string) => { window.location.hash = to; };

function Shell() {
  const hash = useHash();
  const play = hash.match(/^#\/play\/([1-9A-HJ-NP-Za-km-z]{32,44})$/);
  const tab = play ? "play" : hash.startsWith("#/gallery") ? "gallery" : "create";
  return (
    <div className="page">
      <header className="top">
        <a className="brand" href="#/">
          <span className="brand-mark" aria-hidden />
          Prompt2Play
        </a>
        <nav>
          <a href="#/" aria-current={tab === "create"}>Create</a>
          <a href="#/gallery" aria-current={tab === "gallery"}>Gallery</a>
        </nav>
        <WalletMultiButton />
      </header>
      <main>
        {tab === "create" && <Create />}
        {tab === "gallery" && <Gallery />}
        {tab === "play" && play && <Play key={play[1]} address={play[1]} />}
      </main>
      <footer className="foot">Solana devnet. Levels are accounts; the program replays every solution.</footer>
    </div>
  );
}

export function App() {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint={RPC}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <Shell />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

import { clusterApiUrl, PublicKey } from "@solana/web3.js";
import { DEFAULT_PROGRAM_ID } from "../../shared/chain";

export const RPC: string = import.meta.env.VITE_RPC || clusterApiUrl("devnet");
export const PROGRAM_ID = new PublicKey(import.meta.env.VITE_PROGRAM_ID || DEFAULT_PROGRAM_ID);
export const API_URL: string = import.meta.env.VITE_API_URL || "";
export const MAX_TIP_SOL = 0.01;

export const short = (k: { toBase58(): string }) => {
  const s = k.toBase58();
  return `${s.slice(0, 4)}..${s.slice(-4)}`;
};

# Prompt2Play: build brief (MLH x Solana hackathon, devnet only, ~14h left)

One sentence -> AI designs a playable 6x6 puzzle level -> published as an ownable Solana account -> anyone solves it, and the PROGRAM replays the moves on-chain to verify. 60-second story: "type a sentence, get a game you own; the chain checks every solution".

## Frozen mechanics (do not redesign)
- Grid 6x6, cells: 0 floor, 1 wall, 2 key, 3 exit(locked until all keys taken), start (x,y). Up to 3 keys. move_cap <= 40. Moves: U/D/L/R, walls block, off-grid blocks (no-op counts as a move).
- Level account PDA ["level", creator, level_id u64]: creator, title (<=48), prompt (<=120), cells [u8;36], start, move_cap, best_moves, best_solver, plays, solves, tip_lamports (set by creator, <= 0.01 SOL), created_slot.
- Solution account PDA ["run", level, player]: moves_len, moves packed, solved bool. 
- Instructions: publish_level (validates on-chain: exactly one start, one exit, keys<=3, border not required, start not on wall, BFS solvability check on-chain is NOT required but cheap greedy validation of shape is), submit_run(moves: Vec<u8>) replays, requires all keys collected then exit reached within move_cap, updates best_moves/best_solver if shorter, increments counters, transfers tip_lamports from solver to creator (first solve per player only). Reject duplicate better-nothing runs cleanly.
- Anchor program in Rust, with unit tests for the pure replay function (extract it into a plain module) AND a Rust/TS reference parity test (same fixtures in both).

## Client
- Vite + React + TS web app, mobile-friendly, wallet-adapter (Phantom), devnet RPC from env VITE_RPC (default clusterApiUrl devnet).
- Pages: Create (sentence input -> POST /api/generate -> preview grid -> BFS check in client -> publish), Play (arrow keys/swipe/d-pad, live move counter, submit run), Gallery (getProgramAccounts list of levels with creator, plays, solves, best).
- Level generation server (tiny Node/Express in `server/`): reads env OPENROUTER_API_KEY (never log or commit it, never read any .env yourself; only reference the var name). Calls an LLM (model from env GEN_MODEL, default anthropic/claude-haiku-4.5) with strict JSON schema, validates + BFS-solves server-side, retries up to 3x, then falls back to a deterministic procedural generator seeded by a hash of the sentence so the demo NEVER fails. Return {title, cells, start, move_cap, optimal_moves, source:"llm"|"procedural"}. Set move_cap = optimal + 4.
- Visual style: distinctive, not default-AI looking (no purple gradients, no emoji icons). Pick a clear palette and a pixel/ink-on-paper feel. Honest copy, no AI-isms.

## Deliverables
1. Program builds (`anchor build`), tests green (cargo test + anchor/bankrun or solana-test-validator test of publish + submit_run happy path, invalid path, tip transfer).
2. Web builds (`npm run build`) and typechecks.
3. scripts/deploy-and-seed.sh (parametrised by keypair paths, devnet) that deploys and publishes 3 seed levels with real solutions.
4. README.md in English: what it is, how Solana is used, architecture, run steps, third-party credits with licenses. Anonymous: no names, no hostnames, no IPs, no absolute home paths, no emails.
5. PROGRESS.md: append a line after each milestone.

## Rules
- Devnet only. No mainnet. Never print or commit any key. Keypairs for deployment are NOT yours: do not create or touch ~/.config/solana. Use `solana-keygen new --no-bip39-passphrase -o ./.keys/test.json` inside the repo for tests only; .keys/ is gitignored.
- Machine: 8 cores, 22GB RAM; export CARGO_BUILD_JOBS=2. Toolchain (cargo, rustc, anchor, solana, solana-keygen, node, npm) is ALREADY on PATH and CARGO_BUILD_JOBS=2 is set; just run the commands directly, one simple command per call (no sourcing, no `bash -c`). anchor-cli 1.1.2, solana 3.1.10.
- Commit in small steps. Git author is already configured; add only `Co-Authored-By: Claude <noreply@anthropic.com>`. Do not push.
- Never background sub-agents. Prefer finishing the program + tests FIRST, then web, then seeds/README.
- If something in the frozen mechanics is infeasible, choose the smallest deviation and note it in PROGRESS.md.

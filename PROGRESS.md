# Progress

- Program done: pure `engine` module (validate + replay + move packing), `publish_level` and `submit_run`, shared fixtures in `fixtures/replay.json` (25 cases). `anchor build` ok; `cargo test` green (2 unit + 7 LiteSVM integration tests: publish, happy path, invalid runs, tip, wrong creator, improvement rules).
- Deviation: `plays` counts accepted runs (invalid runs revert, so they cannot be counted); `solves` counts distinct solvers. `best_moves = 0` means unsolved. Move codes are 0..=3 for U, D, L, R. `publish_level` also flood-fills reachability of keys and exit (cheap, 36 cells), which the brief allowed but did not require. Start on the exit is rejected.
- Deviation: tests use LiteSVM (Rust) instead of bankrun/solana-test-validator, same coverage without a running validator.
- Server done: `server/` Express generator (LLM via OpenRouter with strict JSON schema, server-side validation + BFS, 3 retries, deterministic procedural fallback seeded by sentence hash). 31 vitest tests incl. Rust/TS fixture parity.
- Web done: Vite + React + TS client (Create, Play with keys/swipe/d-pad, Gallery via getProgramAccounts), hand-written chain client in `shared/chain.ts`. `npm run build` and typecheck pass.
- Seeds done: `scripts/deploy-and-seed.sh` + `seed.mts`. Verified the deploy and seed steps against a local solana-test-validator (3 levels published and solved on-chain, gallery query reads them back). Not run on public devnet: no deploy keypair was provided. I ran the script's steps one at a time because the script itself was not allowed to run in this session.
- README.md and LICENSE written.

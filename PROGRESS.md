# Progress

- Program done: pure `engine` module (validate + replay + move packing), `publish_level` and `submit_run`, shared fixtures in `fixtures/replay.json` (25 cases). `anchor build` ok; `cargo test` green (2 unit + 7 LiteSVM integration tests: publish, happy path, invalid runs, tip, wrong creator, improvement rules).
- Deviation: `plays` counts accepted runs (invalid runs revert, so they cannot be counted); `solves` counts distinct solvers. `best_moves = 0` means unsolved. Move codes are 0..=3 for U, D, L, R. `publish_level` also flood-fills reachability of keys and exit (cheap, 36 cells), which the brief allowed but did not require. Start on the exit is rejected.
- Deviation: tests use LiteSVM (Rust) instead of bankrun/solana-test-validator, same coverage without a running validator.

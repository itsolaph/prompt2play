// Generates fixtures/replay.json. Run: node fixtures/gen.mjs
import { writeFileSync } from "node:fs";
const Z = "000000";
const pad = (...rows) => [...rows, ...Array(6 - rows.length).fill(Z)];
const run = (name, rows, start, move_cap, moves, steps) => ({ name, rows, start, move_cap, moves, expect: { steps } });
const runErr = (name, rows, start, move_cap, moves, e) => ({ name, rows, start, move_cap, moves, expect: { run_error: e } });
const lvErr = (name, rows, start, move_cap, e) => ({ name, rows, start, move_cap, moves: "R", expect: { level_error: e } });
const diag = [Z, Z, Z, Z, Z, "000003"];
const fx = [
  run("no_keys_ok", diag, [0, 0], 12, "RRRRRDDDDD", 10),
  run("cap_exact", diag, [0, 0], 10, "RRRRRDDDDD", 10),
  runErr("over_cap", diag, [0, 0], 9, "RRRRRDDDDD", "TooManyMoves"),
  runErr("empty", diag, [0, 0], 12, "", "Empty"),
  runErr("not_solved", diag, [0, 0], 12, "RRRRR", "NotSolved"),
  runErr("trailing_moves", diag, [0, 0], 12, "RRRRRDDDDDD", "TrailingMoves"),
  runErr("bad_move_code", diag, [0, 0], 12, "RRXRR", "BadMove"),
  run("start_on_key", pad("200003"), [0, 0], 8, "RRRRR", 5),
  runErr("exit_locked", pad("000003", "200000"), [0, 0], 8, "RRRRR", "NotSolved"),
  run("locked_then_solved", pad("000003", "200000"), [0, 0], 20, "RRRRRLLLLDURRRRR", 16),
  run("wall_bump_counts", pad("010003"), [0, 0], 10, "RDRRRRRU", 8),
  run("off_grid_bump_counts", pad("000003"), [0, 0], 10, "ULRRRRR", 7),
  run("three_keys", pad("222003"), [0, 0], 8, "RRRRR", 5),
  run("start_mid_exit_below", pad("000000", "000030"), [4, 0], 4, "D", 1),
  lvErr("four_keys", pad("222203"), [0, 0], 10, "TooManyKeys"),
  lvErr("no_exit", pad(), [0, 0], 10, "NoExit"),
  lvErr("two_exits", pad("300003"), [1, 0], 10, "TooManyExits"),
  lvErr("start_on_wall", pad("100003"), [0, 0], 10, "StartOnWall"),
  lvErr("start_on_exit", pad("300000"), [0, 0], 10, "StartOnExit"),
  lvErr("unreachable_exit", ["000103", "000100", "000100", "000100", "000100", "000100"], [0, 0], 10, "Unreachable"),
  lvErr("key_behind_exit", pad("000032", "000011"), [0, 0], 10, "Unreachable"),
  lvErr("cap_zero", diag, [0, 0], 0, "BadMoveCap"),
  lvErr("cap_41", diag, [0, 0], 41, "BadMoveCap"),
  lvErr("bad_cell", pad("400003"), [1, 0], 10, "BadCell"),
  lvErr("start_off_grid", pad("000003"), [6, 0], 10, "BadStart"),
];
writeFileSync(new URL("./replay.json", import.meta.url), JSON.stringify(fx, null, 1) + "\n");
console.log(fx.length, "fixtures");

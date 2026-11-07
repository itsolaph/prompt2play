//! Pure game rules. No Anchor, no accounts: this module is what the program runs
//! on-chain and what the unit tests and the TypeScript reference are checked against.
//!
//! Grid is 6x6, row-major. Cells: 0 floor, 1 wall, 2 key, 3 exit.
//! The exit blocks movement (like a wall) until every key has been collected.
//! Moves are codes 0..=3 = U, D, L, R. A move into a wall, the edge of the grid,
//! or the locked exit changes nothing but still counts as a move.
//! Keys are collected by standing on them, including the start cell.
//! The run ends the moment the exit is entered; extra moves after that are rejected.

pub const W: usize = 6;
pub const N: usize = 36;
pub const MAX_KEYS: usize = 3;
pub const MAX_MOVES: usize = 40;

pub const FLOOR: u8 = 0;
pub const WALL: u8 = 1;
pub const KEY: u8 = 2;
pub const EXIT: u8 = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LevelError {
    BadCell,
    BadStart,
    StartOnWall,
    StartOnExit,
    NoExit,
    TooManyExits,
    TooManyKeys,
    BadMoveCap,
    Unreachable,
}

impl LevelError {
    pub fn name(&self) -> &'static str {
        match self {
            LevelError::BadCell => "BadCell",
            LevelError::BadStart => "BadStart",
            LevelError::StartOnWall => "StartOnWall",
            LevelError::StartOnExit => "StartOnExit",
            LevelError::NoExit => "NoExit",
            LevelError::TooManyExits => "TooManyExits",
            LevelError::TooManyKeys => "TooManyKeys",
            LevelError::BadMoveCap => "BadMoveCap",
            LevelError::Unreachable => "Unreachable",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunError {
    Empty,
    TooManyMoves,
    BadMove,
    NotSolved,
    TrailingMoves,
}

impl RunError {
    pub fn name(&self) -> &'static str {
        match self {
            RunError::Empty => "Empty",
            RunError::TooManyMoves => "TooManyMoves",
            RunError::BadMove => "BadMove",
            RunError::NotSolved => "NotSolved",
            RunError::TrailingMoves => "TrailingMoves",
        }
    }
}

/// Shape check used by publish_level. Returns the number of keys.
/// Besides counting, it flood-fills from the start so that every key and the exit
/// are reachable at all (cheap: 36 cells). It does not prove the move cap is enough.
pub fn validate_level(
    cells: &[u8; N],
    start_x: u8,
    start_y: u8,
    move_cap: u8,
) -> Result<u8, LevelError> {
    if move_cap == 0 || move_cap as usize > MAX_MOVES {
        return Err(LevelError::BadMoveCap);
    }
    if start_x as usize >= W || start_y as usize >= W {
        return Err(LevelError::BadStart);
    }
    let mut keys = 0u8;
    let mut exits = 0u8;
    for &c in cells.iter() {
        match c {
            FLOOR | WALL => {}
            KEY => keys += 1,
            EXIT => exits += 1,
            _ => return Err(LevelError::BadCell),
        }
    }
    if exits == 0 {
        return Err(LevelError::NoExit);
    }
    if exits > 1 {
        return Err(LevelError::TooManyExits);
    }
    if keys as usize > MAX_KEYS {
        return Err(LevelError::TooManyKeys);
    }
    let s = start_y as usize * W + start_x as usize;
    if cells[s] == WALL {
        return Err(LevelError::StartOnWall);
    }
    if cells[s] == EXIT {
        return Err(LevelError::StartOnExit);
    }

    // Flood fill treating the exit as a wall; then the exit needs a reached neighbour.
    let mut seen = [false; N];
    let mut stack = [0u8; N];
    let mut sp = 0usize;
    seen[s] = true;
    stack[sp] = s as u8;
    sp += 1;
    let mut keys_seen = 0u8;
    let mut exit_touched = false;
    while sp > 0 {
        sp -= 1;
        let i = stack[sp] as usize;
        if cells[i] == KEY {
            keys_seen += 1;
        }
        let x = i % W;
        let y = i / W;
        let mut visit = |nx: usize, ny: usize| {
            let j = ny * W + nx;
            if cells[j] == WALL || seen[j] {
                return;
            }
            if cells[j] == EXIT {
                exit_touched = true;
                return;
            }
            seen[j] = true;
            stack[sp] = j as u8;
            sp += 1;
        };
        if y > 0 {
            visit(x, y - 1);
        }
        if y + 1 < W {
            visit(x, y + 1);
        }
        if x > 0 {
            visit(x - 1, y);
        }
        if x + 1 < W {
            visit(x + 1, y);
        }
    }
    if keys_seen != keys || !exit_touched {
        return Err(LevelError::Unreachable);
    }
    Ok(keys)
}

/// Replays `moves` (codes 0..=3) on a level. Returns the number of moves used.
/// The level is assumed to have passed `validate_level`.
pub fn replay(
    cells: &[u8; N],
    start_x: u8,
    start_y: u8,
    move_cap: u8,
    moves: &[u8],
) -> Result<u8, RunError> {
    if moves.is_empty() {
        return Err(RunError::Empty);
    }
    if moves.len() > move_cap as usize || moves.len() > MAX_MOVES {
        return Err(RunError::TooManyMoves);
    }
    let mut grid = *cells;
    let mut keys_left = grid.iter().filter(|&&c| c == KEY).count();
    let mut x = start_x as usize;
    let mut y = start_y as usize;
    if grid[y * W + x] == KEY {
        grid[y * W + x] = FLOOR;
        keys_left -= 1;
    }
    for (n, &m) in moves.iter().enumerate() {
        let (nx, ny) = match m {
            0 => (x as i32, y as i32 - 1),
            1 => (x as i32, y as i32 + 1),
            2 => (x as i32 - 1, y as i32),
            3 => (x as i32 + 1, y as i32),
            _ => return Err(RunError::BadMove),
        };
        if nx < 0 || ny < 0 || nx >= W as i32 || ny >= W as i32 {
            continue;
        }
        let (nx, ny) = (nx as usize, ny as usize);
        match grid[ny * W + nx] {
            WALL => continue,
            EXIT if keys_left > 0 => continue,
            EXIT => {
                return if n + 1 == moves.len() {
                    Ok(moves.len() as u8)
                } else {
                    Err(RunError::TrailingMoves)
                };
            }
            KEY => {
                grid[ny * W + nx] = FLOOR;
                keys_left -= 1;
            }
            _ => {}
        }
        x = nx;
        y = ny;
    }
    Err(RunError::NotSolved)
}

/// Packs move codes 2 bits each, 4 per byte, first move in the low bits.
pub fn pack_moves(moves: &[u8]) -> [u8; MAX_MOVES / 4] {
    let mut out = [0u8; MAX_MOVES / 4];
    for (i, &m) in moves.iter().enumerate().take(MAX_MOVES) {
        out[i / 4] |= (m & 3) << ((i % 4) * 2);
    }
    out
}

pub fn unpack_moves(packed: &[u8; MAX_MOVES / 4], len: usize) -> Vec<u8> {
    (0..len.min(MAX_MOVES))
        .map(|i| (packed[i / 4] >> ((i % 4) * 2)) & 3)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct Fixture {
        name: String,
        rows: Vec<String>,
        start: [u8; 2],
        move_cap: u8,
        moves: String,
        expect: Expect,
    }

    #[derive(Deserialize)]
    struct Expect {
        level_error: Option<String>,
        run_error: Option<String>,
        steps: Option<u8>,
    }

    pub fn parse_rows(rows: &[String]) -> [u8; N] {
        let mut cells = [0u8; N];
        for (y, r) in rows.iter().enumerate() {
            for (x, ch) in r.chars().enumerate() {
                cells[y * W + x] = ch.to_digit(10).unwrap() as u8;
            }
        }
        cells
    }

    pub fn parse_moves(s: &str) -> Vec<u8> {
        s.chars()
            .map(|c| match c {
                'U' => 0,
                'D' => 1,
                'L' => 2,
                'R' => 3,
                'X' => 9,
                _ => panic!("bad move char"),
            })
            .collect()
    }

    #[test]
    fn shared_fixtures() {
        let raw = include_str!("../../../fixtures/replay.json");
        let fixtures: Vec<Fixture> = serde_json::from_str(raw).unwrap();
        assert!(fixtures.len() >= 15);
        for f in fixtures {
            let cells = parse_rows(&f.rows);
            let lv = validate_level(&cells, f.start[0], f.start[1], f.move_cap);
            if let Some(e) = &f.expect.level_error {
                assert_eq!(lv.err().map(|e| e.name()), Some(e.as_str()), "{}", f.name);
                continue;
            }
            assert!(lv.is_ok(), "{}: level should be valid", f.name);
            let r = replay(&cells, f.start[0], f.start[1], f.move_cap, &parse_moves(&f.moves));
            match (&f.expect.run_error, f.expect.steps) {
                (Some(e), _) => {
                    assert_eq!(r.err().map(|e| e.name()), Some(e.as_str()), "{}", f.name)
                }
                (None, Some(s)) => assert_eq!(r, Ok(s), "{}", f.name),
                _ => panic!("fixture {} has no expectation", f.name),
            }
        }
    }

    #[test]
    fn pack_roundtrip() {
        let moves: Vec<u8> = (0..40).map(|i| ((i * 7 + 1) % 4) as u8).collect();
        let packed = pack_moves(&moves);
        assert_eq!(unpack_moves(&packed, 40), moves);
        assert_eq!(unpack_moves(&packed, 3), moves[..3].to_vec());
    }
}

pub mod engine;

use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("HGtnqfg2hWFz6mC6J872r9vUtNS8VKBDwio1C7AraFZ2");

pub const MAX_TITLE: usize = 48;
pub const MAX_PROMPT: usize = 120;
pub const MAX_TIP_LAMPORTS: u64 = 10_000_000; // 0.01 SOL

#[program]
pub mod prompt2play {
    use super::*;

    /// Publishes a level as a PDA owned by the creator's namespace.
    /// The program checks the shape (cells, one exit, <= 3 keys, start not on a wall,
    /// everything reachable). It does not prove the move cap is achievable.
    pub fn publish_level(
        ctx: Context<PublishLevel>,
        level_id: u64,
        title: String,
        prompt: String,
        cells: [u8; 36],
        start_x: u8,
        start_y: u8,
        move_cap: u8,
        tip_lamports: u64,
    ) -> Result<()> {
        require!(title.len() <= MAX_TITLE, P2pError::TitleTooLong);
        require!(prompt.len() <= MAX_PROMPT, P2pError::PromptTooLong);
        require!(tip_lamports <= MAX_TIP_LAMPORTS, P2pError::TipTooHigh);
        engine::validate_level(&cells, start_x, start_y, move_cap).map_err(level_err)?;

        let level = &mut ctx.accounts.level;
        level.creator = ctx.accounts.creator.key();
        level.level_id = level_id;
        level.title = title;
        level.prompt = prompt;
        level.cells = cells;
        level.start_x = start_x;
        level.start_y = start_y;
        level.move_cap = move_cap;
        level.best_moves = 0;
        level.best_solver = Pubkey::default();
        level.plays = 0;
        level.solves = 0;
        level.tip_lamports = tip_lamports;
        level.created_slot = Clock::get()?.slot;
        level.bump = ctx.bumps.level;
        Ok(())
    }

    /// Replays `moves` (codes 0..=3 for U, D, L, R) against the level.
    /// First valid solve per player pays the creator's tip and counts as a solve.
    /// Later runs by the same player are accepted only if strictly shorter.
    pub fn submit_run(ctx: Context<SubmitRun>, moves: Vec<u8>) -> Result<()> {
        let level = &mut ctx.accounts.level;
        let steps = engine::replay(
            &level.cells,
            level.start_x,
            level.start_y,
            level.move_cap,
            &moves,
        )
        .map_err(run_err)?;

        let run = &mut ctx.accounts.run;
        let first = !run.solved;
        if !first {
            require!(steps < run.moves_len, P2pError::NotBetter);
        } else {
            run.level = level.key();
            run.player = ctx.accounts.player.key();
            run.bump = ctx.bumps.run;
            run.solved = true;
        }
        run.moves_len = steps;
        run.moves = engine::pack_moves(&moves);

        level.plays = level.plays.saturating_add(1);
        if level.best_moves == 0 || steps < level.best_moves {
            level.best_moves = steps;
            level.best_solver = ctx.accounts.player.key();
        }
        if first {
            level.solves = level.solves.saturating_add(1);
            if level.tip_lamports > 0 && ctx.accounts.player.key() != level.creator {
                transfer(
                    CpiContext::new(
                        anchor_lang::system_program::ID,
                        Transfer {
                            from: ctx.accounts.player.to_account_info(),
                            to: ctx.accounts.creator.to_account_info(),
                        },
                    ),
                    level.tip_lamports,
                )?;
            }
        }
        Ok(())
    }
}

fn level_err(e: engine::LevelError) -> Error {
    use engine::LevelError::*;
    match e {
        BadCell => P2pError::BadCell,
        BadStart | StartOnWall | StartOnExit => P2pError::BadStart,
        NoExit | TooManyExits => P2pError::ExitCount,
        TooManyKeys => P2pError::TooManyKeys,
        BadMoveCap => P2pError::BadMoveCap,
        Unreachable => P2pError::Unreachable,
    }
    .into()
}

fn run_err(e: engine::RunError) -> Error {
    use engine::RunError::*;
    match e {
        Empty => P2pError::EmptyRun,
        TooManyMoves => P2pError::TooManyMoves,
        BadMove => P2pError::BadMove,
        NotSolved => P2pError::NotSolved,
        TrailingMoves => P2pError::TrailingMoves,
    }
    .into()
}

#[derive(Accounts)]
#[instruction(level_id: u64)]
pub struct PublishLevel<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init,
        payer = creator,
        space = 8 + Level::INIT_SPACE,
        seeds = [b"level", creator.key().as_ref(), &level_id.to_le_bytes()],
        bump
    )]
    pub level: Account<'info, Level>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitRun<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(
        mut,
        seeds = [b"level", level.creator.as_ref(), &level.level_id.to_le_bytes()],
        bump = level.bump
    )]
    pub level: Account<'info, Level>,
    /// CHECK: only receives the tip; address is pinned to the level's creator.
    #[account(mut, address = level.creator)]
    pub creator: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = player,
        space = 8 + Run::INIT_SPACE,
        seeds = [b"run", level.key().as_ref(), player.key().as_ref()],
        bump
    )]
    pub run: Account<'info, Run>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Level {
    pub creator: Pubkey,
    pub level_id: u64,
    #[max_len(48)]
    pub title: String,
    #[max_len(120)]
    pub prompt: String,
    pub cells: [u8; 36],
    pub start_x: u8,
    pub start_y: u8,
    pub move_cap: u8,
    /// 0 means nobody has solved it yet.
    pub best_moves: u8,
    pub best_solver: Pubkey,
    pub plays: u32,
    pub solves: u32,
    pub tip_lamports: u64,
    pub created_slot: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Run {
    pub level: Pubkey,
    pub player: Pubkey,
    pub moves_len: u8,
    /// 2 bits per move, 4 per byte, first move in the low bits.
    pub moves: [u8; 10],
    pub solved: bool,
    pub bump: u8,
}

#[error_code]
pub enum P2pError {
    #[msg("title is longer than 48 bytes")]
    TitleTooLong,
    #[msg("prompt is longer than 120 bytes")]
    PromptTooLong,
    #[msg("tip is above 0.01 SOL")]
    TipTooHigh,
    #[msg("cells may only contain 0, 1, 2, 3")]
    BadCell,
    #[msg("start is off the grid, on a wall, or on the exit")]
    BadStart,
    #[msg("a level needs exactly one exit")]
    ExitCount,
    #[msg("a level may have at most 3 keys")]
    TooManyKeys,
    #[msg("move cap must be 1..=40")]
    BadMoveCap,
    #[msg("a key or the exit cannot be reached from the start")]
    Unreachable,
    #[msg("run has no moves")]
    EmptyRun,
    #[msg("run is longer than the move cap")]
    TooManyMoves,
    #[msg("move codes are 0..=3")]
    BadMove,
    #[msg("run does not end at the unlocked exit")]
    NotSolved,
    #[msg("moves continue after the exit was reached")]
    TrailingMoves,
    #[msg("run is not shorter than your previous solution")]
    NotBetter,
}

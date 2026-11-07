//! Runs the compiled program (target/deploy/prompt2play.so, produced by `anchor build`)
//! inside LiteSVM. Covers publish, submit_run happy path, invalid paths and tip transfer.

use anchor_lang::{system_program, InstructionData, ToAccountMetas};
use litesvm::LiteSVM;
use prompt2play::{accounts, instruction, Level, Run, ID};
use solana_keypair::Keypair;
use solana_message::{Instruction, Message};
use solana_signer::Signer;
use solana_transaction::Transaction;

use anchor_lang::prelude::Pubkey;
use anchor_lang::AccountDeserialize;

const SO: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/deploy/prompt2play.so");
const TIP: u64 = 5_000_000;

fn setup() -> LiteSVM {
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(ID, SO)
        .expect("run `anchor build` first");
    svm
}

fn funded(svm: &mut LiteSVM) -> Keypair {
    let kp = Keypair::new();
    svm.airdrop(&kp.pubkey(), 2_000_000_000).unwrap();
    kp
}

fn level_pda(creator: &Pubkey, id: u64) -> Pubkey {
    Pubkey::find_program_address(&[b"level", creator.as_ref(), &id.to_le_bytes()], &ID).0
}

fn run_pda(level: &Pubkey, player: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"run", level.as_ref(), player.as_ref()], &ID).0
}

fn send_logs(svm: &mut LiteSVM, signer: &Keypair, ix: Instruction) -> Result<(), String> {
    svm.expire_blockhash();
    let tx = Transaction::new(
        &[signer],
        Message::new(&[ix], Some(&signer.pubkey())),
        svm.latest_blockhash(),
    );
    match svm.send_transaction(tx) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("{:?} | {}", e.err, e.meta.logs.join(" / "))),
    }
}

/// Level with one key: start (0,0), key at (0,1), exit at (5,0). Optimal = 7 (D U RRRRR).
fn cells() -> [u8; 36] {
    let mut c = [0u8; 36];
    c[6] = 2;
    c[5] = 3;
    c
}

fn publish_ix(creator: &Pubkey, id: u64, cells: [u8; 36], cap: u8, tip: u64) -> Instruction {
    Instruction {
        program_id: ID,
        accounts: accounts::PublishLevel {
            creator: *creator,
            level: level_pda(creator, id),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: instruction::PublishLevel {
            level_id: id,
            title: "Test".into(),
            prompt: "a test level".into(),
            cells,
            start_x: 0,
            start_y: 0,
            move_cap: cap,
            tip_lamports: tip,
        }
        .data(),
    }
}

fn submit_ix(player: &Pubkey, creator: &Pubkey, id: u64, moves: Vec<u8>) -> Instruction {
    let level = level_pda(creator, id);
    Instruction {
        program_id: ID,
        accounts: accounts::SubmitRun {
            player: *player,
            level,
            creator: *creator,
            run: run_pda(&level, player),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: instruction::SubmitRun { moves }.data(),
    }
}

fn read_level(svm: &LiteSVM, creator: &Pubkey, id: u64) -> Level {
    let acc = svm.get_account(&level_pda(creator, id)).unwrap();
    Level::try_deserialize(&mut acc.data.as_slice()).unwrap()
}

fn read_run(svm: &LiteSVM, creator: &Pubkey, id: u64, player: &Pubkey) -> Run {
    let level = level_pda(creator, id);
    let acc = svm.get_account(&run_pda(&level, player)).unwrap();
    Run::try_deserialize(&mut acc.data.as_slice()).unwrap()
}

// U=0 D=1 L=2 R=3
const GOOD: [u8; 7] = [1, 0, 3, 3, 3, 3, 3];

#[test]
fn publish_happy_path() {
    let mut svm = setup();
    let creator = funded(&mut svm);
    send_logs(&mut svm, &creator, publish_ix(&creator.pubkey(), 1, cells(), 11, TIP)).unwrap();
    let l = read_level(&svm, &creator.pubkey(), 1);
    assert_eq!(l.creator, creator.pubkey());
    assert_eq!(l.title, "Test");
    assert_eq!(l.move_cap, 11);
    assert_eq!(l.best_moves, 0);
    assert_eq!((l.plays, l.solves), (0, 0));
    assert_eq!(l.tip_lamports, TIP);
    assert_eq!(l.cells, cells());
}

#[test]
fn publish_rejects_bad_levels() {
    let mut svm = setup();
    let creator = funded(&mut svm);
    let me = creator.pubkey();
    // no exit
    let mut no_exit = cells();
    no_exit[5] = 0;
    assert!(send_logs(&mut svm, &creator, publish_ix(&me, 1, no_exit, 10, 0)).is_err());
    // four keys
    let mut four = cells();
    for i in [7, 8, 9] {
        four[i] = 2;
    }
    assert!(send_logs(&mut svm, &creator, publish_ix(&me, 2, four, 10, 0)).is_err());
    // cap too large
    assert!(send_logs(&mut svm, &creator, publish_ix(&me, 3, cells(), 41, 0)).is_err());
    // tip above 0.01 SOL
    assert!(send_logs(&mut svm, &creator, publish_ix(&me, 4, cells(), 10, 10_000_001)).is_err());
    // walled-off exit
    let mut walled = cells();
    walled[4] = 1;
    walled[11] = 1;
    assert!(send_logs(&mut svm, &creator, publish_ix(&me, 5, walled, 10, 0)).is_err());
    for id in 1..=5 {
        assert!(svm.get_account(&level_pda(&me, id)).is_none());
    }
}

#[test]
fn submit_happy_path_and_tip() {
    let mut svm = setup();
    let creator = funded(&mut svm);
    let player = funded(&mut svm);
    let (c, p) = (creator.pubkey(), player.pubkey());
    send_logs(&mut svm, &creator, publish_ix(&c, 1, cells(), 11, TIP)).unwrap();

    let creator_before = svm.get_balance(&c).unwrap();
    let player_before = svm.get_balance(&p).unwrap();
    send_logs(&mut svm, &player, submit_ix(&p, &c, 1, GOOD.to_vec())).unwrap();

    let l = read_level(&svm, &c, 1);
    assert_eq!((l.plays, l.solves, l.best_moves, l.best_solver), (1, 1, 7, p));
    let r = read_run(&svm, &c, 1, &p);
    assert!(r.solved);
    assert_eq!(r.moves_len, 7);
    assert_eq!(
        prompt2play::engine::unpack_moves(&r.moves, 7),
        GOOD.to_vec()
    );
    // creator receives exactly the tip
    assert_eq!(svm.get_balance(&c).unwrap() - creator_before, TIP);
    // player paid the tip plus rent for the run account (and a tx fee)
    assert!(player_before - svm.get_balance(&p).unwrap() > TIP);
}

#[test]
fn invalid_runs_are_rejected_and_change_nothing() {
    let mut svm = setup();
    let creator = funded(&mut svm);
    let player = funded(&mut svm);
    let (c, p) = (creator.pubkey(), player.pubkey());
    send_logs(&mut svm, &creator, publish_ix(&c, 1, cells(), 11, TIP)).unwrap();
    let bad: Vec<Vec<u8>> = vec![
        vec![],                          // empty
        vec![3, 3, 3, 3, 3],             // exit locked, key never taken
        vec![1, 0, 3, 3, 3, 3],          // stops one short
        vec![1, 0, 3, 3, 3, 3, 3, 3],    // moves after exit
        vec![1, 0, 3, 3, 3, 3, 3, 0, 0], // way past
        vec![1, 0, 3, 3, 3, 3, 4],       // bad code
        vec![3; 12],                     // over the cap of 11
    ];
    let creator_before = svm.get_balance(&c).unwrap();
    for m in bad {
        assert!(send_logs(&mut svm, &player, submit_ix(&p, &c, 1, m.clone())).is_err(), "{m:?}");
    }
    let l = read_level(&svm, &c, 1);
    assert_eq!((l.plays, l.solves, l.best_moves), (0, 0, 0));
    assert!(svm.get_account(&run_pda(&level_pda(&c, 1), &p)).is_none());
    assert_eq!(svm.get_balance(&c).unwrap(), creator_before);
}

#[test]
fn wrong_creator_account_is_rejected() {
    let mut svm = setup();
    let creator = funded(&mut svm);
    let player = funded(&mut svm);
    let thief = Keypair::new().pubkey();
    let (c, p) = (creator.pubkey(), player.pubkey());
    send_logs(&mut svm, &creator, publish_ix(&c, 1, cells(), 11, TIP)).unwrap();
    let mut ix = submit_ix(&p, &c, 1, GOOD.to_vec());
    ix.accounts[2].pubkey = thief;
    assert!(send_logs(&mut svm, &player, ix).is_err());
    assert!(svm.get_account(&thief).is_none());
}

#[test]
fn second_solve_must_be_shorter_and_pays_no_second_tip() {
    let mut svm = setup();
    let creator = funded(&mut svm);
    let player = funded(&mut svm);
    let (c, p) = (creator.pubkey(), player.pubkey());
    send_logs(&mut svm, &creator, publish_ix(&c, 1, cells(), 20, TIP)).unwrap();

    // 8 moves: U bump off the grid, D (key), U, R x5
    let slow = vec![0, 1, 0, 3, 3, 3, 3, 3];
    send_logs(&mut svm, &player, submit_ix(&p, &c, 1, slow.clone())).unwrap();
    assert_eq!(read_level(&svm, &c, 1).best_moves, 8);
    let after_first = svm.get_balance(&c).unwrap();

    // same moves again: rejected
    assert!(send_logs(&mut svm, &player, submit_ix(&p, &c, 1, slow)).is_err());
    // equal length by a different route: rejected
    let eq = vec![1, 0, 0, 3, 3, 3, 3, 3]; // D (key), U, U bump, R x5: also 8 moves
    assert!(send_logs(&mut svm, &player, submit_ix(&p, &c, 1, eq)).is_err());

    // shorter: accepted, improves best, no new tip, solves stays 1
    send_logs(&mut svm, &player, submit_ix(&p, &c, 1, GOOD.to_vec())).unwrap();
    let l = read_level(&svm, &c, 1);
    assert_eq!((l.plays, l.solves, l.best_moves, l.best_solver), (2, 1, 7, p));
    assert_eq!(read_run(&svm, &c, 1, &p).moves_len, 7);
    assert_eq!(svm.get_balance(&c).unwrap(), after_first);
}

#[test]
fn best_solver_only_changes_for_strictly_better() {
    let mut svm = setup();
    let creator = funded(&mut svm);
    let a = funded(&mut svm);
    let b = funded(&mut svm);
    let (c, pa, pb) = (creator.pubkey(), a.pubkey(), b.pubkey());
    send_logs(&mut svm, &creator, publish_ix(&c, 1, cells(), 20, 0)).unwrap();
    send_logs(&mut svm, &a, submit_ix(&pa, &c, 1, GOOD.to_vec())).unwrap();
    // b takes a longer route (8 moves): counts as a solve, but best stays with a
    send_logs(&mut svm, &b, submit_ix(&pb, &c, 1, vec![0, 1, 0, 3, 3, 3, 3, 3])).unwrap();
    // c's tip was 0: balance unchanged
    let l = read_level(&svm, &c, 1);
    assert_eq!((l.plays, l.solves, l.best_moves, l.best_solver), (2, 2, 7, pa));
}

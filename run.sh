#!/bin/bash
cd ~/work/prompt2play
echo $$ > run.pid
. ~/.cargo/env
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.avm/bin:$PATH" CARGO_BUILD_JOBS=2
export CLAUDE_CODE_SUBAGENT_MODEL=haiku
claude -p "Read BRIEF.md and build everything in it, following its rules. Work autonomously until all deliverables are done and verified." --model sonnet --advisor opus --effort medium --max-turns 300 --permission-mode acceptEdits --add-dir ~/.cargo --add-dir ~/.rustup --add-dir ~/.avm --add-dir ~/.local/share/solana --allowedTools "Read,Edit,Write,Glob,Grep,Bash(cargo:*),Bash(rustc:*),Bash(anchor:*),Bash(solana:*),Bash(solana-keygen:*),Bash(solana-test-validator:*),Bash(cargo-build-sbf:*),Bash(npm:*),Bash(npx:*),Bash(node:*),Bash(yarn:*),Bash(git add:*),Bash(git commit:*),Bash(git status:*),Bash(git diff:*),Bash(git log:*),Bash(mkdir:*),Bash(ls:*),Bash(chmod:*),Bash(cat:*),Bash(which:*),Bash(sha256sum:*),Bash(sleep:*),Bash(kill:*)" --disallowedTools "Read(./.env),Read(./.env.*),WebFetch,Bash(git push:*)" --output-format stream-json --verbose > log.jsonl 2> err.log
echo done > run.done

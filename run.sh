#!/bin/bash
cd ~/work/prompt2play
echo $$ > run.pid
export CLAUDE_CODE_SUBAGENT_MODEL=haiku
claude -p "Read BRIEF.md and build everything in it, following its rules. Work autonomously until all deliverables are done and verified." --model sonnet --advisor opus --effort medium --max-turns 300 --permission-mode acceptEdits --allowedTools "Read,Edit,Write,Glob,Grep,Bash(cargo:*),Bash(anchor:*),Bash(solana:*),Bash(solana-keygen:*),Bash(solana-test-validator:*),Bash(npm:*),Bash(npx:*),Bash(node:*),Bash(git add:*),Bash(git commit:*),Bash(git status:*),Bash(git diff:*),Bash(git log:*),Bash(mkdir:*),Bash(ls:*),Bash(chmod:*),Bash(cat:*),Bash(source:*),Bash(export:*)" --disallowedTools "Read(./.env),Read(./.env.*),WebFetch" --output-format stream-json --verbose > log.jsonl 2> err.log
echo done > run.done

#!/usr/bin/env bash
# Deploys the program to devnet and publishes three seed levels with real solutions.
#
# Usage: scripts/deploy-and-seed.sh <payer-keypair.json> <program-keypair.json> [rpc-url]
#
# - payer keypair: pays for the deploy and owns the seed levels (needs a few devnet SOL).
# - program keypair: its public key becomes the program id. If it differs from the id compiled
#   into the sources, the sources are updated and the program is rebuilt.
# - rpc-url defaults to https://api.devnet.solana.com. Anything that is not devnet or localhost is refused.
set -euo pipefail

PAYER="${1:?payer keypair path required}"
PROGRAM_KP="${2:?program keypair path required}"
RPC="${3:-https://api.devnet.solana.com}"

case "$RPC" in
  *devnet*|*localhost*) ;;
  *) echo "refusing: devnet only" >&2; exit 2 ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROGRAM_ID="$(solana-keygen pubkey "$PROGRAM_KP")"
CURRENT_ID="$(grep -o 'declare_id!("[^"]*")' programs/prompt2play/src/lib.rs | sed 's/declare_id!("\(.*\)")/\1/')"

if [ "$PROGRAM_ID" != "$CURRENT_ID" ]; then
  echo "program id changes: $CURRENT_ID -> $PROGRAM_ID"
  sed -i "s/$CURRENT_ID/$PROGRAM_ID/g" programs/prompt2play/src/lib.rs Anchor.toml shared/chain.ts
fi

mkdir -p target/deploy
cp "$PROGRAM_KP" target/deploy/prompt2play-keypair.json
anchor build

# Optional fixed buffer keypair (BUFFER_KP) so a failed deploy resumes the same buffer.
solana program deploy target/deploy/prompt2play.so \
  --program-id "$PROGRAM_KP" \
  ${BUFFER_KP:+--buffer "$BUFFER_KP"} \
  --keypair "$PAYER" \
  --url "$RPC"

npm install --silent
npx tsx scripts/seed.mts "$PAYER" "$RPC" "$PROGRAM_ID"

echo
echo "Program id: $PROGRAM_ID"
echo "Set VITE_PROGRAM_ID=$PROGRAM_ID (and VITE_RPC) for the web app if you changed the program id."

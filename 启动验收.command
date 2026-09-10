#!/bin/zsh
cd "$(dirname "$0")" || exit 1
pnpm exec node scripts/preview.mjs

#!/bin/sh
# Links this folder as the html-flow-diagram skill of Claude Code. Never replaces a real folder or file.
set -e
here=$(cd "$(dirname "$0")" && pwd)
target="$HOME/.claude/skills/html-flow-diagram"

if [ -L "$target" ] || [ ! -e "$target" ]; then
  mkdir -p "$(dirname "$target")"
  ln -sfn "$here" "$target"
  echo "linked $target -> $here"
else
  echo "skipped $target: it exists and is not a link" >&2
  exit 1
fi

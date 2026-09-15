#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
agent_dir="${HOME}/.pi/agent"

mkdir -p "$agent_dir"
ln -sfn "$repo_dir/skills" "$agent_dir/skills"
ln -sfn "$repo_dir/extensions" "$agent_dir/extensions"
ln -sfn "$repo_dir/_AGENTS.md" "$agent_dir/AGENTS.md"
ln -sfn "$repo_dir/_SYSTEM.md" "$agent_dir/SYSTEM.md"
ln -sfn "$repo_dir/settings.json" "$agent_dir/settings.json"

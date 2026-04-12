#!/usr/bin/env bash
# ============================================================================
# We Digital — Twenty CRM Upstream Upgrade Script
#
# Usage:
#   ./scripts/upgrade-upstream.sh v1.22.0
#
# What it does:
#   1. Fetches the target upstream tag
#   2. Creates a new branch from main
#   3. Replaces the entire tree with the upstream tag
#   4. Applies the We Digital custom patch (we-digital-custom.patch)
#   5. Runs yarn install to sync lockfile
#   6. Commits and shows next steps
#
# Prerequisites:
#   - 'upstream' remote pointing to https://github.com/twentyhq/twenty.git
#   - Clean working tree (no uncommitted changes)
#   - we-digital-custom.patch in repo root
# ============================================================================

set -euo pipefail

TARGET_TAG="${1:-}"

if [[ -z "$TARGET_TAG" ]]; then
  echo "Usage: $0 <upstream-tag>"
  echo "Example: $0 v1.22.0"
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
PATCH_FILE="$REPO_ROOT/we-digital-custom.patch"
BRANCH_NAME="chore/upgrade-to-${TARGET_TAG}"

# Preflight checks
if [[ ! -f "$PATCH_FILE" ]]; then
  echo "ERROR: $PATCH_FILE not found"
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: Working tree is not clean. Commit or stash changes first."
  exit 1
fi

echo "=== Step 1: Fetch upstream tag $TARGET_TAG ==="
if ! git remote | grep -q upstream; then
  echo "Adding upstream remote..."
  git remote add upstream https://github.com/twentyhq/twenty.git
fi
git fetch upstream tag "$TARGET_TAG" --no-tags

echo ""
echo "=== Step 2: Create branch $BRANCH_NAME from main ==="
git checkout main
git checkout -b "$BRANCH_NAME"

echo ""
echo "=== Step 3: Replace tree with $TARGET_TAG ==="
git rm -rf . --quiet
git checkout "$TARGET_TAG" -- .

echo ""
echo "=== Step 4: Apply We Digital custom patch ==="
# --3way allows git to handle conflicts if upstream changed our patched files
if git apply --3way "$PATCH_FILE"; then
  echo "Patch applied cleanly."
else
  echo ""
  echo "WARNING: Patch had conflicts. Resolve them manually, then:"
  echo "  git add -A && git commit"
  echo ""
  echo "Conflicting files will have <<<< markers."
  echo "Check if upstream changed any of these files:"
  echo "  - IframeWidget.tsx (check for new security fixes)"
  echo "  - cache-storage, redis-client, session-storage (check for API changes)"
  echo "  - file-storage.service.ts (check deleteByFileId signature)"
  echo "  - main.ts, queue-worker.ts (check bootstrap changes)"
  exit 1
fi

echo ""
echo "=== Step 5: Update yarn.lock ==="
yarn install || true

echo ""
echo "=== Step 6: Stage and commit ==="
git add -A
git commit -m "chore: upgrade Twenty CRM to ${TARGET_TAG}

Replace entire codebase with upstream ${TARGET_TAG} and re-apply
We Digital custom patches (see we-digital-custom.patch).
"

echo ""
echo "============================================"
echo "Done! Next steps:"
echo "  1. git push -u origin $BRANCH_NAME"
echo "  2. Create PR: gh pr create --base main"
echo "  3. Wait for CI to pass"
echo "  4. After merge, regenerate patch:"
echo "     git diff ${TARGET_TAG} HEAD > we-digital-custom.patch"
echo "============================================"

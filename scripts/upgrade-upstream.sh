#!/usr/bin/env bash
# ============================================================================
# We Digital — Twenty CRM Upstream Upgrade Script
#
# Usage:
#   ./scripts/upgrade-upstream.sh v1.22.0
#
# What it does:
#   1. Creates a safety tag on main (pre-<tag>-upgrade)
#   2. Fetches the target upstream tag
#   3. Creates a new branch from main
#   4. Replaces the entire tree with the upstream tag
#   5. Applies the We Digital custom patch (we-digital-custom.patch)
#   6. Updates .upstream-version
#   7. Runs yarn install to sync lockfile
#   8. Commits everything
#   9. Regenerates the patch for the next upgrade
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

echo "=== Step 1: Create safety tag on main ==="
SAFETY_TAG="pre-${TARGET_TAG}-upgrade"
if git rev-parse "$SAFETY_TAG" >/dev/null 2>&1; then
  echo "Tag $SAFETY_TAG already exists, skipping."
else
  git tag "$SAFETY_TAG" main
  echo "Created tag: $SAFETY_TAG"
fi

echo ""
echo "=== Step 2: Fetch upstream tag $TARGET_TAG ==="
if ! git remote | grep -q upstream; then
  echo "Adding upstream remote..."
  git remote add upstream https://github.com/twentyhq/twenty.git
fi
git fetch upstream tag "$TARGET_TAG" --no-tags

echo ""
echo "=== Step 3: Create branch $BRANCH_NAME from main ==="
git checkout main
git checkout -b "$BRANCH_NAME"

echo ""
echo "=== Step 4: Replace tree with $TARGET_TAG ==="
# Save patch to temp — git rm deletes all tracked files including the patch itself
PATCH_BACKUP=$(mktemp)
cp "$PATCH_FILE" "$PATCH_BACKUP"
git rm -rf . --quiet
git checkout "$TARGET_TAG" -- .

echo ""
echo "=== Step 5: Apply We Digital custom patch ==="
# --3way allows git to handle conflicts if upstream changed our patched files
if git apply --3way "$PATCH_BACKUP"; then
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
echo "=== Step 6: Update .upstream-version ==="
echo "$TARGET_TAG" > "$REPO_ROOT/.upstream-version"
echo "Set .upstream-version to $TARGET_TAG"

echo ""
echo "=== Step 7: Update yarn.lock ==="
yarn install || true

echo ""
echo "=== Step 8: Stage and commit ==="
git add -A
git commit -m "chore: upgrade Twenty CRM to ${TARGET_TAG}

Replace entire codebase with upstream ${TARGET_TAG} and re-apply
We Digital custom patches (see we-digital-custom.patch).
"

echo ""
echo "=== Step 9: Regenerate patch for next upgrade ==="
git diff "${TARGET_TAG}" HEAD > "$PATCH_FILE"
git add "$PATCH_FILE"
git commit --amend --no-edit

rm -f "$PATCH_BACKUP"

echo ""
echo "============================================"
echo "Done! Next steps:"
echo "  1. git push -u origin $BRANCH_NAME"
echo "  2. Create PR: gh pr create --base main"
echo "  3. Wait for CI to pass"
echo "  4. After merge, deploy via workflow_dispatch:"
echo "     gh workflow run deploy.yaml -f image_tag=${TARGET_TAG}"
echo "============================================"

#!/usr/bin/env bash
# ============================================================================
# We Digital — Twenty CRM Upstream Upgrade Script
#
# Usage:
#   ./scripts/upgrade-upstream.sh twenty/v2.15.0
#
# What it does:
#   1. Creates a safety tag on main (pre-<tag>-upgrade)
#   2. Fetches the target upstream tag/ref
#   3. Creates a new branch from main
#   4. Replaces the entire tree with the upstream tag
#   5. Applies the We Digital custom patch (we-digital-custom.patch)
#   6. Updates .upstream-version with the normalized vX.Y.Z tag
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

TARGET_REF="${1:-}"

if [[ -z "$TARGET_REF" ]]; then
  echo "Usage: $0 <upstream-tag-or-ref>"
  echo "Example: $0 twenty/v2.15.0"
  exit 1
fi

TARGET_REF="${TARGET_REF#refs/tags/}"
NORMALIZED_TAG="${TARGET_REF##*/}"

REPO_ROOT="$(git rev-parse --show-toplevel)"
PATCH_FILE="$REPO_ROOT/we-digital-custom.patch"
BRANCH_NAME="chore/upgrade-to-${NORMALIZED_TAG}"

fetch_tag_ref() {
  local ref="$1"

  git fetch upstream "refs/tags/${ref}:refs/tags/${ref}" --no-tags
}

prune_we_digital_workflows() {
  find "$REPO_ROOT/.github/workflows" -type f ! -name 'build-and-push.yaml' -print0 |
    xargs -0 rm -f
}

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
SAFETY_TAG="pre-${NORMALIZED_TAG}-upgrade"
if git rev-parse "$SAFETY_TAG" >/dev/null 2>&1; then
  echo "Tag $SAFETY_TAG already exists, skipping."
else
  git tag "$SAFETY_TAG" main
  echo "Created tag: $SAFETY_TAG"
fi

echo ""
echo "=== Step 2: Fetch upstream tag/ref $TARGET_REF ==="
if ! git remote | grep -q upstream; then
  echo "Adding upstream remote..."
  git remote add upstream https://github.com/twentyhq/twenty.git
fi

RESOLVED_TAG="$TARGET_REF"

if ! fetch_tag_ref "$RESOLVED_TAG"; then
  if [[ "$TARGET_REF" == v* ]]; then
    RESOLVED_TAG="twenty/$TARGET_REF"
    echo "Falling back to namespaced Twenty release tag: $RESOLVED_TAG"
    fetch_tag_ref "$RESOLVED_TAG"
  else
    echo "ERROR: Could not fetch upstream tag/ref '$TARGET_REF'"
    exit 1
  fi
fi

echo "Resolved upstream ref: $RESOLVED_TAG"

echo ""
echo "=== Step 3: Create branch $BRANCH_NAME from main ==="
git checkout main
git checkout -b "$BRANCH_NAME"

echo ""
echo "=== Step 4: Replace tree with $RESOLVED_TAG ==="
# Save patch to temp — git rm deletes all tracked files including the patch itself
PATCH_BACKUP=$(mktemp)
cp "$PATCH_FILE" "$PATCH_BACKUP"
git rm -rf . --quiet
git checkout "refs/tags/$RESOLVED_TAG" -- .

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
echo "=== Step 5b: Prune non-build GitHub workflows ==="
prune_we_digital_workflows

echo ""
echo "=== Step 6: Update .upstream-version ==="
echo "$NORMALIZED_TAG" > "$REPO_ROOT/.upstream-version"
echo "Set .upstream-version to $NORMALIZED_TAG"

echo ""
echo "=== Step 7: Update yarn.lock ==="
yarn install || true

echo ""
echo "=== Step 8: Stage and commit ==="
git add -A
git commit -m "chore: upgrade Twenty CRM to ${NORMALIZED_TAG}

Replace entire codebase with upstream ${RESOLVED_TAG} and re-apply
We Digital custom patches (see we-digital-custom.patch).
"

echo ""
echo "=== Step 9: Regenerate patch for next upgrade ==="
git diff "refs/tags/${RESOLVED_TAG}" HEAD -- . ':(exclude)we-digital-custom.patch' > "$PATCH_FILE"
git add "$PATCH_FILE"
git commit --amend --no-edit

rm -f "$PATCH_BACKUP"

echo ""
echo "============================================"
echo "Done! Next steps:"
echo "  1. git push -u origin $BRANCH_NAME"
echo "  2. Create PR: gh pr create --base main"
echo "  3. Wait for CI to pass"
echo "  4. After merge: build-and-push auto-builds + triggers deploy"
echo "  5. For controlled upgrades: set CRM_IMAGE_TAG=${NORMALIZED_TAG} in bbc-devops"
echo "============================================"

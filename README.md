# We Digital — Twenty CRM (Fork)

Fork of [twentyhq/twenty](https://github.com/twentyhq/twenty) with We Digital customizations.

**Current upstream version:** v1.22.0 (see `.upstream-version`)

## How It Works

This is a **build-only** repository. All We Digital customizations live in a single diff file — `we-digital-custom.patch`. On every push to `main`, the `build-and-push` workflow builds a Docker image and pushes it to GHCR:

```
ghcr.io/we-digital/wedigital-twenty-crm:v1.XX.0
ghcr.io/we-digital/wedigital-twenty-crm:latest
```

Deployment happens in a separate repo — [bbc-devops](https://github.com/we-digital/bbc-devops).

## Upgrade to a New Upstream Version

### Prerequisites

- `upstream` remote pointing to `https://github.com/twentyhq/twenty.git`
- Clean working tree (no uncommitted changes)
- `we-digital-custom.patch` in repo root
- Node.js + Yarn

### Run the upgrade script

```bash
./scripts/upgrade-upstream.sh v1.XX.0
```

The script will:
1. Create a safety tag `pre-v1.XX.0-upgrade` on main
2. Fetch the target upstream tag
3. Create branch `chore/upgrade-to-v1.XX.0` from main
4. Replace the entire tree with the upstream tag
5. Apply `we-digital-custom.patch` via `git apply --3way`
6. Update `.upstream-version`
7. Run `yarn install` to sync lockfile
8. Commit and regenerate the patch

### After the script

```bash
# Push the branch
git push -u origin chore/upgrade-to-v1.XX.0

# Create PR (ALWAYS use --repo to avoid pushing PR to upstream!)
gh pr create --repo we-digital/wedigital-twenty-crm --base main

# Wait for CI, then merge
```

After merge, `build-and-push` workflow auto-builds the image. Then update `CRM_IMAGE_TAG` and `APP_VERSION` in [bbc-devops](https://github.com/we-digital/bbc-devops) to deploy.

### If the patch has conflicts

The script will exit with a warning. Resolve conflicts manually (look for `<<<<` markers), then:

```bash
git add -A
git commit

# Regenerate the patch
git diff v1.XX.0 HEAD > we-digital-custom.patch
git add we-digital-custom.patch
git commit -m "chore: regenerate we-digital-custom.patch"
```

## What's in the Patch

All We Digital customizations that differ from upstream:

| Area | What |
|------|------|
| `IframeWidget.tsx` | Jotai state + postMessage `WIDGET_AUTH` token |
| Redis/Valkey | Reconnect strategy, error handlers, keepAlive, pingInterval, IORedis for session store |
| `file-storage.service.ts` | `deleteByFileId` uses `application.universalIdentifier` |
| `main.ts`, `queue-worker.ts` | Process-level `uncaughtException`/`unhandledRejection` + BullMQ error handler |
| Deploy workflow | `build-and-push.yaml` — GHCR + DigitalOcean App Platform |
| Docker, widget | docker-compose, widget infrastructure |

## Important Notes

- **Never skip versions.** Workspace upgrade commands are removed from upstream after a few minor versions. Upgrade step by step (e.g. v1.19 -> v1.20 -> v1.21 -> v1.22).
- **Always use `--repo` with `gh pr create`.** Without it, the PR goes to the upstream `twentyhq/twenty` repo (we learned this the hard way).
- **Always regenerate the patch after merge.** Otherwise the next upgrade will apply a stale diff.

## Upgrade History

| Date | From | To | Method | Notes |
|------|------|----|--------|-------|
| 2026-03-30 | — | v1.19.11 | Bot (paperclip-ai) | Minor version merge |
| 2026-04-17 | v1.19.11 | v1.20.0 | `upgrade-upstream.sh` | 15 workspace commands |
| 2026-04-17 | v1.20.0 | v1.21.0 | `upgrade-upstream.sh` | 14 workspace + 3 instance commands |
| 2026-04-18 | v1.21.0 | v1.22.0 | `upgrade-upstream.sh` | Manual SQL migrations required (upstream bugs) |

## Files

| File | Purpose |
|------|---------|
| `we-digital-custom.patch` | All We Digital customizations as a single diff |
| `.upstream-version` | Current upstream tag (read by CI) |
| `scripts/upgrade-upstream.sh` | Automated upgrade script |
| `.github/workflows/build-and-push.yaml` | Build Docker image and push to GHCR |

## Upstream

- Repo: [twentyhq/twenty](https://github.com/twentyhq/twenty)
- Docs: [docs.twenty.com](https://docs.twenty.com)
- Stack: TypeScript, NestJS, BullMQ, PostgreSQL, Redis, React, Jotai

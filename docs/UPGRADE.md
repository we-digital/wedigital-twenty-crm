# Обновление wedigital-twenty-crm

Подробная инструкция по апгрейду форка Twenty CRM с upstream `twentyhq/twenty` и последующему деплою в prod-стек we-digital.

## 0. Архитектура: build vs deploy

Разделение жёсткое, никогда не путать:

| Репо | Роль |
|---|---|
| `we-digital/wedigital-twenty-crm` | **Только build.** Поддержка форка, патч, сборка образа в GHCR. Никакого деплоя. |
| `we-digital/bbc-devops` | **Только deploy.** Меняет `CRM_IMAGE_TAG` + `APP_VERSION`, рендерит DO App Platform spec, делает бэкапы и `force-deploy`. |

Любая попытка задеплоить из CRM-репо — ошибка. И наоборот: апгрейд upstream-кода никогда не идёт через `bbc-devops`.

---

## 1. Pre-flight (CRM-репо)

```bash
cd /path/to/wedigital-twenty-crm
git status                          # дерево чистое
git fetch origin --prune
git checkout main && git merge --ff-only origin/main
cat .upstream-version               # текущий тег
git remote -v                       # upstream → twentyhq/twenty.git
```

Начиная с линейки `2.10.x`, upstream публикует релизы Twenty под namespaced ref'ами вида `twenty/v2.15.0`, но в нашем форке `.upstream-version` и GHCR-теги остаются в нормализованном формате `v2.15.0`.

Проверить, поддерживается ли cross-version jump до целевого тега:

```bash
grep -r "TWENTY_PREVIOUS_VERSIONS" packages/twenty-server/src --include="*.ts" -l
```

Cross-version поддерживается с **v1.21.0+**. Если шаг слишком большой и каких-то промежуточных версий нет в `TWENTY_PREVIOUS_VERSIONS` — апгрейд делается ступенями (как было `v1.19.11 → v1.20.11 → v1.21 → v1.22`).

---

## 2. Запуск апгрейда

```bash
./scripts/upgrade-upstream.sh twenty/v2.16.0    # пример
```

Что скрипт делает (в этом порядке):

1. **Fast-forward local `main`** до `origin/main`, затем safety tag `pre-<tag>-upgrade` — точка отката.
2. **Fetch** upstream-тега/ref'а (`upstream` remote = `twentyhq/twenty.git`, добавляется автоматически). Если передан `v2.15.0`, скрипт умеет fallback на `twenty/v2.15.0`.
3. **Branch** `chore/upgrade-to-<tag>` от `main`.
4. **`git rm -rf .` + `git checkout <tag> -- .`** — полная замена дерева на upstream.
5. **`git apply --3way we-digital-custom.patch`** — наложение наших правок.
6. `.upstream-version` → нормализованный тег `vX.Y.Z`.
7. `yarn install` (обновить lockfile).
8. Commit `chore: upgrade Twenty CRM to <tag>`.
9. **Регенерация патча** без upstream workflow-шумов: весь diff, кроме `we-digital-custom.patch` и `.github/workflows/*`, затем отдельным проходом вернуть только `build-and-push.yaml`, после чего `commit --amend`.

---

## 3. Резолв конфликтов патча

`--3way` сам справляется с большинством шифтов. Если что-то падает — конфликтные маркеры `<<<<` в файлах. Места, где регулярно ломается:

- **`packages/twenty-server/src/main.ts`** — `configTransformers` + `process.on('uncaughtException')` / `unhandledRejection`. Upstream вставляет новые импорты между нашими блоками — context shift.
- **`IframeWidget.tsx`** — наш `useState` + `postMessage('widget:context')` протокол. Если upstream добавит security-фиксы для iframe — посмотреть, не дублируется ли логика. **Будет удалён** после миграции на Twenty Apps SDK (см. `visard-twenty`).
- **Redis/Valkey** (`cache-storage`, `redis-client`, `session-storage`) — наши `keepAlive`, `pingInterval`, `IORedis` для session store. Upstream иногда меняет сигнатуры.
- **`file-storage.service.ts`** — `deleteByFileId` использует `application.universalIdentifier`.
- **`bullmq.driver.ts`** — наш worker error handler.
- **`queue-worker.ts`** — process-level handlers (как в `main.ts`).
- **Deploy-workflows** (`build-and-push.yaml`, `cd-deploy-main.yaml`) — наша GHCR-сборка.

После ручного резолва:

```bash
git add -A && git commit
# затем регенерировать патч ВРУЧНУЮ (скрипт упал на шаге 5):
git diff <tag> HEAD -- . \
  ':(exclude)we-digital-custom.patch' \
  ':(exclude).github/workflows/*' > we-digital-custom.patch
git diff <tag> HEAD -- .github/workflows/build-and-push.yaml >> we-digital-custom.patch
git add we-digital-custom.patch
git commit --amend --no-edit
```

Размер патча для ориентира: **v2.2.0 — 1322 строки, 28 файлов**. Резкий рост может означать, что регенерация захватила что-то лишнее.

---

## 4. PR в форк

```bash
git push -u origin chore/upgrade-to-<tag>
gh pr create --repo we-digital/wedigital-twenty-crm \
  --base main \
  --title "chore: upgrade to <tag>" \
  --body "..."
```

**Критично: `--repo we-digital/...`.** Без флага `gh pr create` уходит в upstream `twentyhq/twenty` (был инцидент — PR #19778, пришлось закрывать и чистить body).

После merge в `main` — `build-and-push.yaml` сам собирает образ и пушит в GHCR с нормализованными тегами `vX.Y.Z`, `sha-<short>`, `latest`.

---

## 5. Деплой (bbc-devops)

```bash
cd /path/to/bbc-devops
git checkout -b chore/crm-<tag>
```

Поменять **три места одновременно**:

```diff
# .env.prod
- CRM_IMAGE_TAG=v2.2.0
+ CRM_IMAGE_TAG=v2.3.0

# prod/.env.crm-server
- APP_VERSION=2.2.0
+ APP_VERSION=2.3.0

# prod/.env.crm-worker
- APP_VERSION=2.2.0
+ APP_VERSION=2.3.0
```

**Почему три:** `.env.prod` → тег образа в spec'е. `APP_VERSION` живёт в **runtime env контейнера** (`prod/.env.crm-server`, `prod/.env.crm-worker`) и читается upgrade-командами Twenty при старте. Если `APP_VERSION` отстал от образа — upgrade abort на каждом деплое (это и был корень саги `v1.21 → v1.22`).

PR + merge, затем:

```bash
./sync-env.sh --env prod --doctl-context bbc --force-deploy
```

Скрипт сам:

- проверит свежий бэкап Postgres (`twentydb` через прямой порт 25060, не пулер 25061) и Valkey RDB → `~/backups/bbc-YYYY-MM-DD/`,
- отрендерит spec из `app-spec.yaml.tpl`,
- обновит DO App,
- запустит deploy.

**Не запускать одновременно с деплоем `visard-twenty`** — DO App Platform restart прерывает Twenty App install.

---

## 6. Проверка после деплоя

```bash
# CRM
curl -fsS https://crm.respon.io/healthz

# Логи в DO (через doctl)
doctl apps logs <app-id> --type run --component crm-server --tail 200 --context bbc
```

В Postgres `twentydb` должны появиться новые строки в `core."upgradeMigration"` (для v2.2.0 было +27). Если строк нет или статус `failed` — смотреть логи `crm-server` сразу после старта контейнера.

---

## 7. Подводные камни (исторические)

- **v1.22.0 bootstrap migration баг.** `runBootstrapMigrations()` не находил миграцию в NestJS DataSource (glob'ы не заполняются). Помечено `RemovedSinceVersion<'1.23.0'>` — в v1.23 убрано upstream'ом.
- **v1.22.0 sequence order баг.** Workspace iterator ходит в ORM с `workspaceId` до того, как instance command добавит колонку. Лечилось ручным SQL.
- **`workspace.version` не обновляется в v1.22.0** — трекинг ушёл в `core."upgradeMigration"`.
- **`bodyV2` field metadata после v1.20** — `MigrateRichTextToText` записал `type=TEXT`, ORM генерирует flat query. Фикс: `UPDATE core."fieldMetadata" SET type='RICH_TEXT' WHERE name='bodyV2'`.
- **oxlint `no-state-useref`** — `useRef` для state не пройдёт CI (v2.2.0). Использовать `useState`.
- **Workspace upgrade commands удаляются** через несколько минорных. Пропущенные апдейты требуют поэтапного прохода.

Все ручные SQL — только после бэкапа и через `psql` напрямую (порт 25060), не через пулер.

---

## 8. Rollback

В `bbc-devops`:

```diff
- CRM_IMAGE_TAG=v2.3.0
+ CRM_IMAGE_TAG=v2.2.0
```

\+ откат `APP_VERSION` в обоих `.env.crm-*` → PR → merge → `sync-env.sh --force-deploy`.

Для отката данных — restore дампа `defaultdb_*.dump` в `twentydb` (cluster `bbc-db-sgp`, id `e50dca84-9e67-4e01-a330-d214e85602ae`, план `db-s-1vcpu-1gb`, лимит ~22 user-коннектов).

В CRM-репо — safety tag `pre-<tag>-upgrade` всегда на месте:

```bash
git reset --hard pre-<tag>-upgrade   # только если PR ещё не вмёржен
```

---

## 9. Где искать артефакты

- **GHCR:** `ghcr.io/we-digital/wedigital-twenty-crm:<tag>`.
- **DO:** doctl context `bbc`, app `crm-server` + `crm-worker`, cluster `bbc-db-sgp`.
- **Прод:** `crm.respon.io` (мульти-тенантный — BBC, Visard, и др.).
- **Бэкапы:** `~/backups/bbc-YYYY-MM-DD/` на машине, с которой запускается `sync-env.sh`.

---

## 10. Чеклист апгрейда

- [ ] `git status` чистый, на `main`
- [ ] Целевой тег есть в `TWENTY_PREVIOUS_VERSIONS` от текущего `.upstream-version`
- [ ] `./scripts/upgrade-upstream.sh <tag>` отработал без конфликтов (или конфликты разрешены вручную)
- [ ] `.upstream-version` обновлён, `we-digital-custom.patch` регенерирован
- [ ] `yarn install` без ошибок, lockfile в коммите
- [ ] PR через `gh pr create --repo we-digital/wedigital-twenty-crm`
- [ ] CI зелёный, PR смёржен → образ в GHCR
- [ ] В `bbc-devops` обновлены три места: `.env.prod` (`CRM_IMAGE_TAG`) + `prod/.env.crm-server` (`APP_VERSION`) + `prod/.env.crm-worker` (`APP_VERSION`)
- [ ] Свежий бэкап Postgres + Valkey
- [ ] `sync-env.sh --env prod --doctl-context bbc --force-deploy`
- [ ] `crm.respon.io/healthz` ok, новые строки в `core."upgradeMigration"`, в логах нет ошибок

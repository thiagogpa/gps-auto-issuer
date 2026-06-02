# Improvement Plan

## Priority 1 — Security Fixes

### 1.1 Fix shell injection in docker-compose.yml

**Problem:** `CRON_SCHEDULE` is interpolated directly into a shell command. A malicious value like `; rm -rf /` would execute arbitrary commands.
**Fix:** Generate a proper cron file from a validated expression instead of injecting into shell string. Add cron expression validation in `log-schedule.js` before use.
**Files:** `docker-compose.yml`, `src/log-schedule.js`

### 1.2 Run Docker container as unprivileged user

**Problem:** Container runs as root by default.
**Fix:** Add `RUN addgroup -S app && adduser -S app -G app` and `USER app` to Dockerfile. Ensure output directory permissions are correct.
**Files:** `Dockerfile`

### 1.3 Redact sensitive data from logs

**Problem:** `captcha.js` logs 30 chars of CapSolver token; PIS and config values may leak.
**Fix:** Truncate token logs to 8 chars max. Add a `redact()` utility for PIS (show last 4 digits only). Ensure Discord webhook URL is never logged.
**Files:** `src/captcha.js`, `src/helpers.js`, `src/index.js`

### 1.4 Validate PIS input format

**Problem:** PIS is accepted as any string — no length or format check.
**Fix:** Add PIS validation in `config.js` (must be 11 digits after stripping non-digits). Fail fast with clear error.
**Files:** `src/config.js`

---

## Priority 2 — Reliability & Error Handling

### 2.1 Wrap BCB minimum wage API call in try-catch with fallback

**Problem:** If the BCB API at `page3-pagamento.js` fails, the entire automation crashes with no retry.
**Fix:** Wrap `axios.get()` in try-catch. Retry once. If still failing, use a hardcoded fallback value (current minimum wage) with a warning log and Discord alert.
**Files:** `src/pages/page3-pagamento.js`

### 2.2 Propagate errors instead of swallowing them

**Problem:** Multiple catch blocks log errors but continue execution with incomplete state (captcha.js empty catch, discord.js console.error, page5 partial data).
**Fix:**

- `captcha.js`: Remove empty `catch {}` block (line ~289). Ensure each tier throws on failure so the waterfall continues correctly.
- `discord.js`: Replace `console.error` with `logger.error`. Rethrow or return error status so callers know notification failed.
- `page5-resumo.js`: Validate all extracted fields before returning. Throw if critical fields (barcode, total) are missing.
  **Files:** `src/captcha.js`, `src/notifications/discord.js`, `src/pages/page5-resumo.js`

### 2.3 Fix event listener memory leaks

**Problem:** `page.on('response', ...)` in page4 and `browser.on('targetcreated', ...)` in index.js are never removed.
**Fix:** Store listener references and call `removeListener()` in finally blocks or after use.
**Files:** `src/pages/page4-emissao.js`, `src/index.js`

### 2.4 Add exponential backoff for CapSolver polling

**Problem:** Fixed 2-second polling interval for up to 80 seconds is wasteful.
**Fix:** Start at 2s, increase by 1.5x each poll, cap at 10s. Reduce max attempts accordingly.
**Files:** `src/captcha.js`

---

## Priority 3 — Testing

### 3.1 Add tests for BCB API failure scenarios

**Problem:** No tests for what happens when the minimum wage API is down.
**Fix:** Add test cases: API timeout, 500 response, malformed JSON, fallback value used.
**Files:** `tests/page3.test.js` (new or extend existing)

### 3.2 Add tests for Discord notification failures

**Problem:** Discord silent failures are untested.
**Fix:** Test that failed webhook calls return error status, not silently succeed.
**Files:** `tests/discord.test.js` (extend)

### 3.3 Add tests for config validation

**Problem:** Invalid PIS, missing keys, and malformed env vars untested.
**Fix:** Add validation tests for config.js edge cases.
**Files:** `tests/config.test.js` (new or extend existing)

### 3.4 Add tests for PDF capture timeout

**Problem:** If popup takes longer than 30s, null is returned silently — untested.
**Fix:** Add test that verifies timeout behavior returns error/logs warning.
**Files:** `tests/page4.test.js` (extend)

---

## Priority 4 — Observability

### 4.1 Add timing metrics to each page step

**Problem:** No visibility into how long each step takes. Hard to diagnose slowdowns.
**Fix:** Add `const start = Date.now()` at beginning of each page module, log elapsed time on completion. Include in Discord summary embed.
**Files:** `src/pages/page1-consulta.js`, `src/pages/page2-confirmacao.js`, `src/pages/page3-pagamento.js`, `src/pages/page4-emissao.js`, `src/pages/page5-resumo.js`, `src/index.js`

### 4.2 Use logger consistently (replace console.error)

**Problem:** `discord.js` uses `console.error` instead of Winston logger.
**Fix:** Import and use logger in all modules. Remove all `console.error`/`console.log` calls.
**Files:** `src/notifications/discord.js`

### 4.3 Add Docker healthcheck

**Problem:** If crond dies, the scheduler container stays up silently.
**Fix:** Add `healthcheck` to `docker-compose.yml` for the scheduler service (e.g., check crond process is alive).
**Files:** `docker-compose.yml`

---

## Priority 5 — Code Quality

### 5.1 Extract shadow DOM helper abstraction

**Problem:** Shadow DOM piercing logic (`evaluateHandle` + shadow root traversal) is duplicated across page modules.
**Fix:** Create a shared `pierceSelector(page, hostSelector, innerSelector)` utility in `helpers.js`. Refactor page modules to use it.
**Files:** `src/helpers.js`, `src/pages/page1-consulta.js`, `src/pages/page3-pagamento.js`, `src/pages/page4-emissao.js`

### 5.2 Replace polling loops with waitForFunction

**Problem:** `page4-emissao.js` manually polls button disabled state with 20 retries x 500ms.
**Fix:** Replace with `page.waitForFunction()` which is more efficient and integrates with Puppeteer's event loop.
**Files:** `src/pages/page4-emissao.js`

### 5.3 Split runAutomation() into smaller functions

**Problem:** `runAutomation()` in index.js handles browser launch, page navigation, and error artifact saving — too many responsibilities.
**Fix:** Extract `launchBrowser()`, `saveErrorArtifacts(page, error)`, and keep `runAutomation()` as a thin orchestrator.
**Files:** `src/index.js`

---

## Implementation Order

```
Week 1: Priority 1 (Security) — All 4 items
Week 2: Priority 2 (Reliability) — Items 2.1–2.4
Week 3: Priority 3 (Testing) — Items 3.1–3.4
Week 4: Priority 4 (Observability) + Priority 5 (Code Quality)
```

Each priority group should be a separate PR for easier review.

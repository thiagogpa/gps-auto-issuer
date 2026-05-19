# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start                         # Run automation locally
npm run debug                     # Run with DEBUG=true and LOG_LEVEL=debug
npm test                          # Run all Jest tests (verbose)
npx jest tests/captcha.test.js    # Run a single test file
npx jest --coverage               # Run tests with coverage report
```

**Docker**:
```bash
docker compose up --build           # Start scheduled worker (cron)
docker compose run --rm gps-worker  # Run automation once in container
```

**Environment**: Copy `.env.example` to `.env`. Required vars: `PIS`, `CAPSOLVER_API_KEY`. Optional: `WIT_AI_TOKEN` (enables Tier 2 audio CAPTCHA), `DISCORD_WEBHOOK_URL`, `DRY_RUN=true` (skips final "Emitir GPS" click).

## Architecture

This is a headless Puppeteer automation that navigates a 5-page government form to emit GPS boletos (payment slips).

### Execution Flow

`src/index.js` → `runWithRetry()` → `runAutomation()` → pages 1–5 in sequence → Discord notification

`src/index.js` is the orchestrator. It forces `TZ=America/Sao_Paulo` at process start, launches Chromium, drives the page sequence, and wraps everything in two independent retry layers:

- **CAPTCHA-level retries** (`CAPTCHA_RETRY_ATTEMPTS`): immediate re-attempts within `solveCaptcha()` before declaring failure
- **Process-level retries** (`PROCESS_RETRY_ATTEMPTS`, `PROCESS_RETRY_DELAY_MINUTES`): full end-to-end restart triggered only on `CaptchaFailedError`; all other errors fail immediately

On any error, `error_screenshot.png` and `error_dump.html` are saved to `output/` before re-throwing.

### Page Object Model (`src/pages/`)

Each RFB form step is its own module:
- `page1-consulta.js` — Category selection, PIS input, solve CAPTCHA, click "Consultar"
- `page2-confirmacao.js` — Wait for page transition, click "Confirmar"
- `page3-pagamento.js` — Fill payment date, select payment code 1473, fetch minimum wage, submit
- `page4-emissao.js` — Check "all" checkbox, solve second CAPTCHA, click "Emitir GPS", intercept PDF via CDP
- `page5-resumo.js` — Extract boleto summary (NIS, name, dates, total, barcode), save JSON

### CAPTCHA Solver (`src/captcha.js`)

3-tier waterfall — each tier only runs if the previous one fails:
1. **Stealth plugin** — puppeteer-extra stealth to bypass checkbox (~10% success)
2. **Audio transcription** — Wit.ai free API (`WIT_AI_TOKEN` required, skipped if absent)
3. **CapSolver API** — paid token injection via reCAPTCHA callback (`CAPSOLVER_API_KEY` required)

### Key Modules

| File | Role |
|------|------|
| `src/config.js` | Loads `.env`, validates required keys, exports typed config object |
| `src/helpers.js` | `delay()`, `clickBrButton()`, `focusInputByLabel()`, `extractSiteKey()`, `saveDebug()`, `cleanupDebugArtifacts()` |
| `src/business-days.js` | `isBusinessDay()` / `getNextBusinessDay()` using `date-holidays` (BR, SP) — used by index.js and page3 |
| `src/logger.js` | Winston logger; optional file output to `logs/gps.log` |
| `src/log-schedule.js` | Used by Docker scheduler to log next cron run at startup |
| `src/notifications/discord.js` | `sendDiscordNotification()` / `sendDiscordWarning()` / `sendDiscordStartup()` via webhook |

### Shadow DOM Handling

RFB uses custom web components (`br-button`, `br-input`, `br-select`). Use `page.evaluateHandle()` to pierce shadow roots and `contentFrame()` for reCAPTCHA iframes — see `src/helpers.js` for patterns.

### Output

- PDFs → `output/gps_emitted_intercept_<epoch-ms>.pdf`
- JSON summaries → `output/boleto_summary_<YYYY-MM-DD>.json`

### Docker Scheduling

`docker-compose.yml` runs two services: `gps-worker` (runs automation once) and `gps-scheduler` (Alpine cron that triggers `gps-worker` on `CRON_SCHEDULE`). The scheduler calls `log-schedule.js` on startup to validate the cron expression and log the next execution time.

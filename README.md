# GPS — Emissão Automatizada

Headless [Puppeteer](https://pptr.dev/) script that automates the issuance of a **Guia da Previdência Social (GPS)** on the [Receita Federal (RFB)](https://sal.rfb.gov.br) website. Runs locally with Node.js or inside a Docker container.

## How It Works

The script launches a headless Chromium browser, navigates the RFB multi-step form, fills in the contributor data, solves the reCAPTCHA challenge automatically, and downloads the resulting GPS boleto as a PDF. After a successful run it also extracts a JSON summary and (optionally) posts it to a Discord channel via webhook.

### CAPTCHA Bypass — 3-Tier Waterfall

| Tier | Strategy | Details |
|------|----------|---------|
| **1 — Stealth** | `puppeteer-extra-plugin-stealth` | Attempts a seamless checkbox bypass without triggering the challenge. |
| **2 — Audio** | Wit.ai Speech-to-Text (free) | Requests the audio challenge and transcribes it with the [Wit.ai](https://wit.ai/) API. |
| **3 — Token** | CapSolver API (paid) | Falls back to [CapSolver](https://capsolver.com/) for token-based solving with configurable retries. |

### Architecture

The codebase follows a **Page Object Model** pattern. Each step of the RFB form is encapsulated in its own module, and a central orchestrator (`src/index.js`) drives the flow:

```
src/
├── index.js                  # Orchestrator — launches the browser and runs all pages
├── config.js                 # Loads and validates environment variables
├── helpers.js                # Shared utilities (delay, click, focus, debug dumps)
├── captcha.js                # 3-tier waterfall CAPTCHA solver
├── notifications/
│   └── discord.js            # Discord webhook notification
└── pages/
    ├── page1-consulta.js     # Category selection, PIS input, CAPTCHA, submit
    ├── page2-confirmacao.js  # Confirmation screen
    ├── page3-pagamento.js    # Payment code & salary input
    ├── page4-emissao.js      # GPS emission & PDF download
    └── page5-resumo.js       # Summary extraction (JSON)
```

## Prerequisites

| Requirement | Version |
|-------------|---------|
| **Node.js** | 18 + |
| **npm** | 9 + (ships with Node 18) |
| **Docker** *(optional)* | 20 + |

## Setup

1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd gps
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create your `.env` file**
   ```bash
   cp .env.example .env
   ```

4. **Fill in the environment variables** (see the table below).

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PIS` | **Yes** | — | Your PIS/PASEP/NIT number (e.g. `000.00000.00-0`). |
| `CAPSOLVER_API_KEY` | **Yes** | — | Paid API key from [CapSolver](https://capsolver.com/) (Tier 3). |
| `WIT_AI_TOKEN` | No | — | Free Server Access Token from [Wit.ai](https://wit.ai/) (Tier 2). If omitted, audio CAPTCHA is skipped. |
| `DISCORD_WEBHOOK_URL` | No | — | Discord webhook URL to receive run notifications and warnings. |
| `CAPSOLVER_MAX_RETRIES` | No | `5` | Max retry attempts for the CapSolver API. |
| `DEBUG` | No | `false` | Set to `true` to save screenshots and HTML dumps during execution. |
| `CRON_SCHEDULE` | No | `0 8 16 * *` | Cron expression for the scheduler container (e.g. `0 8 16 * *` = 8:00 AM on the 16th monthly). |
| `CAPTCHA_RETRY_ATTEMPTS` | No | `2` | Immediate retries within CAPTCHA solving when a tier fails. |
| `PROCESS_RETRY_ATTEMPTS` | No | `2` | Full end-to-end process retries when CAPTCHA solving fails entirely. |
| `PROCESS_RETRY_DELAY_MINUTES` | No | `5` | Minutes to wait before retrying the whole process (0 = immediate). |

> [!IMPORTANT]
> `PIS` and `CAPSOLVER_API_KEY` are required — the script will exit immediately if either is missing.
> If `WIT_AI_TOKEN` is not set, the audio CAPTCHA tier (Tier 2) is skipped with a log warning.

## Usage

### Run locally

```bash
npm start
```

### Run with Docker Compose (scheduled)

```bash
docker compose up --build
```

This starts the **gps-scheduler** container, which uses the `CRON_SCHEDULE` from your `.env` to periodically run the worker. The `output/` directory is mounted so generated files are available on your host.

To run the worker once manually:

```bash
docker compose run --rm gps-worker
```

### Run with Docker directly

```bash
docker build -t gps-emulator .
docker run --rm --env-file .env -v "$(pwd)/output:/app/output" gps-emulator
```

## Testing

The project includes a unit-test suite powered by **[Jest](https://jestjs.io/)**. All tests are fully mocked — no real browser, network calls, or file I/O required.

```bash
npm test                # run all tests
npx jest --coverage     # run with coverage report
```

### Test coverage

| Module | Test file | What is covered |
|--------|-----------|-----------------|
| Helpers | `tests/helpers.test.js` | `delay`, `clickBrButton`, `focusInputByLabel`, `extractSiteKey`, `saveDebug` |
| Config | `tests/config.test.js` | Env parsing, defaults, validation, `process.exit` on missing `PIS`/`CAPSOLVER_API_KEY`, WIT optional |
| CAPTCHA | `tests/captcha.test.js` | 3-tier waterfall flow, `CaptchaFailedError`, CapSolver retry logic, token injection |
| Discord | `tests/discord.test.js` | Webhook embed formatting, `sendDiscordWarning`, null handling, error resilience |
| Retry | `tests/retry.test.js` | Process retry loop, Discord warning after exhaustion, immediate retry on delay=0 |
| Scheduler | `tests/scheduler.test.js` | Docker compose validation, cron expression format checks |
| Page 4 | `tests/pages/page4-emissao.test.js` | Date formatting for PDF filenames |
| Page 5 | `tests/pages/page5-resumo.test.js` | Date formatting, summary regex extraction |

## Output

After a successful run the `output/` directory will contain:

| File | Description |
|------|-------------|
| `gps_emitted_intercept_<timestamp>.pdf` | The GPS boleto PDF downloaded from the RFB website. The filename includes an epoch-millisecond timestamp (e.g. `gps_emitted_intercept_1709152800000.pdf`). |
| `boleto_summary_<YYYY-MM-DD>.json` | Extracted summary data — PIS, Nome, Data de Cálculo, Data de Vencimento, Total, and Barcode. The filename includes the current date (e.g. `boleto_summary_2025-02-28.json`). |

If `DISCORD_WEBHOOK_URL` is set, a rich embed with the summary data is also posted to the configured Discord channel.

## License

[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)

You are free to use, copy, modify, and distribute this software for **non-commercial purposes** only. See the [full license text](https://creativecommons.org/licenses/by-nc/4.0/legalcode) for details.

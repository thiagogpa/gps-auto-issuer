# GPS Emissão Automatizada

Headless Puppeteer script to automate the emission of a Guia da Previdência Social (GPS) on the Receita Federal website that runs in Docker.

Uses a 3-Tier Waterfall CAPTCHA bypass architecture:
1. **Tier 1 (Stealth):** `puppeteer-extra-plugin-stealth` for seamless checkbox bypass.
2. **Tier 2 (Free Audio):** Requests the audio challenge and uses the free **Wit.ai API** for transcription.
3. **Tier 3 (Paid Token):** Falls back to **CapSolver API** for token generation (with up to 3 retries on failure).

## Setup

1. Copy the environment variables template:
   ```bash
   cp .env.example .env
   ```
2. Open the `.env` file and fill in:
   - `PIS`: Your PIS/PASEP/NIT number (e.g. `000.00000.00-0`).
   - `WIT_AI_TOKEN`: Your free Server Access Token from [Wit.ai](https://wit.ai/).
   - `CAPSOLVER_API_KEY`: Your paid API key from [CapSolver](https://capsolver.com/).
   - `DEBUG` *(optional)*: Set to `true` to save debug screenshots and HTML dumps.

## Usage

### Local
```bash
npm start
```

### Docker Compose
```bash
docker-compose up --build
```

Docker Compose will automatically read the `.env` file and pass the variables to the container.

## Testing

The project includes a unit test suite using **Jest**. All tests use mocks — no real browser, API calls, or file I/O.

```bash
npm test              # run all tests
npx jest --coverage   # run with coverage report
```

**Test coverage:**

| Module | File | Tests |
|--------|------|-------|
| Helpers | `tests/helpers.test.js` | `delay`, `clickBrButton`, `focusInputByLabel`, `extractSiteKey`, `saveDebug` |
| Config | `tests/config.test.js` | Env parsing, defaults, validation, `process.exit` on missing PIS |
| CAPTCHA | `tests/captcha.test.js` | 3-tier waterfall flow, CapSolver retry logic, token injection |
| Discord | `tests/discord.test.js` | Webhook embed structure, null handling, error resilience |
| Page 4 | `tests/pages/page4-emissao.test.js` | Date formatting for PDF filenames |
| Page 5 | `tests/pages/page5-resumo.test.js` | Date formatting, summary regex extraction |

## Output

After a successful run, the `pdf/` directory will contain:
- **`gps_emitted.pdf`** — The actual GPS boleto PDF downloaded from the website.
- **`boleto_summary.json`** — Extracted summary data (PIS, Nome, Data de Cálculo, Data de Vencimento, Total, Barcode).

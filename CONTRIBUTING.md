# Contributing

## Environment Setup

1. Clone the repository and install dependencies:
   ```bash
   git clone <repo-url>
   cd gps
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in the required values (`PIS`, `CAPSOLVER_API_KEY`).
3. Run the automation locally: `npm start`
4. Run with debug artifacts and without submitting: `DRY_RUN=true npm run debug`

## Shadow DOM Patterns

The RFB portal uses custom web components (`br-button`, `br-input`, `br-select`) built with shadow DOM. Standard CSS selectors and Puppeteer clicks do not pierce shadow roots automatically.

**Piercing a shadow root:**
```js
const result = await page.evaluate(() => {
    const el = document.querySelector('br-button');
    return el.shadowRoot.querySelector('button').textContent;
});
```

**Handling reCAPTCHA iframes** — use `contentFrame()` to get the frame object from an element handle:
```js
const frameEl = await page.$('iframe[title="reCAPTCHA"]');
const frame = await frameEl.contentFrame();
await frame.click('.recaptcha-checkbox-border');
```

See `src/helpers.js` for the `clickBrButton()`, `focusInputByLabel()`, and `extractSiteKey()` helpers that encapsulate these patterns.

## Adding a New Page Module

Each RFB form step lives in `src/pages/pageN-<name>.js`. Follow this pattern:

```js
const logger = require('../logger');

/**
 * Page N: <brief description>
 * @param {import('puppeteer').Page} page
 * @param {object} config
 */
async function navigatePageN(page, config) {
    // ... page interactions ...
}

module.exports = navigatePageN;
```

- Export a single `async function navigatePageN(page, config)`.
- Use helpers from `src/helpers.js` (`delay`, `clickBrButton`, `saveDebug`, etc.).
- Call `saveDebug(page, 'pageN_dump.html', 'html', config.debug)` at the start for debugging.
- Wire the new page into `src/index.js` → `runAutomation()`.

## Testing Patterns

Tests live in `tests/` and use Jest. Puppeteer is never instantiated in tests — all browser interactions are mocked.

**Mocking a page:**
```js
const page = {
    evaluate: jest.fn().mockResolvedValue(undefined),
    screenshot: jest.fn().mockResolvedValue(undefined),
    $: jest.fn().mockResolvedValue(null),
};
```

**What belongs in unit tests:**
- Config parsing (env vars → config object)
- Pure helper functions (`delay`, `clickBrButton`, `cleanupDebugArtifacts`, etc.)
- Discord embed structure (mock `axios`)
- CAPTCHA error handling logic (mock `axios` + mock page)

**What does NOT belong in unit tests:**
- Real browser/Puppeteer execution
- Live HTTP calls to RFB or CapSolver APIs
- File I/O that touches the real filesystem (use `jest.spyOn(fs, ...)` instead)

Run all tests: `npm test`
Run a single file: `npx jest tests/captcha.test.js`
Run with coverage: `npx jest --coverage`

## CAPTCHA Waterfall

`src/captcha.js` implements a 3-tier waterfall in `solveCaptcha()`:

| Tier | Method | Requirement |
|------|--------|-------------|
| 1 | Stealth checkbox click | None (always attempted) |
| 2 | Audio transcription via Wit.ai | `WIT_AI_TOKEN` env var |
| 3 | Token injection via CapSolver | `CAPSOLVER_API_KEY` env var |

Each tier only runs if all previous tiers failed. If all tiers are exhausted, `CaptchaFailedError` is thrown — the process-level retry loop in `src/index.js` catches it and retries the full automation up to `PROCESS_RETRY_ATTEMPTS` times.

To add a new tier, insert it before the final `throw` in `solveCaptcha()` and add the corresponding env var to `src/config.js` and `.env.example`.

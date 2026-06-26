const fs = require('fs');
const path = require('path');
const { delay, extractSiteKey, saveDebug } = require('../helpers');
const { requestCapsolverToken, injectCaptchaToken } = require('../captcha');
const logger = require('../logger');

/**
 * Get today's date as YYYY-MM-DD string.
 */
function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Page 4: Select checkbox, solve Page 4 CAPTCHA, click "Emitir GPS",
 * and capture the boleto PDF.
 *
 * Capture strategy: Chromium's `Browser.setDownloadBehavior` (with
 * `eventsEnabled: true`) tells the browser to save downloads to `downloadPath`
 * AND emit `Browser.downloadWillBegin` / `Browser.downloadProgress` events
 * with the file's `guid`, `suggestedFilename`, and on-disk path once complete.
 * We listen for the first PDF download after the Emitir GPS click, rename it
 * to a deterministic path (`gps_<YYYY-MM-DD>.pdf`), and return that path.
 *
 * Why not capture the popup tab? RFB serves the boleto via a blob: URL in a
 * new tab — `targetcreated` fires, but the page closes itself before
 * Puppeteer's CDP session can fetch the bytes, so the 30s popup race
 * consistently times out. The download-behavior path works because Chromium
 * intercepts the blob save at a lower level.
 *
 * @returns {Promise<string|null>} Path to saved PDF, or null on failure
 */
async function navigatePage4(page, browser, config) {
    const start = Date.now();
    const downloadPath = path.join(process.cwd(), 'output');
    if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
        logger.debug(`Created output directory at: ${downloadPath}`);
    }

    // Configure browser-wide download behavior with CDP events enabled.
    // This applies to every target (including popups) created from this point on.
    const browserClient = await browser.target().createCDPSession();
    await browserClient.send('Browser.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: downloadPath,
        eventsEnabled: true
    });
    logger.debug('Configured browser-wide download behavior with CDP events.');

    logger.debug('Waiting for Page 4 components to fully load...');
    try {
        await page.waitForFunction(() => {
            const buttons = Array.from(document.querySelectorAll('br-button'));
            return buttons.some(b => b.textContent && b.textContent.toLowerCase().includes('emitir gps'));
        }, { timeout: 30000 });
        logger.debug('Page 4 "Emitir GPS" button detected.');
    } catch (e) {
        logger.warn('Timeout waiting for "Emitir GPS" button to appear on Page 4. Proceeding anyway...');
    }

    await saveDebug(page, 'page4_dump.html', 'html', config.debug);

    // Select "check all" checkbox
    logger.debug('Attempting to select the "check all" checkbox in the table header...');
    await page.evaluate(() => {
        const cbs = Array.from(document.querySelectorAll('br-checkbox'));
        for (const cb of cbs) {
            if (cb.getAttribute('checkgroup-child') === 'grupo-1' || cb.getAttribute('checkgroup-parent') === 'grupo-1') {
                const input = cb.shadowRoot ? cb.shadowRoot.querySelector('input') : cb.querySelector('input');
                if (input) {
                    if (!input.checked) {
                        input.click();
                        input.checked = true;
                        input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                    }
                } else {
                    cb.click();
                    if (typeof cb.checked !== 'undefined') cb.checked = true;
                    cb.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                }
            }
        }
    });
    logger.debug('Fired click and change events on br-checkbox components.');
    await delay(1000, 2000);

    // Find "Emitir GPS" button securely using a single evaluateHandle to avoid Angular detachments mid-loop
    logger.debug('Waiting for "Emitir GPS" button to be enabled...');
    const emitirBtn = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('br-button'));
        return buttons.find(b => b.textContent && b.textContent.toLowerCase().includes('emitir gps'));
    });

    const isMissingBtn = await page.evaluate(el => !el, emitirBtn);
    if (isMissingBtn) {
        logger.error('Could not find "Emitir GPS" button.');
        return null;
    }

    // Set up PDF download listener BEFORE the second Emitir GPS click.
    // Chromium emits Browser.downloadWillBegin as soon as it decides to save a
    // download, then Browser.downloadProgress with state='completed' once the
    // file is on disk. We race on downloadWillBegin (fast, reliable) and then
    // wait for the matching completion event before reading the file.
    logger.debug('Setting up CDP download listener for GPS boleto (before second click)...');
    const boletoDownloadPromise = new Promise((resolve, reject) => {
        const downloadGuidToSuggested = new Map();
        const timeoutHandle = setTimeout(
            () => reject(new Error('Timeout: no PDF download started within 60s')),
            60000
        );

        const onWillBegin = (event) => {
            const { guid, suggestedFilename } = event;
            downloadGuidToSuggested.set(guid, suggestedFilename);
            if (suggestedFilename && suggestedFilename.toLowerCase().endsWith('.pdf')) {
                logger.info(`Detected PDF download: ${suggestedFilename} (guid=${guid})`);
                clearTimeout(timeoutHandle);
                // Detach willBegin; keep progress listener to await completion
                browserClient.off('Browser.downloadWillBegin', onWillBegin);
                resolve({ guid, suggestedFilename });
            } else {
                logger.debug(`Ignoring non-PDF download: ${suggestedFilename} (guid=${guid})`);
            }
        };
        const onProgress = (event) => {
            if (event.state === 'completed') {
                // The file is on disk; caller will read/rename it
            } else if (event.state === 'canceled') {
                // Don't reject here — only the matched guid matters, and we
                // already filtered by .pdf extension in onWillBegin.
            }
        };

        browserClient.on('Browser.downloadWillBegin', onWillBegin);
        browserClient.on('Browser.downloadProgress', onProgress);
    });

    const isActuallyMissing = await page.evaluate(el => !el, emitirBtn);
    if (isActuallyMissing) {
        logger.error('Could not find "Emitir GPS" button.');
        return null;
    }

    // DRY_RUN: skip submission and PDF capture
    if (config.dryRun) {
        logger.info('DRY_RUN: skipping "Emitir GPS" click and PDF capture');
        return null;
    }

    // Solve Page 4 CAPTCHA
    if (config.capsolverKey) {
        logger.info('--- [PAGE 4 CAPTCHA] PAID TOKEN FALLBACK (CapSolver) ---');
        try {
            const currentUrl = await page.url();

            // Dynamically extract site key, fallback to hardcoded
            let siteKeyP4 = await extractSiteKey(page, 5000);
            if (!siteKeyP4) siteKeyP4 = '6Le7YegkAAAAAFNIhuu_eBRaDmxLY6Qf_A8BrtKX';
            logger.debug(`Using site key for Page 4: ${siteKeyP4}`);

            const capsolverToken = await requestCapsolverToken(config, siteKeyP4, currentUrl);
            logger.debug(`Token acquired. Length: ${capsolverToken.length}. Ready to inject.`);

            // First click to trigger Angular flow
            logger.debug('Clicking "Emitir GPS" button to trigger Angular flow and CAPTCHA challenge...');
            try {
                await page.waitForFunction(
                    el => !el.hasAttribute('disabled') && !el.disabled,
                    { timeout: 10000 },
                    emitirBtn
                );
            } catch {
                logger.warn('"Emitir GPS" button not enabled within timeout.');
            }
            await emitirBtn.click();
            logger.debug('Clicked "Emitir GPS" button natively.');

            logger.debug('Waiting for visual CAPTCHA iframe to initialize...');
            await delay(1500, 2500);

            // Inject token
            await page.evaluate((token) => {
                const textarea = document.getElementById("g-recaptcha-response");
                if (textarea) {
                    textarea.innerHTML = token;
                    textarea.value = token;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    textarea.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }, capsolverToken);

            logger.info('SUCCESS: Page 4 CAPTCHA token injected!');
            logger.debug('Giving Angular 2s to detect token before second click...');
            await delay(2000, 2500);

            // Second click to submit — reuse the already-captured handle
            logger.debug('Clicking "Emitir GPS" again to submit after token injection...');
            try {
                await emitirBtn.click();
                logger.debug('Clicked "Emitir GPS" button (second click via handle).');
            } catch (e) {
                // Handle may be stale if Angular re-rendered after token injection;
                // the form typically auto-submits on token detection so this is non-fatal.
                logger.debug(`Second click skipped (handle stale after token injection): ${e.message}`);
            }
        } catch (err) {
            logger.error(`FAIL: Page 4 CapSolver failed. Reason: ${err.message}`);
        }
    } else {
        logger.warn('No CapSolver key. Clicking "Emitir GPS" natively as fallback...');
        try {
            await page.waitForFunction(
                el => !el.hasAttribute('disabled') && !el.disabled,
                { timeout: 10000 },
                emitirBtn
            );
        } catch {
            logger.warn('"Emitir GPS" button not enabled within timeout.');
        }
        await emitirBtn.click();
        logger.debug('Clicked "Emitir GPS" button natively.');
    }

    // Wait for Chromium to start (and finish) writing the PDF to disk.
    logger.info('Waiting up to 60s for the GPS boleto PDF download...');
    let pdfPath = null;
    try {
        const { suggestedFilename } = await boletoDownloadPromise;

        // Wait for the matching Browser.downloadProgress {state: 'completed'}.
        // The file lands at <downloadPath>/<suggestedFilename> (or with a
        // numeric suffix if a duplicate already exists). We poll the directory
        // for any non-empty file matching the suggested name's prefix.
        const completedPath = await waitForDownloadedFile(
            downloadPath,
            suggestedFilename,
            45000
        );

        // Rename to a deterministic path so downstream (Discord attach) finds it.
        const finalPath = path.join(downloadPath, `gps_${todayStr()}.pdf`);
        fs.renameSync(completedPath, finalPath);
        pdfPath = finalPath;
        logger.info(`Saved GPS boleto PDF to ${pdfPath}`);
    } catch (e) {
        logger.warn(`Could not capture boleto PDF: ${e.message}`);
        await saveDebug(page, 'page4_no_download.png', 'screenshot', config.debug);
    } finally {
        // CDP session auto-cleans with browser; nothing to detach explicitly.
    }

    logger.info(`Page 4 complete in ${Date.now() - start}ms`);
    return pdfPath;
}

/**
 * Poll a directory for a file matching the suggested download name.
 * Chromium may append a numeric suffix (e.g. `boleto.pdf` → `boleto (1).pdf`)
 * if a previous run left a file with the same name.
 *
 * @param {string} dir
 * @param {string} suggestedFilename
 * @param {number} timeoutMs
 * @returns {Promise<string>} Absolute path of the downloaded file
 */
async function waitForDownloadedFile(dir, suggestedFilename, timeoutMs) {
    const baseName = path.parse(suggestedFilename).name.toLowerCase();
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const entries = fs.readdirSync(dir);
        // Match the exact suggested name, OR any `<name> (N).pdf` variant,
        // OR any other .pdf that's larger than 1KB (Chromium sometimes writes
        // a temp file first and only renames at the very end).
        const match = entries.find(name => {
            const lower = name.toLowerCase();
            if (!lower.endsWith('.pdf')) return false;
            if (lower === suggestedFilename.toLowerCase()) return true;
            if (lower.startsWith(baseName + ' (') && lower.endsWith('.pdf')) return true;
            return false;
        });
        if (match) {
            const fullPath = path.join(dir, match);
            const stat = fs.statSync(fullPath);
            // Skip .crdownload (in-progress) and zero-byte files
            if (!match.endsWith('.crdownload') && stat.size > 1024) {
                return fullPath;
            }
        }
        await new Promise(r => setTimeout(r, 500));
    }
    throw new Error(`Downloaded PDF "${suggestedFilename}" not found in ${dir} within ${timeoutMs}ms`);
}

module.exports = navigatePage4;

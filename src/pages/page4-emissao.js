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
 * and capture the boleto PDF from the popup window.
 *
 * @returns {Promise<string|null>} Path to saved PDF, or null on failure
 */
async function navigatePage4(page, browser, config) {
    const downloadPath = path.join(process.cwd(), 'output');
    if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
        logger.debug(`Created output directory at: ${downloadPath}`);
    }

    // Configure download behavior
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: downloadPath
    });

    browser.on('targetcreated', async target => {
        if (target.type() === 'page') {
            try {
                const newPage = await target.page();
                const newClient = await newPage.target().createCDPSession();
                await newClient.send('Page.setDownloadBehavior', {
                    behavior: 'allow',
                    downloadPath: downloadPath
                });
                logger.debug('Configured download behavior for new tab.');
            } catch (e) {
                logger.warn('Error configuring new tab CDP session: ' + e.message);
            }
        }
    });

    // Intercept PDF responses
    page.on('response', async (response) => {
        const contentType = response.headers()['content-type'] || '';
        const contentDisposition = response.headers()['content-disposition'] || '';
        if (contentType.includes('application/pdf') || (contentDisposition.includes('attachment') && contentDisposition.includes('.pdf'))) {
            logger.debug('Detected PDF download response: ' + response.url());
            try {
                const buffer = await response.buffer();
                const pdfOutPath = path.join(downloadPath, `gps_emitted_intercept_${Date.now()}.pdf`);
                fs.writeFileSync(pdfOutPath, buffer);
                logger.info('Saved intercepted PDF to ' + pdfOutPath);
            } catch (e) {
                logger.warn('Error saving intercepted PDF: ' + e.message);
            }
        }
    });

    logger.debug('Configured Puppeteer headless download settings.');

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

    // Set up popup listener BEFORE clicking
    logger.debug('Setting up popup listener for GPS boleto window (before clicking Emitir GPS)...');
    const boletoPdfPromise = new Promise(resolve => {
        browser.once('targetcreated', async target => {
            if (target.type() === 'page') {
                resolve(await target.page());
            }
        });
    });

    const isActuallyMissing = await page.evaluate(el => !el, emitirBtn);
    if (isActuallyMissing) {
        logger.error('Could not find "Emitir GPS" button.');
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
            for (let i = 0; i < 20; i++) {
                const isDisabled = await page.evaluate(el => el.hasAttribute('disabled') || el.disabled, emitirBtn);
                if (!isDisabled) {
                    await emitirBtn.click();
                    logger.debug('Clicked "Emitir GPS" button natively.');
                    break;
                }
                await delay(500, 500);
            }

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

            // Second click via coordinates
            logger.debug('Clicking "Emitir GPS" via coordinate-based mouse click...');
            const btnCoords = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('br-button'));
                const btn = buttons.find(b => b.textContent && b.textContent.includes('Emitir GPS'));
                if (btn) {
                    const rect = btn.getBoundingClientRect();
                    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, found: true };
                }
                return { found: false };
            });

            if (btnCoords && btnCoords.found) {
                await page.mouse.click(btnCoords.x, btnCoords.y);
                logger.debug(`Clicked "Emitir GPS" via mouse at (${btnCoords.x.toFixed(0)}, ${btnCoords.y.toFixed(0)})`);
            } else {
                logger.warn('Could not locate "Emitir GPS" button for coordinate click.');
            }
        } catch (err) {
            logger.error(`FAIL: Page 4 CapSolver failed. Reason: ${err.message}`);
        }
    } else {
        logger.warn('No CapSolver key. Clicking "Emitir GPS" natively as fallback...');
        for (let i = 0; i < 20; i++) {
            const isDisabled = await page.evaluate(el => el.hasAttribute('disabled') || el.disabled, emitirBtn);
            if (!isDisabled) {
                await emitirBtn.click();
                logger.debug('Clicked "Emitir GPS" button natively.');
                break;
            }
            await delay(500, 500);
        }
    }

    // Capture the boleto popup and download the PDF
    logger.info('Waiting up to 30s for the GPS boleto popup to open...');
    let pdfPath = null;
    try {
        const boletoPg = await Promise.race([
            boletoPdfPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout: GPS boleto popup did not open')), 30000))
        ]);

        logger.info('Boleto popup captured! URL: ' + boletoPg.url());
        await delay(3000, 5000);

        const blobUrl = boletoPg.url();
        pdfPath = path.join(downloadPath, `gps_${todayStr()}.pdf`);

        const pdfBase64 = await boletoPg.evaluate(async (url) => {
            const res = await fetch(url);
            const buf = await res.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
            return btoa(binary);
        }, blobUrl);

        fs.writeFileSync(pdfPath, Buffer.from(pdfBase64, 'base64'));
        logger.info(`Saved GPS boleto PDF to ${pdfPath} successfully!`);

        await saveDebug(boletoPg, 'page_boleto_popup.png', 'screenshot', config.debug);
        await boletoPg.close();
    } catch (e) {
        logger.warn(`Could not capture boleto popup: ${e.message}`);
        await saveDebug(page, 'page5_fallback.png', 'screenshot', config.debug);
    }

    return pdfPath;
}

module.exports = navigatePage4;

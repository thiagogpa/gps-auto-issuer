const { delay, extractSiteKey } = require('../helpers');
const { solveCaptcha } = require('../captcha');
const logger = require('../logger');

/**
 * Page 1: Category selection, PIS input, CAPTCHA, click Consultar.
 * After this, the page transitions to a confirmation modal or Page 2.
 */
async function navigatePage1(page, browser, config) {
    const start = Date.now();
    logger.debug('Page loaded. Simulating human delay before selecting category...');
    await page.waitForSelector(`label[for="${config.categoria}"]`);
    await page.click(`label[for="${config.categoria}"]`);

    logger.debug('Category selected. Delaying before filling PIS...');
    await delay(500, 1500);

    // Fill the PIS input (br-input with shadow DOM)
    await page.waitForSelector('br-input[formcontrolname="nit"]');
    const innerInput = await page.evaluateHandle(() => {
        const brInput = document.querySelector('br-input[formcontrolname="nit"]');
        if (brInput && brInput.shadowRoot) {
            return brInput.shadowRoot.querySelector('input');
        }
        return null;
    });

    const unmaskedPis = config.pis.replace(/\D/g, '');

    if (innerInput && innerInput.asElement()) {
        await innerInput.asElement().click();
        await delay(500, 1000);

        logger.debug('Typing PIS natively...');
        for (const char of unmaskedPis) {
            await page.keyboard.press(char, { delay: 10 + Math.random() * 50 });
            await delay(50, 150);
        }
        await page.keyboard.press('Tab');
        await delay(500, 1000);
    } else {
        logger.warn('Could not find inner input for PIS. Fallback to wrapper click.');
        const brInput = await page.$('br-input[formcontrolname="nit"]');
        await brInput.click();
        await delay(500, 1000);
        await page.keyboard.type(unmaskedPis, { delay: 150 });
    }

    logger.info('PIS filled. Delaying before CAPTCHA challenge...');
    await delay(1500, 3000);

    // Extract site key and solve CAPTCHA
    const siteKey = await extractSiteKey(page);
    if (siteKey) logger.debug(`Extracted SiteKey: ${siteKey}`);

    await solveCaptcha(page, config, siteKey, config.url);

    // Wait for Consultar button to become enabled (CAPTCHA must be registered by Angular)
    // br-button uses the HTML `disabled` attribute, not the .disabled property
    logger.debug('Waiting for Consultar button to become enabled...');
    try {
        await page.waitForFunction(() => {
            const buttons = Array.from(document.querySelectorAll('br-button[primary]'));
            const btn = buttons.find(b => b.textContent.trim() === 'Consultar');
            return btn && !btn.hasAttribute('disabled');
        }, { timeout: 8000 });
        logger.info('Consultar button is enabled. CAPTCHA accepted by form.');
    } catch {
        logger.warn('Consultar button did not become enabled after CAPTCHA solve — attempting click anyway.');
    }

    // Click Consultar
    logger.info('Proceeding to Page Navigation...');
    logger.debug('Waiting before clicking "Consultar"...');
    await delay(1000, 2500);

    const clickResult = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('br-button[primary]'));
        const consultarBtn = buttons.find(b => b.textContent.trim() === 'Consultar');
        if (!consultarBtn) return { found: false };
        const isDisabled = consultarBtn.hasAttribute('disabled');
        const innerBtn = consultarBtn.shadowRoot ? consultarBtn.shadowRoot.querySelector('button') : consultarBtn;
        const innerDisabled = innerBtn ? innerBtn.disabled : null;
        if (!isDisabled) {
            if (innerBtn) innerBtn.click();
            else consultarBtn.click();
            return { found: true, isDisabled, innerDisabled, action: 'clicked' };
        } else {
            const form = document.querySelector('form');
            if (form) form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
            return { found: true, isDisabled, innerDisabled, action: 'form-submit-fallback' };
        }
    });
    logger.debug(`Consultar click result: ${JSON.stringify(clickResult)}`);

    await delay(1000, 2000);

    // Handle "Atenção" confirmation modal if it appears
    logger.debug('Checking for Confirmation modal...');
    try {
        await page.waitForFunction(() => {
            const modals = Array.from(document.querySelectorAll('br-modal[title="Confirmação"]'));
            return modals.some(m => !m.hidden && m.style.display !== 'none');
        }, { timeout: 5000 });

        await page.evaluate(() => {
            const modals = Array.from(document.querySelectorAll('br-modal[title="Confirmação"]'));
            for (const modal of modals) {
                if (!modal.hidden) {
                    const buttons = Array.from(modal.querySelectorAll('br-button'));
                    for (const btn of buttons) {
                        if (btn.textContent.trim() === 'Sim') {
                            const inner = btn.shadowRoot ? btn.shadowRoot.querySelector('button') : btn;
                            if (inner) inner.click();
                        }
                    }
                }
            }
        });
        logger.debug('Clicked "Sim" on the confirmation modal.');

        await page.waitForFunction(() => {
            const modals = Array.from(document.querySelectorAll('br-modal[title="Confirmação"]'));
            return modals.every(m => m.hidden || m.style.display === 'none' || !document.body.contains(m));
        }, { timeout: 5000 });
        await delay(500, 1000);
    } catch {
        logger.debug('No confirmation modal detected or timed out waiting for it.');
    }

    logger.info(`Page 1 complete in ${Date.now() - start}ms. Waiting for the next phase...`);
}

module.exports = navigatePage1;

process.env.TZ = 'America/Sao_Paulo';

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const config = require('./config');
const logger = require('./logger');
const { CaptchaFailedError } = require('./captcha');

// Page modules
const navigatePage1 = require('./pages/page1-consulta');
const navigatePage2 = require('./pages/page2-confirmacao');
const navigatePage3 = require('./pages/page3-pagamento');
const navigatePage4 = require('./pages/page4-emissao');
const navigatePage5 = require('./pages/page5-resumo');
const { sendDiscordNotification, sendDiscordWarning } = require('./notifications/discord');

puppeteer.use(StealthPlugin());

/**
 * Run the full GPS automation flow once.
 * Extracted to allow retry logic to call it multiple times.
 */
async function runAutomation() {
    let browser;
    let page;

    try {
        logger.info('Starting GPS automation with 3-Tier Waterfall CAPTCHA bypass...');
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        });

        page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });

        logger.info(`Connecting to: ${config.url}`);
        await page.goto(config.url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Page 1: Category, PIS, CAPTCHA, Consultar
        await navigatePage1(page, browser, config);

        // Page 2: Confirmar
        await navigatePage2(page, config);

        // Page 3: Payment form
        await navigatePage3(page, config);

        // Page 4: Emitir GPS + PDF capture
        const pdfPath = await navigatePage4(page, browser, config);

        // Page 5: JSON summary extraction
        const summary = await navigatePage5(page, config);

        // Send Discord notification
        await sendDiscordNotification(config.discordWebhookUrl, summary, pdfPath);

        // Clean up temporary PDF if save option is disabled
        if (!config.savePdf && pdfPath && fs.existsSync(pdfPath)) {
            fs.unlinkSync(pdfPath);
            logger.info('Cleaned up temporary PDF file.');
        }

    } catch (err) {
        // Save error artifacts before re-throwing
        try {
            if (page) {
                await page.screenshot({ path: 'error_screenshot.png', fullPage: true });
                fs.writeFileSync('error_dump.html', await page.content());
                logger.info('Saved error_screenshot.png and error_dump.html');
            }
        } catch (e) {
            logger.warn('Could not save error artifacts: ' + e.message);
        }

        throw err; // Re-throw so the retry loop can handle it
    } finally {
        if (browser) await browser.close();
        logger.info('Browser closed. GPS emission automated run finished.');
    }
}

/**
 * Run the automation with process-level retry logic.
 * Retries when CaptchaFailedError is thrown.
 *
 * @param {number} maxAttempts - Maximum number of process retries
 * @param {number} delayMinutes - Minutes to wait between retries (0 = immediate)
 */
async function runWithRetry(maxAttempts, delayMinutes) {
    const totalAttempts = 1 + maxAttempts; // 1 initial + retries

    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
        try {
            logger.info(`Process attempt ${attempt}/${totalAttempts}...`);
            await runAutomation();
            return; // Success — exit the retry loop
        } catch (err) {
            if (err instanceof CaptchaFailedError) {
                logger.error(`Process attempt ${attempt}/${totalAttempts} failed: ${err.message}`);

                if (attempt < totalAttempts) {
                    if (delayMinutes > 0) {
                        logger.info(`Waiting ${delayMinutes} minute(s) before retrying the whole process...`);
                        await new Promise(resolve => setTimeout(resolve, delayMinutes * 60 * 1000));
                    } else {
                        logger.info('Retrying immediately...');
                    }
                } else {
                    // All retries exhausted
                    const message = `GPS automation failed after ${totalAttempts} attempt(s). All CAPTCHA bypass tiers were exhausted on every attempt.`;
                    logger.error(message);
                    await sendDiscordWarning(
                        config.discordWebhookUrl,
                        'GPS Automation Failed',
                        message
                    );
                }
            } else {
                // Non-CAPTCHA error — send warning and do not retry
                const message = `GPS automation failed with an unexpected error: ${err.message}`;
                logger.error(message);
                await sendDiscordWarning(
                    config.discordWebhookUrl,
                    'GPS Automation Error',
                    message
                );
                return; // Do not retry non-CAPTCHA errors
            }
        }
    }
}

// Main entry point
(async () => {
    await runWithRetry(config.processRetryAttempts, config.processRetryDelayMinutes);
})();

module.exports = { runAutomation, runWithRetry };

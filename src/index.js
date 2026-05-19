process.env.TZ = 'America/Sao_Paulo';

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');
const { CaptchaFailedError } = require('./captcha');
const { isBusinessDay, getNextBusinessDay } = require('./business-days');

// Page modules
const navigatePage1 = require('./pages/page1-consulta');
const navigatePage2 = require('./pages/page2-confirmacao');
const navigatePage3 = require('./pages/page3-pagamento');
const navigatePage4 = require('./pages/page4-emissao');
const navigatePage5 = require('./pages/page5-resumo');
const { sendDiscordNotification, sendDiscordWarning, sendDiscordStartup } = require('./notifications/discord');

puppeteer.use(StealthPlugin());

/**
 * Run the full GPS automation flow once.
 * Extracted to allow retry logic to call it multiple times.
 */
const outputDir = path.join(process.cwd(), 'output');

/**
 * Return a human-readable string for the next cron run, or null on error.
 * @param {string} cronSchedule
 * @returns {string|null}
 */
function getNextRunString(cronSchedule) {
    if (!cronSchedule) return null;
    try {
        const cronParser = require('cron-parser');
        const nextDate = cronParser.CronExpressionParser.parse(cronSchedule).next().toDate();
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).format(nextDate).replace(',', '');
    } catch {
        return null;
    }
}

/**
 * If the current date is not a business day in São Paulo, sleep until the
 * same HH:MM on the next business day, then return. This ensures the cron
 * job never emits a boleto dated on a weekend or holiday.
 */
async function waitUntilBusinessDay() {
    if (config.forceRun) return;
    const now = new Date();
    if (isBusinessDay(now)) return;

    const next = getNextBusinessDay(now);
    next.setHours(now.getHours(), now.getMinutes(), 0, 0);
    const waitMs = next.getTime() - now.getTime();

    const formatted = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    }).format(next).replace(',', '');

    logger.info(`Today is not a business day in São Paulo. Postponing execution to ${formatted}...`);
    await sendDiscordWarning(
        config.discordWebhookUrl,
        'GPS Automation Postponed',
        `Scheduled day is not a business day. Execution postponed to ${formatted}.`
    );
    await new Promise(resolve => setTimeout(resolve, waitMs));
    logger.info('Business day reached. Starting execution...');
}

async function runAutomation() {
    let browser;
    let page;

    // Ensure output directory exists when we will write files to it
    if (config.savePdf || config.saveJson || config.debug) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

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
                await page.screenshot({ path: path.join(outputDir, 'error_screenshot.png'), fullPage: true });
                fs.writeFileSync(path.join(outputDir, 'error_dump.html'), await page.content());
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
    logger.info('--- Starting GPS Automation Process ---');

    const nextRunStr = getNextRunString(config.cronSchedule);
    await sendDiscordStartup(config.discordWebhookUrl, nextRunStr);

    await waitUntilBusinessDay();

    await runWithRetry(config.processRetryAttempts, config.processRetryDelayMinutes);
    logger.info('--- GPS Automation Process Completed ---');

    if (nextRunStr) {
        logger.info(`Next execution scheduled for: ${nextRunStr}`);
    } else if (config.cronSchedule) {
        logger.error(`Invalid CRON_SCHEDULE string: ${config.cronSchedule}`);
    }
})();

module.exports = { runAutomation, runWithRetry, waitUntilBusinessDay };

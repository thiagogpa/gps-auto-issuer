const axios = require('axios');
const { delay } = require('./helpers');
const logger = require('./logger');

/**
 * Custom error thrown when all CAPTCHA bypass tiers are exhausted.
 */
class CaptchaFailedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CaptchaFailedError';
    }
}

/**
 * Custom error thrown when Google has flagged the IP and blocked CAPTCHA solving.
 */
class IpBlockedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'IpBlockedError';
    }
}

/**
 * 3-Tier Waterfall CAPTCHA Solver.
 * Tier 1: Stealth checkbox click
 * Tier 2: Audio challenge via Wit.ai
 * Tier 3: CapSolver API token injection
 *
 * @param {import('puppeteer').Page} page
 * @param {object} config
 * @param {string} siteKey
 * @param {string} pageUrl
 * @returns {Promise<boolean>} true if solved
 */
async function solveCaptcha(page, config, siteKey, pageUrl) {
    let solved = false;

    // ==========================================
    // TIER 1: STEALTH EVASION
    // ==========================================
    logger.info('--- [TIER 1] STEALTH EVASION ---');
    try {
        const primaryFrameEl = await page.$('iframe[title="reCAPTCHA"]');
        const primaryFrame = await primaryFrameEl.contentFrame();

        if (primaryFrame) {
            await primaryFrame.waitForSelector('.recaptcha-checkbox-border', { timeout: 10000 });
            logger.debug('Clicking the "I am not a robot" checkbox...');
            await delay(500, 1500);
            await primaryFrame.click('.recaptcha-checkbox-border');

            logger.debug('Waiting to see if reCAPTCHA auto-solves via Stealth...');
            try {
                await primaryFrame.waitForFunction(() => {
                    const cb = document.querySelector('.recaptcha-checkbox');
                    return cb && cb.getAttribute('aria-checked') === 'true';
                }, { timeout: 6000 });
                solved = true;
                logger.info('SUCCESS: Tier 1 (Stealth) bypassed the CAPTCHA automatically!');
            } catch {
                logger.info('FAIL: Tier 1 (Stealth) encountered a puzzle/challenge.');
            }
        }
    } catch (err) {
        logger.warn('Error during Tier 1: ' + err.message);
    }

    // ==========================================
    // TIER 2: FREE AUDIO FALLBACK (Wit.ai)
    // ==========================================
    if (!solved && config.witAiToken) {
        logger.info('--- [TIER 2] FREE AUDIO FALLBACK (Wit.ai) ---');
        try {
            const challengeFrameEl = await page.waitForSelector('iframe[src*="bframe"]', { timeout: 10000 }).catch(() => null);
            if (challengeFrameEl) {
                const challengeFrame = await challengeFrameEl.contentFrame();

                await delay(1000, 2000);
                logger.debug('Clicking the Audio Challenge button...');
                await challengeFrame.waitForSelector('#recaptcha-audio-button', { timeout: 10000 });
                await challengeFrame.click('#recaptcha-audio-button');

                await delay(1500, 3000);
                logger.debug('Waiting for audio challenge payload or IP Block text...');
                await challengeFrame.waitForFunction(() => {
                    const audio = document.querySelector('#audio-source');
                    const blockMsg = document.querySelector('.rc-doscaptcha-header-text');
                    return !!audio || !!blockMsg;
                }, { timeout: 15000 });

                const hasAudio = await challengeFrame.evaluate(() => !!document.querySelector('#audio-source'));
                if (!hasAudio) {
                    throw new Error('AUDIO_BLOCKED: IP flagged by Google (detected automated queries).');
                }

                const audioSrc = await challengeFrame.evaluate(() => document.querySelector('#audio-source').src);
                logger.debug('Audio URL verified. Downloading buffer...');

                const audioResponse = await axios.get(audioSrc, { responseType: 'arraybuffer' });
                const audioBuffer = Buffer.from(audioResponse.data, 'binary');

                logger.debug(`Submitting audio to Wit.ai (${audioBuffer.length} bytes)...`);
                const witResponse = await axios.post(
                    'https://api.wit.ai/dictation?v=20230225',
                    audioBuffer,
                    {
                        headers: {
                            'Authorization': `Bearer ${config.witAiToken}`,
                            'Content-Type': 'audio/mpeg3',
                            'Accept': 'application/json'
                        }
                    }
                );

                let transcribedText = '';
                const parts = witResponse.data.split('\\n');
                for (const part of parts) {
                    if (part.trim() === '') continue;
                    try {
                        const parsed = JSON.parse(part);
                        if (parsed.text) transcribedText = parsed.text.trim();
                    } catch { }
                }
                if (!transcribedText && witResponse.data.text) transcribedText = witResponse.data.text.trim();

                logger.debug(`Transcription received: "${transcribedText}"`);
                if (!transcribedText) throw new Error('Transcription was empty.');

                logger.debug('Typing transcription and verifying...');
                await delay(500, 1500);
                await challengeFrame.type('#audio-response', transcribedText, { delay: 100 });
                await delay(500, 1000);
                await challengeFrame.click('#recaptcha-verify-button');

                const primaryFrameEl2 = await page.$('iframe[title="reCAPTCHA"]');
                const primaryFrame2 = await primaryFrameEl2.contentFrame();
                await primaryFrame2.waitForFunction(() => {
                    const cb = document.querySelector('.recaptcha-checkbox');
                    return cb && cb.getAttribute('aria-checked') === 'true';
                }, { timeout: 10000 });

                solved = true;
                logger.info('SUCCESS: Tier 2 (Audio) bypassed the CAPTCHA!');
            } else {
                logger.warn('Secondary challenge iframe not found. Skipping Tier 2.');
            }
        } catch (err) {
            if (err.message.startsWith('AUDIO_BLOCKED')) {
                throw new IpBlockedError('IP flagged by Google reCAPTCHA — CAPTCHA challenges are blocked for this IP. Manual intervention required.');
            }
            logger.info(`FAIL: Tier 2 (Audio) failed. Reason: ${err.message}`);
        }
    } else if (!solved && !config.witAiToken) {
        logger.info('--- [TIER 2] SKIPPED: WIT_AI_TOKEN not provided. ---');
    }

    // ==========================================
    // TIER 3: PAID TOKEN FALLBACK (CapSolver)
    // ==========================================
    if (!solved && config.capsolverKey) {
        logger.info('--- [TIER 3] PAID TOKEN FALLBACK (CapSolver) ---');
        try {
            if (!siteKey) throw new Error('Cannot proceed: SiteKey was not extracted.');

            const token = await requestCapsolverToken(config, siteKey, pageUrl);
            logger.debug(`Token acquired (${token.substring(0, 8)}...). Injecting into DOM...`);

            await injectCaptchaToken(page, token);

            solved = true;
            logger.info('SUCCESS: Tier 3 (CapSolver) injected the bypass token!');
            await delay(3000, 4000);

            // Remove any leftover reCAPTCHA overlay containers
            await page.evaluate(() => {
                document.querySelectorAll('div[style*="z-index: 2000000000"]').forEach(el => el.remove());
            });

        } catch (err) {
            logger.info(`FAIL: Tier 3 (CapSolver) failed. Reason: ${err.message}`);
            throw new CaptchaFailedError('All CAPTCHA bypass tiers exhausted. Automation cannot proceed.');
        }
    } else if (!solved) {
        throw new CaptchaFailedError('All CAPTCHA bypass tiers exhausted. Automation cannot proceed.');
    }

    return solved;
}

/**
 * Request a reCAPTCHA token from CapSolver with retries.
 * @param {object} config
 * @param {string} siteKey
 * @param {string} pageUrl
 * @returns {Promise<string>} The reCAPTCHA token
 */
async function requestCapsolverToken(config, siteKey, pageUrl) {
    const maxRetries = config.capsolverMaxRetries || 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            logger.debug(`Requesting reCAPTCHA v2 token from CapSolver (attempt ${attempt}/${maxRetries})...`);
            const createTaskRes = await axios.post('https://api.capsolver.com/createTask', {
                clientKey: config.capsolverKey,
                task: {
                    type: "ReCaptchaV2TaskProxyless",
                    websiteURL: pageUrl,
                    websiteKey: siteKey
                }
            });

            if (createTaskRes.data.errorId !== 0) {
                throw new Error(`Task Creation Failed: ${createTaskRes.data.errorDescription}`);
            }

            const taskId = createTaskRes.data.taskId;
            logger.debug(`Task created. ID: ${taskId}. Polling for solution...`);

            const pollLimit = config.capsolverPollLimit || 40;
            let pollDelay = 2000;
            const MAX_POLL_DELAY = 10000;
            for (let i = 0; i < pollLimit; i++) {
                await delay(pollDelay, pollDelay);
                pollDelay = Math.min(Math.floor(pollDelay * 1.5), MAX_POLL_DELAY);
                const resultRes = await axios.post('https://api.capsolver.com/getTaskResult', {
                    clientKey: config.capsolverKey,
                    taskId: taskId
                });

                if (resultRes.data.status === 'ready') {
                    return resultRes.data.solution.gRecaptchaResponse;
                } else if (resultRes.data.status === 'failed') {
                    throw new Error(`Task Failed: ${resultRes.data.errorDescription}`);
                }
            }

            throw new Error('Polling timed out.');
        } catch (retryErr) {
            logger.warn(`CapSolver attempt ${attempt} failed: ${retryErr.message}`);
            if (attempt === maxRetries) {
                throw new Error(`All ${maxRetries} CapSolver attempts failed.`);
            }
            logger.debug('Retrying CapSolver...');
            await delay(2000, 3000);
        }
    }
}

/**
 * Inject a reCAPTCHA token into the page's DOM and trigger callbacks.
 * @param {import('puppeteer').Page} page
 * @param {string} token
 */
async function injectCaptchaToken(page, token) {
    await page.evaluate((recaptchaToken) => {
        const textarea = document.getElementById("g-recaptcha-response");
        if (textarea) {
            // Use the native setter so Angular/React change detection picks it up
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
            if (nativeSetter && nativeSetter.set) {
                nativeSetter.set.call(textarea, recaptchaToken);
            } else {
                textarea.innerHTML = recaptchaToken;
                textarea.value = recaptchaToken;
            }
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
        }

        try {
            // Search for and call all reCAPTCHA callbacks up to 4 levels deep
            const tryCallCallbacks = (obj, depth) => {
                if (depth > 4 || !obj || typeof obj !== 'object') return;
                if (typeof obj.callback === 'function') {
                    try { obj.callback(recaptchaToken); } catch { }
                }
                for (const key of Object.keys(obj)) {
                    if (typeof obj[key] === 'function' && key.toLowerCase().includes('callback')) {
                        try { obj[key](recaptchaToken); } catch { }
                    } else if (obj[key] && typeof obj[key] === 'object') {
                        tryCallCallbacks(obj[key], depth + 1);
                    }
                }
            };
            if (typeof ___grecaptcha_cfg !== 'undefined' && ___grecaptcha_cfg.clients) {
                for (const clientId of Object.keys(___grecaptcha_cfg.clients)) {
                    tryCallCallbacks(___grecaptcha_cfg.clients[clientId], 0);
                }
            }
        } catch (e) {
            // Callback search is best-effort; token is already set in textarea
        }
    }, token);
}

module.exports = { solveCaptcha, requestCapsolverToken, injectCaptchaToken, CaptchaFailedError, IpBlockedError };

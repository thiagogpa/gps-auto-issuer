const axios = require('axios');
const { delay } = require('./helpers');

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
    console.log('\n--- [TIER 1] STEALTH EVASION ---');
    try {
        const primaryFrameEl = await page.$('iframe[title="reCAPTCHA"]');
        const primaryFrame = await primaryFrameEl.contentFrame();

        if (primaryFrame) {
            await primaryFrame.waitForSelector('.recaptcha-checkbox-border', { timeout: 10000 });
            console.log('Clicking the "I am not a robot" checkbox...');
            await delay(500, 1500);
            await primaryFrame.click('.recaptcha-checkbox-border');

            console.log('Waiting to see if reCAPTCHA auto-solves via Stealth...');
            try {
                await primaryFrame.waitForFunction(() => {
                    const cb = document.querySelector('.recaptcha-checkbox');
                    return cb && cb.getAttribute('aria-checked') === 'true';
                }, { timeout: 6000 });
                solved = true;
                console.log('SUCCESS: Tier 1 (Stealth) bypassed the CAPTCHA automatically!');
            } catch {
                console.log('FAIL: Tier 1 (Stealth) encountered a puzzle/challenge.');
            }
        }
    } catch (err) {
        console.log('Error during Tier 1:', err.message);
    }

    // ==========================================
    // TIER 2: FREE AUDIO FALLBACK (Wit.ai)
    // ==========================================
    if (!solved && config.witAiToken) {
        console.log('\n--- [TIER 2] FREE AUDIO FALLBACK (Wit.ai) ---');
        try {
            const challengeFrameEl = await page.waitForSelector('iframe[src*="bframe"]', { timeout: 10000 }).catch(() => null);
            if (challengeFrameEl) {
                const challengeFrame = await challengeFrameEl.contentFrame();

                await delay(1000, 2000);
                console.log('Clicking the Audio Challenge button...');
                await challengeFrame.waitForSelector('#recaptcha-audio-button', { timeout: 10000 });
                await challengeFrame.click('#recaptcha-audio-button');

                await delay(1500, 3000);
                console.log('Waiting for audio challenge payload or IP Block text...');
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
                console.log('Audio URL verified. Downloading buffer...');

                const audioResponse = await axios.get(audioSrc, { responseType: 'arraybuffer' });
                const audioBuffer = Buffer.from(audioResponse.data, 'binary');

                console.log(`Submitting audio to Wit.ai (${audioBuffer.length} bytes)...`);
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

                console.log(`Transcription received: "${transcribedText}"`);
                if (!transcribedText) throw new Error('Transcription was empty.');

                console.log('Typing transcription and verifying...');
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
                console.log('SUCCESS: Tier 2 (Audio) bypassed the CAPTCHA!');
            } else {
                console.log('Secondary challenge iframe not found. Skipping Tier 2.');
            }
        } catch (err) {
            console.log(`FAIL: Tier 2 (Audio) failed. Reason: ${err.message}`);
        }
    } else if (!solved && !config.witAiToken) {
        console.log('\n--- [TIER 2] SKIPPED: WIT_AI_TOKEN not provided. ---');
    }

    // ==========================================
    // TIER 3: PAID TOKEN FALLBACK (CapSolver)
    // ==========================================
    if (!solved && config.capsolverKey) {
        console.log('\n--- [TIER 3] PAID TOKEN FALLBACK (CapSolver) ---');
        try {
            if (!siteKey) throw new Error('Cannot proceed: SiteKey was not extracted.');

            const token = await requestCapsolverToken(config, siteKey, pageUrl);
            console.log(`Token acquired (${token.substring(0, 30)}...). Injecting into DOM...`);

            await injectCaptchaToken(page, token);

            solved = true;
            console.log('SUCCESS: Tier 3 (CapSolver) injected the bypass token!');
            await delay(3000, 4000);

            // Remove any leftover reCAPTCHA overlay containers
            await page.evaluate(() => {
                document.querySelectorAll('div[style*="z-index: 2000000000"]').forEach(el => el.remove());
            });

        } catch (err) {
            console.log(`FAIL: Tier 3 (CapSolver) failed. Reason: ${err.message}`);
            console.error('CRITICAL: All CAPTCHA bypass tiers exhausted. Automation cannot proceed.');
            process.exit(1);
        }
    } else if (!solved) {
        console.log('\n--- [MANUAL FALLBACK] ---');
        console.log('CAPTCHA was not bypassed automatically.');
        console.log('Waiting 90 seconds for manual solve...');
        await delay(90000, 90000);
        solved = true;
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
            console.log(`Requesting reCAPTCHA v2 token from CapSolver (attempt ${attempt}/${maxRetries})...`);
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
            console.log(`Task created. ID: ${taskId}. Polling for solution...`);

            const pollLimit = config.capsolverPollLimit || 40;
            for (let i = 0; i < pollLimit; i++) {
                await delay(2000, 2000);
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
            console.log(`CapSolver attempt ${attempt} failed: ${retryErr.message}`);
            if (attempt === maxRetries) {
                throw new Error(`All ${maxRetries} CapSolver attempts failed.`);
            }
            console.log('Retrying CapSolver...');
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
            textarea.innerHTML = recaptchaToken;
            textarea.value = recaptchaToken;
        }

        try {
            const findRecaptchaClient = () => {
                if (typeof (___grecaptcha_cfg) !== 'undefined') {
                    return Object.entries(___grecaptcha_cfg.clients).map(([cid, client]) => {
                        const data = { id: cid };
                        const objects = Object.entries(client).filter(([_, value]) => value && typeof value === 'object');
                        objects.forEach(([toplevelKey, toplevel]) => {
                            const found = Object.entries(toplevel).find(([_, value]) => (
                                value && typeof value === 'object' && 'sitekey' in value && 'size' in value
                            ));
                            if (found) {
                                const callback = found[1]['callback'];
                                if (callback) data.function = callback;
                            }
                        });
                        return data;
                    });
                }
                return [];
            };

            const clientsInfo = findRecaptchaClient();
            if (clientsInfo.length > 0 && clientsInfo[0].function) {
                clientsInfo[0].function(recaptchaToken);
            } else {
                const searchObjForCallback = (obj, depth) => {
                    if (depth > 6 || !obj) return false;
                    for (let key in obj) {
                        if (typeof obj[key] === 'function' && key.toLowerCase().includes('callback')) {
                            try { obj[key](recaptchaToken); return true; } catch { }
                        }
                        if (typeof obj[key] === 'object' && obj[key] !== null) {
                            if (searchObjForCallback(obj[key], depth + 1)) return true;
                        }
                    }
                    return false;
                };
                if (window.___grecaptcha_cfg && window.___grecaptcha_cfg.clients) {
                    searchObjForCallback(window.___grecaptcha_cfg.clients, 0);
                }
            }
        } catch { }
    }, token);
}

module.exports = { solveCaptcha, requestCapsolverToken, injectCaptchaToken };

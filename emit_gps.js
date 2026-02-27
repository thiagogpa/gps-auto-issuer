require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
puppeteer.use(StealthPlugin());

const url = 'https://sal.rfb.gov.br/calculo-contribuicao/contribuintes-2';
const targetCategoria = 'categoria_op_FACULTATIVO';
const targetPis = process.env.PIS;
const DEBUG = process.env.DEBUG === 'true';

// Helper function for randomized delays to mimic human behavior
const delay = (min, max) => new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1) + min)));

(async () => {
    const witAiToken = process.env.WIT_AI_TOKEN;
    const capsolverKey = process.env.CAPSOLVER_API_KEY;

    if (!targetPis) {
        console.error('ERROR: PIS is required. Set it in the .env file.');
        process.exit(1);
    }
    if (!witAiToken || !capsolverKey) {
        console.warn('WARNING: WIT_AI_TOKEN or CAPSOLVER_API_KEY is missing. Waterfall might fail at later tiers.');
    }

    console.log('Starting GPS automation with 3-Tier Waterfall CAPTCHA bypass...');
    console.log(`Connecting to: ${url}`);

    // Launch headless browser optimized for Docker
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
            '--window-size=1920,1080',
            '--disable-popup-blocking'
        ],
        defaultViewport: { width: 1920, height: 1080 }
    });

    let page;
    try {
        page = (await browser.pages())[0];
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        console.log('Page loaded. Simulating human delay before selecting category...');
        await delay(1000, 2500);

        // Select the category radio button
        await page.waitForSelector(`label[for="${targetCategoria}"]`);
        await page.click(`label[for="${targetCategoria}"]`);

        console.log('Category selected. Delaying before filling PIS...');
        await delay(500, 1500);

        // Fill the PIS input
        await page.waitForSelector('br-input[formcontrolname="nit"]');

        // Target the inner input within the shadow DOM of br-input
        const innerInputHandle = await page.evaluateHandle(() => {
            const brInput = document.querySelector('br-input[formcontrolname="nit"]');
            if (brInput && brInput.shadowRoot) {
                return brInput.shadowRoot.querySelector('input');
            }
            return brInput ? brInput.querySelector('input') : null;
        });

        if (innerInputHandle) {
            // Click the center of the element to move the real browser focus there
            await innerInputHandle.click();
            await delay(500, 1000);

            // Type the unmasked numbers using the global keyboard to simulate real native OS events
            const unmaskedPis = targetPis.replace(/\D/g, '');
            console.log('Typing PIS natively...');
            for (const char of unmaskedPis) {
                await page.keyboard.press(char, { delay: 10 + Math.random() * 50 });
                await delay(50, 150);
            }

            // Press Tab to naturally trigger a blur and validate the field
            await page.keyboard.press('Tab');
            await delay(500, 1000);

        } else {
            console.log('WARNING: Could not find inner input for PIS. Fallback to wrapper click.');
            const brInput = await page.$('br-input[formcontrolname="nit"]');
            await brInput.click();
            await delay(500, 1000);
            await page.keyboard.type(targetPis.replace(/\D/g, ''), { delay: 150 });
        }

        console.log('PIS filled. Delaying before tier 1 CAPTCHA challenge...');
        await delay(1500, 3000);

        let captchaSolved = false;

        // Extract SiteKey early for potential Tier 3 use
        let siteKey = null;
        try {
            await page.waitForSelector('iframe[title="reCAPTCHA"]', { timeout: 10000 });
            const primaryFrameEl = await page.$('iframe[title="reCAPTCHA"]');
            const iframeSrc = await page.evaluate(el => el.src, primaryFrameEl);
            const siteKeyMatch = iframeSrc.match(/k=([^&]+)/);
            if (siteKeyMatch) {
                siteKey = siteKeyMatch[1];
                console.log(`Extracted SiteKey: ${siteKey}`);
            }
        } catch (e) {
            console.log('Could not extract SiteKey early.');
        }

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
                    captchaSolved = true;
                    console.log('SUCCESS: Tier 1 (Stealth) bypassed the CAPTCHA automatically!');
                } catch (e) {
                    console.log('FAIL: Tier 1 (Stealth) encountered a puzzle/challenge.');
                }
            }
        } catch (err) {
            console.log('Error during Tier 1 executing:', err.message);
        }

        // ==========================================
        // TIER 2: FREE AUDIO FALLBACK
        // ==========================================
        if (!captchaSolved && witAiToken) {
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

                    // Wait for audio source or IP block
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
                    console.log(`Audio URL verified. Downloading buffer...`);

                    const audioResponse = await axios.get(audioSrc, { responseType: 'arraybuffer' });
                    const audioBuffer = Buffer.from(audioResponse.data, 'binary');

                    console.log(`Submitting audio to Wit.ai (${audioBuffer.length} bytes)...`);
                    const witResponse = await axios.post(
                        'https://api.wit.ai/dictation?v=20230225',
                        audioBuffer,
                        {
                            headers: {
                                'Authorization': `Bearer ${witAiToken}`,
                                'Content-Type': 'audio/mpeg3',
                                'Accept': 'application/json'
                            }
                        }
                    );

                    // Parse chunked Wit.ai response
                    let transcribedText = '';
                    const parts = witResponse.data.split('\\n');
                    for (const part of parts) {
                        if (part.trim() === '') continue;
                        try {
                            const parsed = JSON.parse(part);
                            if (parsed.text) transcribedText = parsed.text.trim();
                        } catch (err) { }
                    }
                    if (!transcribedText && witResponse.data.text) transcribedText = witResponse.data.text.trim();

                    console.log(`Transcription received: "${transcribedText}"`);
                    if (!transcribedText) throw new Error('Transcription was empty.');

                    console.log('Typing transcription and verifying...');
                    await delay(500, 1500);
                    await challengeFrame.type('#audio-response', transcribedText, { delay: 100 });
                    await delay(500, 1000);
                    await challengeFrame.click('#recaptcha-verify-button');

                    // Check success on primary frame
                    const primaryFrameEl = await page.$('iframe[title="reCAPTCHA"]');
                    const primaryFrame = await primaryFrameEl.contentFrame();
                    await primaryFrame.waitForFunction(() => {
                        const cb = document.querySelector('.recaptcha-checkbox');
                        return cb && cb.getAttribute('aria-checked') === 'true';
                    }, { timeout: 10000 });

                    captchaSolved = true;
                    console.log('SUCCESS: Tier 2 (Audio) bypassed the CAPTCHA!');
                } else {
                    console.log('Secondary challenge iframe not found. Skipping Tier 2.');
                }
            } catch (err) {
                console.log(`FAIL: Tier 2 (Audio) failed. Reason: ${err.message}`);
            }
        } else if (!captchaSolved && !witAiToken) {
            console.log('\n--- [TIER 2] FREE AUDIO FALLBACK (Wit.ai) ---');
            console.log('SKIPPED: WIT_AI_TOKEN not provided.');
        }

        // ==========================================
        // TIER 3: PAID TOKEN FALLBACK (CapSolver)
        // ==========================================
        if (!captchaSolved && capsolverKey) {
            console.log('\n--- [TIER 3] PAID TOKEN FALLBACK (CapSolver) ---');
            try {
                if (!siteKey) throw new Error('Cannot proceed: SiteKey was not extracted earlier.');

                console.log('Requesting reCAPTCHA v2 token from CapSolver API...');
                const createTaskRes = await axios.post('https://api.capsolver.com/createTask', {
                    clientKey: capsolverKey,
                    task: {
                        type: "ReCaptchaV2TaskProxyless",
                        websiteURL: url,
                        websiteKey: siteKey
                    }
                });

                if (createTaskRes.data.errorId !== 0) {
                    throw new Error(`CapSolver API Error: ${createTaskRes.data.errorDescription}`);
                }

                const taskId = createTaskRes.data.taskId;
                console.log(`Task created successfully. Task ID: ${taskId}. Polling for solution...`);

                let token = null;
                for (let i = 0; i < 30; i++) { // Poll for up to 60 seconds
                    await delay(2000, 2000);
                    const resultRes = await axios.post('https://api.capsolver.com/getTaskResult', {
                        clientKey: capsolverKey,
                        taskId: taskId
                    });

                    if (resultRes.data.status === 'ready') {
                        token = resultRes.data.solution.gRecaptchaResponse;
                        break;
                    } else if (resultRes.data.status === 'failed') {
                        throw new Error(`CapSolver Task Failed: ${resultRes.data.errorDescription}`);
                    }
                }

                if (!token) throw new Error('CapSolver timed out waiting for token.');

                console.log(`Token acquired (${token.substring(0, 30)}...). Injecting into DOM...`);

                // Inject token into the hidden textarea
                await page.evaluate((recaptchaToken) => {
                    // Inject into standard google textarea
                    const textarea = document.getElementById("g-recaptcha-response");
                    if (textarea) {
                        textarea.innerHTML = recaptchaToken;
                        textarea.value = recaptchaToken;
                    }

                    // Attempt to locate and call the reCAPTCHA callback dynamically
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
                                            const callbackKey = 'callback';
                                            const callback = found[1][callbackKey];
                                            if (callback) {
                                                data.function = callback;
                                            }
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
                            console.log('Successfully called the internal ReCaptcha callback function!');
                        } else {
                            // Deep recursive fallback
                            const searchObjForCallback = (obj, depth) => {
                                if (depth > 6 || !obj) return false;
                                for (let key in obj) {
                                    if (typeof obj[key] === 'function' && key.toLowerCase().includes('callback')) {
                                        try { obj[key](recaptchaToken); return true; } catch (e) { }
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
                    } catch (e) {
                        console.log('Error executing recaptcha callback:', e.message);
                    }
                }, token);

                captchaSolved = true;
                console.log('SUCCESS: Tier 3 (CapSolver) injected the bypass token!');
                // Crucial delay to allow Angular's model and the CAPTCHA callback to register the token before clicking Consultar
                await delay(3000, 4000);

                // Aggressively remove any leftover reCAPTCHA overlay containers that block clicks
                await page.evaluate(() => {
                    document.querySelectorAll('div[style*="z-index: 2000000000"]').forEach(el => el.remove());
                });

            } catch (err) {
                console.log(`FAIL: Tier 3 (CapSolver) failed. Reason: ${err.message}`);
                console.error('CRITICAL: All CAPTCHA bypass tiers exhausted. Automation cannot proceed.');
                process.exit(1);
            }
        } else if (!captchaSolved) {
            console.log('\n--- [MANUAL FALLBACK] ---');
            console.log('CAPTCHA was not bypassed automatically.');
            console.log('Waiting 90 seconds for you to manually solve the visual CAPTCHA and click "Consultar"...');
            await delay(90000, 90000);
            captchaSolved = true;
        }

        console.log('\nProceeding to Page Navigation...');
        console.log('Waiting before clicking "Consultar"...');
        await delay(1000, 2500);

        // Click Consultar using evaluate or dispatch form submit to bypass shadow DOM issues and overlays
        await page.evaluate(() => {
            // Priority 1: Find the button and click it programmatically (bypasses overlays)
            const buttons = Array.from(document.querySelectorAll('br-button[primary]'));
            const consultarBtn = buttons.find(b => b.textContent.trim() === 'Consultar');

            if (consultarBtn && !consultarBtn.disabled) {
                // Try clicking the internal button if shadow dom
                const innerBtn = consultarBtn.shadowRoot ? consultarBtn.shadowRoot.querySelector('button') : consultarBtn;
                if (innerBtn) {
                    innerBtn.click();
                } else {
                    consultarBtn.click();
                }
            } else {
                // Priority 2: Try to find a form and dispatch submit
                const form = document.querySelector('form');
                if (form) {
                    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                }
            }
        });

        // Wait a moment for any confirmation modal or immediate navigation
        await delay(1000, 2000);

        // Check if the "Atenção - Não será emitida GPS sem..." modal appeared, and click "Sim"
        console.log('Checking for Confirmation modal...');
        try {
            await page.waitForFunction(() => {
                const modals = Array.from(document.querySelectorAll('br-modal[title="Confirmação"]'));
                return modals.some(m => !m.hidden && m.style.display !== 'none');
            }, { timeout: 3000 });

            console.log('Confirmation modal appeared. Attempting to click "Sim"...');
            await page.evaluate(() => {
                const modals = Array.from(document.querySelectorAll('br-modal[title="Confirmação"]'));
                for (const modal of modals) {
                    const buttons = Array.from(modal.querySelectorAll('br-button'));
                    const simBtn = buttons.find(b => b.textContent.trim() === 'Sim' || (b.hasAttribute('primary') && !b.hasAttribute('secondary')));

                    if (simBtn) {
                        simBtn.click();
                        if (simBtn.shadowRoot) {
                            const inner = simBtn.shadowRoot.querySelector('button');
                            if (inner) inner.click();
                        }
                    }
                }
            });

            console.log('Clicked "Sim" on the confirmation modal.');
            // Wait for modal to disappear
            await page.waitForFunction(() => {
                const modals = Array.from(document.querySelectorAll('br-modal[title="Confirmação"]'));
                return modals.every(m => m.hidden || m.style.display === 'none' || !document.body.contains(m));
            }, { timeout: 5000 });

            await delay(500, 1000);

        } catch (e) {
            console.log('No confirmation modal detected or timed out waiting for it.');
        }

        console.log('Clicked "Consultar". Waiting for the Confirmation page or error feedback...');

        // Wait for EITHER navigation, or a loading scrim to disappear, or the Confirmar button to appear
        try {
            await Promise.race([
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }),
                page.waitForFunction(() => {
                    const buttons = Array.from(document.querySelectorAll('br-button[primary]'));
                    return buttons.some(b => b.textContent.trim() === 'Confirmar' && !b.disabled);
                }, { timeout: 20000 })
            ]);
            console.log('Transition from Consultar to the next phase detected.');
        } catch (e) {
            console.log('Timeout waiting for implicit Page 2 transition. Proceeding to find Confirmar anyway in case it was a fast DOM swap.');
        }

        // PAGE 2
        console.log('Page 2 loaded. Waiting before clicking Confirmar...');
        await delay(1500, 3000);

        await page.waitForFunction(() => {
            const buttons = Array.from(document.querySelectorAll('br-button[primary]'));
            return buttons.some(b => b.textContent.trim() === 'Confirmar' && !b.disabled);
        }, { timeout: 10000 });

        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('br-button[primary]'));
            const confirmarBtn = buttons.find(b => b.textContent.trim() === 'Confirmar' && !b.disabled);
            if (confirmarBtn) {
                confirmarBtn.scrollIntoView({ block: 'center' });
                let clicked = false;
                if (confirmarBtn.shadowRoot) {
                    const innerBtn = confirmarBtn.shadowRoot.querySelector('button');
                    if (innerBtn) { innerBtn.click(); clicked = true; }
                }
                if (!clicked) {
                    const innerBtn = confirmarBtn.querySelector('button');
                    if (innerBtn) { innerBtn.click(); clicked = true; }
                }
                if (!clicked) confirmarBtn.click();
            }
        });

        console.log('Clicked "Confirmar" on Page 2. Waiting for Page 3 to load...');

        // Wait for "Data do Pagamento" or "Código de Pagamento" to appear in the DOM
        try {
            await page.waitForFunction(() => {
                const labels = Array.from(document.querySelectorAll('label'));
                return labels.some(l => l.textContent.toLowerCase().includes('data do pagamento') || l.textContent.toLowerCase().includes('código de pagamento'));
            }, { timeout: 30000 });
        } catch (e) {
            console.log('Timeout waiting for Page 3 to render.');
        }

        // PAGE 3
        console.log('Page 3 loaded. Simulating human delay before filling payment details...');
        await delay(2000, 4000);

        if (DEBUG) {
            fs.writeFileSync('page3_dump.html', await page.content());
            console.log('Saved page3_dump.html for reference.');
        }

        const today = new Date();
        const formattedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`; // YYYY-MM-DD

        console.log('Searching for "Data do Pagamento" and "Código de Pagamento"...');

        // 1. Fill Data do Pagamento
        console.log('Opening "Data do Pagamento" calendar...');
        await page.evaluate(() => {
            const labels = Array.from(document.querySelectorAll('label'));
            const dateLabel = labels.find(l => l.textContent.toLowerCase().includes('data do pagamento'));
            if (dateLabel) {
                const wrapper = dateLabel.closest('.br-input') || dateLabel.parentElement;

                // Usually the calendar is triggered by clicking a button inside or next to the input
                const btn = wrapper.querySelector('button') || wrapper.querySelector('.br-button');
                if (btn) {
                    btn.click();
                } else {
                    // Fallback to clicking the input itself, sometimes triggers datepickers
                    const input = wrapper.querySelector('input');
                    if (input) input.click();
                }
            }
        });

        console.log('Waiting for calendar popup...');
        await delay(1000, 2000);

        console.log('Selecting "Today" from calendar...');
        await page.evaluate(() => {
            // Find a button or span that represents "Hoje" or today's date
            // The flatpickr or similar calendar usually has a 'today' class or a specific button

            // Look for a specific "hoje" button or current day
            const calendarBtns = Array.from(document.querySelectorAll('.flatpickr-day.today, button.today, .is-today, .today'));
            if (calendarBtns.length > 0) {
                calendarBtns[0].click();
            } else {
                // As fallback, we simulate pressing enter if the date is already focused on today
                // or we try to find a button with text "Hoje"
                const allButtons = Array.from(document.querySelectorAll('button, span.br-button'));
                const hojeBtn = allButtons.find(b => b.textContent.toLowerCase().includes('hoje'));
                if (hojeBtn) {
                    hojeBtn.click();
                }
            }
        });
        console.log('Typed Data do Pagamento.');
        await delay(500, 1000);

        // 2. Select Código do Pagamento
        await page.evaluate(() => {
            const labels = Array.from(document.querySelectorAll('label'));
            const codeLabel = labels.find(l => l.textContent.toLowerCase().includes('código de pagamento') || l.textContent.toLowerCase().includes('código pagamento'));
            if (codeLabel) {
                const wrapper = codeLabel.closest('br-select') || codeLabel.parentElement;
                // Click the br-select to open the dropdown
                if (wrapper.shadowRoot) {
                    const inner = wrapper.shadowRoot.querySelector('.br-select') || wrapper.shadowRoot.querySelector('input');
                    if (inner) inner.click();
                    else wrapper.click();
                } else {
                    wrapper.click();
                }
            }
        });

        console.log('Opened Código dropdown. Waiting for items to render...');
        await delay(1000, 2000);

        // Click the option containing 1473
        await page.evaluate(() => {
            // Recursive search for 1473 inside br-item or similar
            const findAndClick1473 = (root) => {
                const elements = root.querySelectorAll('*');
                for (const el of elements) {
                    if (el.shadowRoot) {
                        if (findAndClick1473(el.shadowRoot)) return true;
                    }
                    if ((el.tagName.toLowerCase().includes('item') || el.classList.contains('br-item') || el.classList.contains('item')) &&
                        el.textContent.includes('1473')) {
                        el.click();
                        const nested = el.querySelector('div, span');
                        if (nested) nested.click();
                        return true;
                    }
                }
                return false;
            };

            const clicked = findAndClick1473(document);
            if (!clicked) {
                // Fallback: try standard select
                const selectElem = document.querySelector('select');
                if (selectElem) {
                    const option = Array.from(selectElem.options).find(o => o.text.includes('1473'));
                    if (option) {
                        selectElem.value = option.value;
                        selectElem.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
            }
        });
        console.log('Selected Código 1473.');

        await delay(1000, 2000);

        // 3. Click "+ Adicionar" and fill the new form
        console.log('Fetching minimum wage...');
        const bcbRes = await axios.get('https://api.bcb.gov.br/dados/serie/bcdata.sgs.1619/dados/ultimos/1?formato=json');
        const minWageRaw = bcbRes.data[0].valor;
        const minWageNum = parseFloat(minWageRaw);
        const minWageInputString = (Math.round(minWageNum * 100)).toString(); // e.g., '141200' for currency mask
        console.log(`Minimum wage fetched: ${minWageRaw} -> formatted for input: ${minWageInputString}`);

        console.log('Clicking "+ Adicionar"...');
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('br-button'));
            const addBtn = buttons.find(b => b.textContent.includes('Adicionar'));
            if (addBtn) {
                const inner = addBtn.shadowRoot ? addBtn.shadowRoot.querySelector('button') : addBtn.querySelector('button');
                if (inner) inner.click();
                else addBtn.click();
            }
        });

        console.log('Waiting for modal to appear...');
        await delay(1500, 2500); // Wait for modal to open

        const mmStr = String(today.getMonth() + 1).padStart(2, '0');
        const yyyyStr = today.getFullYear();
        const competenciaStr = `${mmStr}${yyyyStr}`;

        console.log('Filling Competência...');
        await page.evaluate(() => {
            const labels = Array.from(document.querySelectorAll('label'));
            const compLabel = labels.find(l => l.textContent.toLowerCase().includes('competência'));
            if (compLabel) {
                const wrapper = compLabel.closest('br-input') || compLabel.parentElement;
                const input = wrapper.querySelector('input') || (wrapper.shadowRoot ? wrapper.shadowRoot.querySelector('input') : null);
                if (input) {
                    input.focus();
                    input.click();
                }
            }
        });
        await delay(500, 1000);
        await page.keyboard.type(competenciaStr, { delay: 100 });
        await page.keyboard.press('Tab');
        await delay(500, 1000);

        console.log('Filling Salário...');
        await page.evaluate(() => {
            const labels = Array.from(document.querySelectorAll('label'));
            const salLabel = labels.find(l => l.textContent.toLowerCase().includes('salário'));
            if (salLabel) {
                const wrapper = salLabel.closest('.br-input') || salLabel.parentElement;
                const input = wrapper.querySelector('input');
                if (input) {
                    input.focus();
                    input.click();
                }
            }
        });
        await delay(500, 1000);
        await page.keyboard.type(minWageInputString, { delay: 100 });
        await page.keyboard.press('Tab');
        await delay(500, 1000);

        console.log('Clicking "Confirmar" on the modal...');
        await page.evaluate(() => {
            const modals = Array.from(document.querySelectorAll('br-modal'));
            const addModal = modals.find(m => m.getAttribute('title') === 'Adicionar Contribuição' && m.getAttribute('show') !== null);
            if (addModal) {
                const buttons = Array.from(addModal.querySelectorAll('br-button[primary], br-button'));
                const confirmAddBtn = buttons.filter(b => b.textContent.includes('Confirmar')).pop(); // Get last one or most specific
                if (confirmAddBtn) {
                    const inner = confirmAddBtn.shadowRoot ? confirmAddBtn.shadowRoot.querySelector('button') : confirmAddBtn.querySelector('button');
                    if (inner) inner.click();
                    else confirmAddBtn.click();
                }
            } else {
                // Fallback: search all buttons inside any modal
                const modal = document.querySelector('br-modal[show]');
                if (modal) {
                    const buttons = Array.from(modal.querySelectorAll('br-button'));
                    const confirmBtn = buttons.find(b => b.textContent.includes('Confirmar'));
                    if (confirmBtn) {
                        const inner = confirmBtn.shadowRoot ? confirmBtn.shadowRoot.querySelector('button') : confirmBtn.querySelector('button');
                        if (inner) inner.click();
                        else confirmBtn.click();
                    }
                }
            }
        });
        console.log('Modal Confirmar clicked. Waiting for table to update...');
        await delay(2000, 4000);

        if (DEBUG) {
            await page.screenshot({ path: 'page3_filled.png' });
            console.log('Saved page3_filled.png');
        }

        console.log('Clicking final "Confirmar"...');
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('br-button[primary]'));
            const confirmarBtn = buttons.reverse().find(b => b.textContent.trim() === 'Confirmar' && !b.disabled && !b.closest('br-modal'));
            if (confirmarBtn) {
                const innerBtn = confirmarBtn.shadowRoot ? confirmarBtn.shadowRoot.querySelector('button') : confirmarBtn.querySelector('button');
                if (innerBtn) innerBtn.click();
                else confirmarBtn.click();
            } else {
                console.log('Final Confirmar button not found or is disabled.');
            }
        });

        console.log('Flow complete! Waiting for Page 4 to load...');
        await delay(3000, 6000);

        // Configure download path for PDF
        const downloadPath = path.join(__dirname, 'pdf');
        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath, { recursive: true });
            console.log(`Created PDF directory at: ${downloadPath}`);
        } else {
            console.log(`PDF directory already exists at: ${downloadPath}`);
        }

        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: downloadPath
        });

        // Also allow downloads on any new tabs that might open
        browser.on('targetcreated', async target => {
            if (target.type() === 'page') {
                try {
                    const newPage = await target.page();
                    const newClient = await newPage.target().createCDPSession();
                    await newClient.send('Page.setDownloadBehavior', {
                        behavior: 'allow',
                        downloadPath: downloadPath
                    });
                    console.log('Configured download behavior for new tab.');
                } catch (e) {
                    console.log('Error configuring new tab CDP session:', e);
                }
            }
        });

        console.log('Configured Puppeteer headless download settings.');

        page.on('response', async (response) => {
            const resUrl = response.url();
            const contentType = response.headers()['content-type'] || '';
            const contentDisposition = response.headers()['content-disposition'] || '';

            if (contentType.includes('application/pdf') || (contentDisposition.includes('attachment') && contentDisposition.includes('.pdf'))) {
                console.log('Detected PDF downloading response:', resUrl);
                try {
                    const buffer = await response.buffer();
                    const pdfOutPath = path.join(downloadPath, `gps_emitted_intercept_${Date.now()}.pdf`);
                    fs.writeFileSync(pdfOutPath, buffer);
                    console.log('Successfully saved intercepted PDF to', pdfOutPath);
                } catch (e) {
                    console.log('Error saving intercepted PDF:', e.message);
                }
            }
        });

        // Page 4: Checkbox & Emitir GPS
        console.log('Attempting to select the "check all" checkbox in the table header...');

        if (DEBUG) {
            fs.writeFileSync('page4_dump.html', await page.content());
            console.log('Saved page4_dump.html for reference.');
        }

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
        console.log('Fired click and change events on br-checkbox components.');

        await delay(1000, 2000);

        console.log('Waiting for "Emitir GPS" button to be enabled...');
        const buttons = await page.$$('br-button');
        let emitirBtn = null;
        for (const btn of buttons) {
            const textContent = await page.evaluate(el => el.textContent.toLowerCase(), btn);
            if (textContent.includes('emitir gps')) {
                emitirBtn = btn;
                break;
            }
        }

        // Set up the popup listener BEFORE any Emitir GPS click so we catch the new window
        console.log('Setting up popup listener for GPS boleto window (before clicking Emitir GPS)...');
        const boletoPdfPromise = new Promise(resolve => {
            browser.once('targetcreated', async target => {
                if (target.type() === 'page') {
                    resolve(await target.page());
                }
            });
        });

        if (emitirBtn) {
            if (capsolverKey) {
                console.log('\n--- [PAGE 4 CAPTCHA] PAID TOKEN FALLBACK (CapSolver) ---');
                try {
                    const currentUrl = await page.url();

                    // Dynamically extract site key from the reCAPTCHA iframe on Page 4
                    let siteKeyP4 = null;
                    try {
                        await page.waitForSelector('iframe[title="reCAPTCHA"]', { timeout: 5000 });
                        const p4FrameEl = await page.$('iframe[title="reCAPTCHA"]');
                        const p4Src = await page.evaluate(el => el.src, p4FrameEl);
                        const p4Match = p4Src.match(/k=([^&]+)/);
                        if (p4Match) siteKeyP4 = p4Match[1];
                    } catch (e) { }
                    if (!siteKeyP4) siteKeyP4 = '6Le7YegkAAAAAFNIhuu_eBRaDmxLY6Qf_A8BrtKX'; // fallback
                    console.log(`Using site key for Page 4: ${siteKeyP4}`);

                    // Retry CapSolver up to 3 times on failure (error 1001 is common)
                    let capsolverToken = null;
                    const MAX_CAPSOLVER_RETRIES = 3;
                    for (let attempt = 1; attempt <= MAX_CAPSOLVER_RETRIES; attempt++) {
                        try {
                            console.log(`Requesting reCAPTCHA v2 token from CapSolver (attempt ${attempt}/${MAX_CAPSOLVER_RETRIES})...`);
                            const createTaskRes = await axios.post('https://api.capsolver.com/createTask', {
                                clientKey: capsolverKey,
                                task: {
                                    type: "ReCaptchaV2TaskProxyless",
                                    websiteURL: currentUrl,
                                    websiteKey: siteKeyP4
                                }
                            });

                            if (createTaskRes.data.errorId !== 0) {
                                throw new Error(`CapSolver Task Creation Failed: ${createTaskRes.data.errorDescription}`);
                            }

                            const taskId = createTaskRes.data.taskId;
                            console.log(`Task created. ID: ${taskId}. Polling for solution...`);

                            for (let i = 0; i < 40; i++) {
                                await delay(2000, 2000);
                                const taskResultRes = await axios.post('https://api.capsolver.com/getTaskResult', {
                                    clientKey: capsolverKey,
                                    taskId: taskId
                                });

                                if (taskResultRes.data.status === 'ready') {
                                    capsolverToken = taskResultRes.data.solution.gRecaptchaResponse;
                                    break;
                                } else if (taskResultRes.data.status === 'failed') {
                                    throw new Error(`CapSolver Task Failed: ${taskResultRes.data.errorDescription}`);
                                }
                            }

                            if (capsolverToken) break; // Success, exit retry loop
                            throw new Error('CapSolver polling timed out.');
                        } catch (retryErr) {
                            console.log(`CapSolver attempt ${attempt} failed: ${retryErr.message}`);
                            if (attempt === MAX_CAPSOLVER_RETRIES) {
                                throw new Error(`All ${MAX_CAPSOLVER_RETRIES} CapSolver attempts failed.`);
                            }
                            console.log('Retrying CapSolver...');
                            await delay(2000, 3000);
                        }
                    }

                    console.log(`Token acquired. Length: ${capsolverToken.length}. Ready to inject.`);

                    console.log('Clicking "Emitir GPS" button to trigger Angular flow and CAPTCHA challenge...');
                    for (let i = 0; i < 20; i++) {
                        const isDisabled = await page.evaluate(el => el.hasAttribute('disabled') || el.disabled, emitirBtn);
                        if (!isDisabled) {
                            await emitirBtn.click();
                            console.log('Clicked "Emitir GPS" button natively.');
                            break;
                        }
                        await delay(500, 500);
                    }

                    console.log('Waiting for visual CAPTCHA iframe to initialize...');
                    await delay(1500, 2500);

                    await page.evaluate((token) => {
                        const textarea = document.getElementById("g-recaptcha-response");
                        if (textarea) {
                            textarea.innerHTML = token;
                            textarea.value = token;
                            textarea.dispatchEvent(new Event('input', { bubbles: true }));
                            textarea.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }, capsolverToken);

                    console.log('SUCCESS: Page 4 CAPTCHA token injected into textarea!');

                    console.log('Giving Angular 2s to detect token before second click...');
                    await delay(2000, 2500);

                    console.log('Clicking "Emitir GPS" via coordinate-based mouse click...');
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
                        console.log(`Clicked "Emitir GPS" via mouse at (${btnCoords.x.toFixed(0)}, ${btnCoords.y.toFixed(0)})`);
                    } else {
                        console.log('Could not locate "Emitir GPS" button for coordinate click.');
                    }
                } catch (err) {
                    console.log(`FAIL: Page 4 CapSolver failed. Reason: ${err.message}`);
                }
            } else {
                // If Capsolver key is missing, just click it natively
                console.log('No CapSolver key. Clicking "Emitir GPS" button natively as fallback...');
                for (let i = 0; i < 20; i++) {
                    const isDisabled = await page.evaluate(el => el.hasAttribute('disabled') || el.disabled, emitirBtn);
                    if (!isDisabled) {
                        await emitirBtn.click();
                        console.log('Clicked "Emitir GPS" button natively.');
                        break;
                    }
                    await delay(500, 500);
                }
            }
        } else {
            console.log('Could not find "Emitir GPS" button.');
        }

        console.log('Waiting up to 30s for the GPS boleto popup to open...');
        try {
            const boletoPg = await Promise.race([
                boletoPdfPromise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout: GPS boleto popup did not open')), 30000))
            ]);

            console.log('Boleto popup captured! URL:', boletoPg.url());

            // The popup is serving the actual PDF as a blob: URL.
            // We fetch that blob from inside the page context, convert to base64, and write it to disk.
            await delay(3000, 5000); // Give the browser time to fully load the blob

            const blobUrl = boletoPg.url();
            const pdfOutPath = path.join(downloadPath, 'gps_emitted.pdf');

            const pdfBase64 = await boletoPg.evaluate(async (url) => {
                const res = await fetch(url);
                const buf = await res.arrayBuffer();
                const bytes = new Uint8Array(buf);
                let binary = '';
                for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
                return btoa(binary);
            }, blobUrl);

            fs.writeFileSync(pdfOutPath, Buffer.from(pdfBase64, 'base64'));
            console.log(`Saved actual GPS boleto PDF (blob) to ${pdfOutPath} successfully!`);

            if (DEBUG) {
                await boletoPg.screenshot({ path: 'page_boleto_popup.png', fullPage: true });
                console.log('Saved page_boleto_popup.png for verification');
            }

            await boletoPg.close();
        } catch (e) {
            console.log(`Could not capture boleto popup: ${e.message}`);
            if (DEBUG) {
                await page.screenshot({ path: 'page5_fallback.png', fullPage: true });
            }
        }

        console.log('Waiting for URL/Page transition to Page 5 (Boleto Summary)...');
        try {
            await page.waitForFunction(() => {
                const text = document.body.innerText;
                const matchesBarcode = /[\d]{11}\-\d\s+[\d]{11}\-\d/.test(text);
                return text.includes('Data de Vencimento') || matchesBarcode;
            }, { timeout: 20000 });
            console.log('Successfully on Page 5 (Summary)!');
        } catch (e) {
            console.log('Continuing without Page 5 confirmation...');
        }

        await delay(2000, 3000);

        console.log('Extracting JSON data from Page 5...');
        const summaryData = await page.evaluate(() => {
            const text = document.body.innerText;
            const nisMatch = text.match(/NIT\s*\/\s*PIS\s*\/\s*PASEP:\s*([\d\.\-]+)/i);
            const nomeMatch = text.match(/Nome:\s*([^\n]+)/i);
            const calcMatch = text.match(/Data de C[aá]lculo:\s*([\d\/]+)/i);
            const vencMatch = text.match(/Vencimento\s*([\d\/]+)/i);
            const totalMatch = text.match(/Total\s*(R\$\s*[\d\,\.]+)/i);
            const barcodeMatch = text.match(/([\d]{11}\-\d\s+[\d]{11}\-\d\s+[\d]{11}\-\d\s+[\d]{11}\-\d)/);

            return {
                nis: nisMatch ? nisMatch[1].trim() : null,
                nome: nomeMatch ? nomeMatch[1].trim() : null,
                data_calculo: calcMatch ? calcMatch[1].trim() : null,
                data_vencimento: vencMatch ? vencMatch[1].trim() : null,
                total: totalMatch ? totalMatch[1].trim() : null,
                barcode: barcodeMatch ? barcodeMatch[1].trim() : null
            };
        });

        const jsonOutPath = path.join(downloadPath, 'boleto_summary.json');
        fs.writeFileSync(jsonOutPath, JSON.stringify(summaryData, null, 2));
        console.log('Saved JSON summary to', jsonOutPath, summaryData);
    } catch (err) {
        console.error('An error occurred during automation:', err);
        try {
            await page.screenshot({ path: 'error_screenshot.png', fullPage: true });
            const html = await page.content();
            fs.writeFileSync('error_dump.html', html);
            console.log('Saved error_screenshot.png and error_dump.html');
        } catch (e) {
            console.log('Could not save screenshot/html:', e);
        }
    } finally {
        if (browser) await browser.close();
        console.log('Browser closed. GPS emission automated run finished.');
    }

})();

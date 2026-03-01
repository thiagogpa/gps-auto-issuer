const logger = require('./logger');

/**
 * Randomized delay to mimic human behavior.
 * @param {number} min - Minimum delay in ms
 * @param {number} max - Maximum delay in ms
 */
const delay = (min, max) =>
    new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1) + min)));

/**
 * Click a br-button by finding it via text content.
 * Handles shadow DOM and inner <button> elements.
 * @param {import('puppeteer').Page} page
 * @param {string} text - Text to match (case-sensitive, uses includes)
 * @param {object} [options]
 * @param {boolean} [options.primary] - Only match br-button[primary]
 * @param {boolean} [options.excludeModal] - Exclude buttons inside br-modal
 * @returns {Promise<boolean>} true if clicked
 */
async function clickBrButton(page, text, options = {}) {
    return page.evaluate(({ text, primary, excludeModal }) => {
        const selector = primary ? 'br-button[primary]' : 'br-button';
        const buttons = Array.from(document.querySelectorAll(selector));
        let btn = buttons.find(b => {
            if (excludeModal && b.closest('br-modal')) return false;
            return b.textContent.trim().includes(text);
        });
        if (!btn) return false;

        const inner = btn.shadowRoot
            ? btn.shadowRoot.querySelector('button')
            : btn.querySelector('button');
        if (inner) inner.click();
        else btn.click();
        return true;
    }, { text, primary: !!options.primary, excludeModal: !!options.excludeModal });
}

/**
 * Focus and click an input field found via its label text.
 * @param {import('puppeteer').Page} page
 * @param {string} labelText - Partial text to match in the label
 */
async function focusInputByLabel(page, labelText) {
    await page.evaluate((text) => {
        const labels = Array.from(document.querySelectorAll('label'));
        const label = labels.find(l => l.textContent.toLowerCase().includes(text.toLowerCase()));
        if (label) {
            const wrapper = label.closest('br-input') || label.closest('.br-input') || label.parentElement;
            const input = wrapper.querySelector('input') || (wrapper.shadowRoot ? wrapper.shadowRoot.querySelector('input') : null);
            if (input) {
                input.focus();
                input.click();
            }
        }
    }, labelText);
}

/**
 * Extract the reCAPTCHA site key from the page's iframe.
 * @param {import('puppeteer').Page} page
 * @param {number} [timeout=10000]
 * @returns {Promise<string|null>}
 */
async function extractSiteKey(page, timeout = 10000) {
    try {
        await page.waitForSelector('iframe[title="reCAPTCHA"]', { timeout });
        const frameEl = await page.$('iframe[title="reCAPTCHA"]');
        const src = await page.evaluate(el => el.src, frameEl);
        const match = src.match(/k=([^&]+)/);
        return match ? match[1] : null;
    } catch {
        return null;
    }
}

/**
 * Save a debug artifact (screenshot or HTML dump) only when DEBUG=true.
 * @param {import('puppeteer').Page} page
 * @param {string} filename
 * @param {'screenshot'|'html'} type
 * @param {boolean} debug
 */
async function saveDebug(page, filename, type, debug) {
    if (!debug) return;
    try {
        if (type === 'screenshot') {
            await page.screenshot({ path: filename, fullPage: true });
        } else {
            const fs = require('fs');
            fs.writeFileSync(filename, await page.content());
        }
        logger.debug(`Saved ${filename}`);
    } catch (e) {
        logger.debug(`Could not save ${filename}: ${e.message}`);
    }
}

module.exports = { delay, clickBrButton, focusInputByLabel, extractSiteKey, saveDebug };

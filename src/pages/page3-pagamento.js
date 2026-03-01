const axios = require('axios');
const { delay, focusInputByLabel, clickBrButton, saveDebug } = require('../helpers');
const logger = require('../logger');

/**
 * Page 3: Fill payment details (date, código, competência, salário) and confirm.
 */
async function navigatePage3(page, config) {
    // Wait for Page 3 to render
    try {
        await page.waitForFunction(() => {
            const labels = Array.from(document.querySelectorAll('label'));
            return labels.some(l =>
                l.textContent.toLowerCase().includes('data do pagamento') ||
                l.textContent.toLowerCase().includes('código de pagamento')
            );
        }, { timeout: 30000 });
    } catch {
        logger.warn('Timeout waiting for Page 3 to render.');
    }

    logger.info('Page 3 loaded. Filling payment details...');
    await delay(2000, 4000);

    await saveDebug(page, 'page3_dump.html', 'html', config.debug);

    logger.debug('Searching for "Data do Pagamento" and "Código de Pagamento"...');

    // 1. Fill Data do Pagamento — set to next valid weekday (no weekends)
    logger.debug('Setting "Data do Pagamento" to next valid weekday...');
    const paymentDate = new Date();
    const originalMonth = paymentDate.getMonth();

    if (paymentDate.getDay() === 6) paymentDate.setDate(paymentDate.getDate() + 2); // Saturday -> Monday
    else if (paymentDate.getDay() === 0) paymentDate.setDate(paymentDate.getDate() + 1); // Sunday -> Monday

    // If pushing to Monday changed the month, it will trigger an impossible validation on RFB's end
    // (Mês/Ano deve ser o mesmo da data de cálculo). We'll attempt it anyway and capture the clear error.

    const paymentDateStr = `${paymentDate.getFullYear()}-${String(paymentDate.getMonth() + 1).padStart(2, '0')}-${String(paymentDate.getDate()).padStart(2, '0')}`;

    await page.evaluate((dateStr) => {
        const input = document.getElementById('input-dataPagamento') || document.querySelector('input[type="date"]');
        if (input) {
            input.removeAttribute('min'); // bypass frontend restriction
            input.value = dateStr;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }, paymentDateStr);
    logger.debug(`Selected payment date: ${paymentDateStr}.`);
    await delay(500, 1000);

    // 2. Select Código do Pagamento
    await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll('label'));
        const codeLabel = labels.find(l =>
            l.textContent.toLowerCase().includes('código de pagamento') ||
            l.textContent.toLowerCase().includes('código pagamento')
        );
        if (codeLabel) {
            const wrapper = codeLabel.closest('br-select') || codeLabel.parentElement;
            if (wrapper.shadowRoot) {
                const inner = wrapper.shadowRoot.querySelector('.br-select') || wrapper.shadowRoot.querySelector('input');
                if (inner) inner.click();
                else wrapper.click();
            } else {
                wrapper.click();
            }
        }
    });

    logger.debug('Opened Código dropdown. Waiting for items to render...');
    await delay(1000, 2000);

    await page.evaluate((code) => {
        const findAndClick = (root) => {
            const elements = root.querySelectorAll('*');
            for (const el of elements) {
                if (el.shadowRoot && findAndClick(el.shadowRoot)) return true;
                if ((el.tagName.toLowerCase().includes('item') ||
                    el.classList.contains('br-item') ||
                    el.classList.contains('item')) &&
                    el.textContent.includes(code)) {
                    el.click();
                    const nested = el.querySelector('div, span');
                    if (nested) nested.click();
                    return true;
                }
            }
            return false;
        };

        if (!findAndClick(document)) {
            const selectElem = document.querySelector('select');
            if (selectElem) {
                const option = Array.from(selectElem.options).find(o => o.text.includes(code));
                if (option) {
                    selectElem.value = option.value;
                    selectElem.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        }
    }, config.codigoPagamento);
    logger.debug(`Selected Código ${config.codigoPagamento}.`);
    await delay(1000, 2000);

    // 3. Fetch minimum wage and fill the modal
    logger.info('Fetching minimum wage...');
    const bcbRes = await axios.get(config.minWageApiUrl);
    const minWageRaw = bcbRes.data[0].valor;
    const minWageNum = parseFloat(minWageRaw);
    const minWageInputString = (Math.round(minWageNum * 100)).toString();
    logger.debug(`Minimum wage fetched: ${minWageRaw} -> formatted for input: ${minWageInputString}`);

    // Click "+ Adicionar"
    logger.debug('Clicking "+ Adicionar"...');
    await clickBrButton(page, 'Adicionar');

    logger.debug('Waiting for modal to appear...');
    await delay(1500, 2500);

    // Competência (MM/YYYY)
    const today = new Date();
    const competenciaStr = `${String(today.getMonth() + 1).padStart(2, '0')}${today.getFullYear()}`;
    logger.debug('Filling Competência...');
    await focusInputByLabel(page, 'competência');
    await delay(500, 1000);
    await page.keyboard.type(competenciaStr, { delay: 100 });
    await page.keyboard.press('Tab');
    await delay(500, 1000);

    // Salário
    logger.debug('Filling Salário...');
    await focusInputByLabel(page, 'salário');
    await delay(500, 1000);
    await page.keyboard.type(minWageInputString, { delay: 100 });
    await page.keyboard.press('Tab');
    await delay(500, 1000);

    // Click Confirmar inside the modal
    logger.debug('Clicking "Confirmar" on the modal...');
    await page.evaluate(() => {
        const modals = Array.from(document.querySelectorAll('br-modal'));
        const addModal = modals.find(m => m.getAttribute('title') === 'Adicionar Contribuição' && m.getAttribute('show') !== null);
        if (addModal) {
            const buttons = Array.from(addModal.querySelectorAll('br-button[primary], br-button'));
            const confirmBtn = buttons.filter(b => b.textContent.includes('Confirmar')).pop();
            if (confirmBtn) {
                const inner = confirmBtn.shadowRoot ? confirmBtn.shadowRoot.querySelector('button') : confirmBtn.querySelector('button');
                if (inner) inner.click();
                else confirmBtn.click();
            }
        } else {
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
    logger.debug('Modal Confirmar clicked. Waiting for table to update...');
    await delay(2000, 4000);

    await saveDebug(page, 'page3_filled.png', 'screenshot', config.debug);

    // Click final "Confirmar" on the page (not in modal)
    logger.debug('Clicking final "Confirmar"...');
    await clickBrButton(page, 'Confirmar', { primary: true, excludeModal: true });

    logger.debug('Checking for RFB validation errors...');
    await delay(3000, 6000);

    const errorMessage = await page.evaluate(() => {
        const msg = document.querySelector('br-message[state="danger"]');
        return msg ? msg.textContent.trim() : null;
    });

    if (errorMessage) {
        throw new Error(`RFB Validation Error: ${errorMessage}`);
    }

    logger.info('Page 3 flow complete! Waiting for Page 4 to load...');
}

module.exports = navigatePage3;

const axios = require('axios');
const { delay, focusInputByLabel, clickBrButton, saveDebug } = require('../helpers');

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
        console.log('Timeout waiting for Page 3 to render.');
    }

    console.log('Page 3 loaded. Simulating human delay before filling payment details...');
    await delay(2000, 4000);

    await saveDebug(page, 'page3_dump.html', 'html', config.debug);

    console.log('Searching for "Data do Pagamento" and "Código de Pagamento"...');

    // 1. Fill Data do Pagamento — click calendar, select today
    console.log('Opening "Data do Pagamento" calendar...');
    await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll('label'));
        const dateLabel = labels.find(l => l.textContent.toLowerCase().includes('data do pagamento'));
        if (dateLabel) {
            const wrapper = dateLabel.closest('.br-input') || dateLabel.parentElement;
            const btn = wrapper.querySelector('button') || wrapper.querySelector('.br-button');
            if (btn) btn.click();
            else {
                const input = wrapper.querySelector('input');
                if (input) input.click();
            }
        }
    });

    console.log('Waiting for calendar popup...');
    await delay(1000, 2000);

    console.log('Selecting "Today" from calendar...');
    await page.evaluate(() => {
        const calendarBtns = Array.from(document.querySelectorAll('.flatpickr-day.today, button.today, .is-today, .today'));
        if (calendarBtns.length > 0) {
            calendarBtns[0].click();
        } else {
            const allButtons = Array.from(document.querySelectorAll('button, span.br-button'));
            const hojeBtn = allButtons.find(b => b.textContent.toLowerCase().includes('hoje'));
            if (hojeBtn) hojeBtn.click();
        }
    });
    console.log('Selected today as payment date.');
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

    console.log('Opened Código dropdown. Waiting for items to render...');
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
    console.log(`Selected Código ${config.codigoPagamento}.`);
    await delay(1000, 2000);

    // 3. Fetch minimum wage and fill the modal
    console.log('Fetching minimum wage...');
    const bcbRes = await axios.get(config.minWageApiUrl);
    const minWageRaw = bcbRes.data[0].valor;
    const minWageNum = parseFloat(minWageRaw);
    const minWageInputString = (Math.round(minWageNum * 100)).toString();
    console.log(`Minimum wage fetched: ${minWageRaw} -> formatted for input: ${minWageInputString}`);

    // Click "+ Adicionar"
    console.log('Clicking "+ Adicionar"...');
    await clickBrButton(page, 'Adicionar');

    console.log('Waiting for modal to appear...');
    await delay(1500, 2500);

    // Competência (MM/YYYY)
    const today = new Date();
    const competenciaStr = `${String(today.getMonth() + 1).padStart(2, '0')}${today.getFullYear()}`;
    console.log('Filling Competência...');
    await focusInputByLabel(page, 'competência');
    await delay(500, 1000);
    await page.keyboard.type(competenciaStr, { delay: 100 });
    await page.keyboard.press('Tab');
    await delay(500, 1000);

    // Salário
    console.log('Filling Salário...');
    await focusInputByLabel(page, 'salário');
    await delay(500, 1000);
    await page.keyboard.type(minWageInputString, { delay: 100 });
    await page.keyboard.press('Tab');
    await delay(500, 1000);

    // Click Confirmar inside the modal
    console.log('Clicking "Confirmar" on the modal...');
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
    console.log('Modal Confirmar clicked. Waiting for table to update...');
    await delay(2000, 4000);

    await saveDebug(page, 'page3_filled.png', 'screenshot', config.debug);

    // Click final "Confirmar" on the page (not in modal)
    console.log('Clicking final "Confirmar"...');
    await clickBrButton(page, 'Confirmar', { primary: true, excludeModal: true });

    console.log('Flow complete! Waiting for Page 4 to load...');
    await delay(3000, 6000);
}

module.exports = navigatePage3;

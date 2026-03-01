const { delay, clickBrButton } = require('../helpers');
const logger = require('../logger');

/**
 * Page 2: Wait for transition, then click Confirmar.
 */
async function navigatePage2(page, config) {
    // Wait for page transition
    await page.waitForFunction(() => {
        const text = document.body.innerText;
        return text.includes('Dados Cadastrais') ||
            text.includes('Confirmar') ||
            text.includes('Filiação');
    }, { timeout: 15000 });
    logger.info('Transition from Consultar to the next phase detected.');

    logger.debug('Page 2 loaded. Waiting before clicking Confirmar...');
    await delay(2000, 4000);

    // Wait for Confirmar button to be available and enabled
    await page.waitForFunction(() => {
        const buttons = Array.from(document.querySelectorAll('br-button[primary]'));
        return buttons.some(b => b.textContent.trim() === 'Confirmar' && !b.disabled);
    }, { timeout: 10000 });

    await clickBrButton(page, 'Confirmar', { primary: true });
    logger.info('Clicked "Confirmar" on Page 2. Waiting for Page 3 to load...');
    await delay(2000, 4000);
}

module.exports = navigatePage2;

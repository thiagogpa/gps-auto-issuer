const fs = require('fs');
const path = require('path');
const { delay } = require('../helpers');
const logger = require('../logger');

/**
 * Get today's date as YYYY-MM-DD string.
 */
function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Page 5: Extract summary data from the boleto page and save as JSON.
 *
 * @returns {Promise<object>} The extracted summary data
 */
async function navigatePage5(page, config) {
    logger.info('Waiting for URL/Page transition to Page 5 (Boleto Summary)...');
    try {
        await page.waitForFunction(() => {
            const text = document.body.innerText;
            const matchesBarcode = /[\d]{11}\-\d\s+[\d]{11}\-\d/.test(text);
            return text.includes('Data de Vencimento') || matchesBarcode;
        }, { timeout: 20000 });
        logger.info('Successfully on Page 5 (Summary)!');
    } catch {
        logger.warn('Continuing without Page 5 confirmation...');
    }

    await delay(2000, 3000);

    logger.debug('Extracting JSON data from Page 5...');
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

    const downloadPath = path.join(process.cwd(), 'output');
    const jsonOutPath = path.join(downloadPath, `boleto_summary_${todayStr()}.json`);

    if (config.saveJson) {
        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath, { recursive: true });
        }
        fs.writeFileSync(jsonOutPath, JSON.stringify(summaryData, null, 2));
        logger.info('Saved JSON summary to ' + jsonOutPath);
    }

    logger.debug('Summary data: ' + JSON.stringify(summaryData));

    return summaryData;
}

module.exports = navigatePage5;

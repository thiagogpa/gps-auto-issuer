const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const config = require('./config');

// Page modules
const navigatePage1 = require('./pages/page1-consulta');
const navigatePage2 = require('./pages/page2-confirmacao');
const navigatePage3 = require('./pages/page3-pagamento');
const navigatePage4 = require('./pages/page4-emissao');
const navigatePage5 = require('./pages/page5-resumo');
const { sendDiscordNotification } = require('./notifications/discord');

puppeteer.use(StealthPlugin());

(async () => {
    let browser;
    let page;

    try {
        console.log('Starting GPS automation with 3-Tier Waterfall CAPTCHA bypass...');
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

        console.log(`Connecting to: ${config.url}`);
        await page.goto(config.url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Page 1: Category, PIS, CAPTCHA, Consultar
        await navigatePage1(page, browser, config);

        // Page 2: Confirmar
        await navigatePage2(page, config);

        // Page 3: Payment form
        await navigatePage3(page, config);

        // Page 4: Emitir GPS + PDF capture
        await navigatePage4(page, browser, config);

        // Page 5: JSON summary extraction
        const summary = await navigatePage5(page, config);

        // Send Discord notification
        await sendDiscordNotification(config.discordWebhookUrl, summary);

    } catch (err) {
        console.error('An error occurred during automation:', err);
        try {
            if (page) {
                await page.screenshot({ path: 'error_screenshot.png', fullPage: true });
                fs.writeFileSync('error_dump.html', await page.content());
                console.log('Saved error_screenshot.png and error_dump.html');
            }
        } catch (e) {
            console.log('Could not save error artifacts:', e.message);
        }
    } finally {
        if (browser) await browser.close();
        console.log('Browser closed. GPS emission automated run finished.');
    }
})();

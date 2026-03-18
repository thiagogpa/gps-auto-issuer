// Prevent real puppeteer/browser from launching
jest.mock('puppeteer-extra', () => ({
    use: jest.fn(),
    launch: jest.fn(),
}));
jest.mock('puppeteer-extra-plugin-stealth', () => jest.fn().mockReturnValue({}));

// Mock all page modules so they don't execute real browser steps
jest.mock('../src/pages/page1-consulta', () => jest.fn().mockResolvedValue(undefined));
jest.mock('../src/pages/page2-confirmacao', () => jest.fn().mockResolvedValue(undefined));
jest.mock('../src/pages/page3-pagamento', () => jest.fn().mockResolvedValue(undefined));
jest.mock('../src/pages/page4-emissao', () => jest.fn().mockResolvedValue(null));
jest.mock('../src/pages/page5-resumo', () => jest.fn().mockResolvedValue({}));

jest.mock('../src/notifications/discord', () => ({
    sendDiscordNotification: jest.fn().mockResolvedValue(undefined),
    sendDiscordWarning: jest.fn().mockResolvedValue(undefined),
    sendDiscordStartup: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/config', () => ({
    url: 'https://example.com',
    pis: '123',
    savePdf: true,
    saveJson: false,
    debug: false,
    dryRun: false,
    discordWebhookUrl: '',
    cronSchedule: '',
    processRetryAttempts: 0,
    processRetryDelayMinutes: 0,
}));

const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-extra');

// ─── Helpers ────────────────────────────────────────────────────────

function makeMockPage() {
    return {
        setViewport: jest.fn().mockResolvedValue(undefined),
        goto: jest.fn().mockResolvedValue(undefined),
        screenshot: jest.fn().mockResolvedValue(undefined),
        content: jest.fn().mockResolvedValue('<html></html>'),
    };
}

function makeMockBrowser(page) {
    return {
        newPage: jest.fn().mockResolvedValue(page),
        close: jest.fn().mockResolvedValue(undefined),
    };
}

// ─── Feature 9: output dir created at startup ────────────────────────

describe('runAutomation() — output dir creation', () => {
    let mkdirSyncSpy;

    beforeEach(() => {
        jest.resetModules();
        // Re-apply mocks after resetModules
        jest.mock('puppeteer-extra', () => ({ use: jest.fn(), launch: jest.fn() }));
        jest.mock('puppeteer-extra-plugin-stealth', () => jest.fn().mockReturnValue({}));
        jest.mock('../src/pages/page1-consulta', () => jest.fn().mockResolvedValue(undefined));
        jest.mock('../src/pages/page2-confirmacao', () => jest.fn().mockResolvedValue(undefined));
        jest.mock('../src/pages/page3-pagamento', () => jest.fn().mockResolvedValue(undefined));
        jest.mock('../src/pages/page4-emissao', () => jest.fn().mockResolvedValue(null));
        jest.mock('../src/pages/page5-resumo', () => jest.fn().mockResolvedValue({}));
        jest.mock('../src/notifications/discord', () => ({
            sendDiscordNotification: jest.fn().mockResolvedValue(undefined),
            sendDiscordWarning: jest.fn().mockResolvedValue(undefined),
            sendDiscordStartup: jest.fn().mockResolvedValue(undefined),
        }));

        mkdirSyncSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
        jest.spyOn(fs, 'existsSync').mockReturnValue(false);
        jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('calls mkdirSync for output/ when savePdf=true', async () => {
        jest.mock('../src/config', () => ({
            url: 'https://example.com',
            pis: '123',
            savePdf: true,
            saveJson: false,
            debug: false,
            dryRun: false,
            discordWebhookUrl: '',
            cronSchedule: '',
            processRetryAttempts: 0,
            processRetryDelayMinutes: 0,
        }));

        const page = makeMockPage();
        const browser = makeMockBrowser(page);
        require('puppeteer-extra').launch.mockResolvedValue(browser);

        const { runAutomation } = require('../src/index');
        await runAutomation();

        const expectedDir = path.join(process.cwd(), 'output');
        expect(mkdirSyncSpy).toHaveBeenCalledWith(expectedDir, { recursive: true });
    });
});

// ─── Feature 1: error artifacts saved inside output/ ─────────────────

describe('runAutomation() — error artifact paths', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.mock('puppeteer-extra', () => ({ use: jest.fn(), launch: jest.fn() }));
        jest.mock('puppeteer-extra-plugin-stealth', () => jest.fn().mockReturnValue({}));
        jest.mock('../src/pages/page1-consulta', () => jest.fn().mockRejectedValue(new Error('page1 failed')));
        jest.mock('../src/pages/page2-confirmacao', () => jest.fn().mockResolvedValue(undefined));
        jest.mock('../src/pages/page3-pagamento', () => jest.fn().mockResolvedValue(undefined));
        jest.mock('../src/pages/page4-emissao', () => jest.fn().mockResolvedValue(null));
        jest.mock('../src/pages/page5-resumo', () => jest.fn().mockResolvedValue({}));
        jest.mock('../src/notifications/discord', () => ({
            sendDiscordNotification: jest.fn().mockResolvedValue(undefined),
            sendDiscordWarning: jest.fn().mockResolvedValue(undefined),
            sendDiscordStartup: jest.fn().mockResolvedValue(undefined),
        }));
        jest.mock('../src/config', () => ({
            url: 'https://example.com',
            pis: '123',
            savePdf: false,
            saveJson: false,
            debug: false,
            dryRun: false,
            discordWebhookUrl: '',
            cronSchedule: '',
            processRetryAttempts: 0,
            processRetryDelayMinutes: 0,
        }));

        jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
        jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('saves error screenshot inside output/', async () => {
        const page = makeMockPage();
        const browser = makeMockBrowser(page);
        require('puppeteer-extra').launch.mockResolvedValue(browser);

        const { runAutomation } = require('../src/index');
        await expect(runAutomation()).rejects.toThrow('page1 failed');

        const expectedPath = path.join(process.cwd(), 'output', 'error_screenshot.png');
        expect(page.screenshot).toHaveBeenCalledWith({ path: expectedPath, fullPage: true });
    });

    test('saves error dump HTML inside output/', async () => {
        const page = makeMockPage();
        const browser = makeMockBrowser(page);
        require('puppeteer-extra').launch.mockResolvedValue(browser);

        const { runAutomation } = require('../src/index');
        await expect(runAutomation()).rejects.toThrow('page1 failed');

        const expectedPath = path.join(process.cwd(), 'output', 'error_dump.html');
        expect(fs.writeFileSync).toHaveBeenCalledWith(expectedPath, '<html></html>');
    });
});

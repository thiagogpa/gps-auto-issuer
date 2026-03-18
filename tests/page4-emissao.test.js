jest.mock('fs');
jest.mock('../src/helpers', () => ({
    delay: jest.fn().mockResolvedValue(undefined),
    extractSiteKey: jest.fn().mockResolvedValue('fake-site-key'),
    saveDebug: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/captcha', () => ({
    requestCapsolverToken: jest.fn().mockResolvedValue('fake-token'),
    injectCaptchaToken: jest.fn().mockResolvedValue(undefined),
}));

const fs = require('fs');
const navigatePage4 = require('../src/pages/page4-emissao');

function makeMockPage() {
    return {
        target: jest.fn().mockReturnValue({
            createCDPSession: jest.fn().mockResolvedValue({
                send: jest.fn().mockResolvedValue(undefined),
            }),
        }),
        on: jest.fn(),
        waitForFunction: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockResolvedValue(undefined),
        evaluateHandle: jest.fn().mockResolvedValue({}),
        url: jest.fn().mockReturnValue('https://example.com'),
        mouse: { click: jest.fn().mockResolvedValue(undefined) },
    };
}

function makeMockBrowser() {
    return {
        on: jest.fn(),
        once: jest.fn(),
    };
}

// ─── DRY_RUN guard ───────────────────────────────────────────────────

describe('navigatePage4() — dryRun', () => {
    beforeEach(() => {
        fs.existsSync.mockReturnValue(true);
        fs.mkdirSync = jest.fn();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('returns null and does not click when dryRun=true', async () => {
        const page = makeMockPage();
        const browser = makeMockBrowser();

        // evaluateHandle for "Emitir GPS" button check
        page.evaluate
            .mockResolvedValueOnce(undefined)  // select checkbox evaluate
            .mockResolvedValueOnce(false)       // isMissingBtn check
            .mockResolvedValueOnce(false);      // isActuallyMissing check

        const config = {
            dryRun: true,
            capsolverKey: 'fake-key',
            debug: false,
        };

        const result = await navigatePage4(page, browser, config);

        expect(result).toBeNull();
        expect(page.mouse.click).not.toHaveBeenCalled();
    });
});

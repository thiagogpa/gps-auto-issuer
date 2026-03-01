/**
 * Tests for the process-level retry logic in index.js.
 *
 * We mock all heavy dependencies (puppeteer, page modules, config, discord)
 * and test that runWithRetry() correctly retries on CaptchaFailedError,
 * sends Discord warnings after exhaustion, and does not retry other errors.
 */

// Mock all puppeteer and page module dependencies
jest.mock('puppeteer-extra', () => {
    const mockPage = {
        setViewport: jest.fn().mockResolvedValue(undefined),
        goto: jest.fn().mockResolvedValue(undefined),
        screenshot: jest.fn().mockResolvedValue(undefined),
        content: jest.fn().mockResolvedValue('<html></html>'),
    };
    const mockBrowser = {
        newPage: jest.fn().mockResolvedValue(mockPage),
        close: jest.fn().mockResolvedValue(undefined),
    };
    return {
        use: jest.fn(),
        launch: jest.fn().mockResolvedValue(mockBrowser),
    };
});
jest.mock('puppeteer-extra-plugin-stealth', () => jest.fn());
jest.mock('../src/pages/page1-consulta', () => jest.fn().mockResolvedValue(undefined));
jest.mock('../src/pages/page2-confirmacao', () => jest.fn().mockResolvedValue(undefined));
jest.mock('../src/pages/page3-pagamento', () => jest.fn().mockResolvedValue(undefined));
jest.mock('../src/pages/page4-emissao', () => jest.fn().mockResolvedValue(null));
jest.mock('../src/pages/page5-resumo', () => jest.fn().mockResolvedValue({ nis: '123', nome: 'Test' }));
jest.mock('../src/notifications/discord', () => ({
    sendDiscordNotification: jest.fn().mockResolvedValue(undefined),
    sendDiscordWarning: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/config', () => ({
    url: 'https://example.com',
    pis: '123',
    discordWebhookUrl: 'https://discord.com/api/webhooks/test',
    processRetryAttempts: 2,
    processRetryDelayMinutes: 0,
}));

const { CaptchaFailedError } = require('../src/captcha');
const { sendDiscordWarning } = require('../src/notifications/discord');
const navigatePage1 = require('../src/pages/page1-consulta');

// We need to require index.js AFTER all mocks are set up
// but index.js runs an IIFE on require, so we import the exported functions
let runWithRetry;
let runAutomation;

beforeAll(() => {
    // Require the module — the IIFE will execute with mocked config (processRetryAttempts=2, delay=0)
    // but we can still test the exported functions independently
    const indexModule = require('../src/index');
    runWithRetry = indexModule.runWithRetry;
    runAutomation = indexModule.runAutomation;
});

describe('runWithRetry()', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset page1 to succeed by default
        navigatePage1.mockResolvedValue(undefined);
    });

    test('succeeds on first attempt without retries', async () => {
        await runWithRetry(2, 0);

        expect(sendDiscordWarning).not.toHaveBeenCalled();
    });

    test('retries on CaptchaFailedError and succeeds on second attempt', async () => {
        navigatePage1
            .mockRejectedValueOnce(new CaptchaFailedError('CAPTCHA failed'))
            .mockResolvedValueOnce(undefined);

        await runWithRetry(2, 0);

        // Page1 called twice (1 fail + 1 success)
        expect(navigatePage1).toHaveBeenCalledTimes(2);
        // No warning sent because it eventually succeeded
        expect(sendDiscordWarning).not.toHaveBeenCalled();
    });

    test('sends Discord warning after all retries exhausted', async () => {
        navigatePage1.mockRejectedValue(new CaptchaFailedError('CAPTCHA failed'));

        await runWithRetry(1, 0); // 1 retry = 2 total attempts

        // Page1 called twice (initial + 1 retry)
        expect(navigatePage1).toHaveBeenCalledTimes(2);

        expect(sendDiscordWarning).toHaveBeenCalledTimes(1);
        expect(sendDiscordWarning).toHaveBeenCalledWith(
            'https://discord.com/api/webhooks/test',
            'GPS Automation Failed',
            expect.stringContaining('failed after 2 attempt(s)')
        );
    });

    test('does not retry non-CaptchaFailedError errors', async () => {
        navigatePage1.mockRejectedValue(new Error('Network timeout'));

        await runWithRetry(2, 0);

        // Only called once — no retry for non-CAPTCHA errors
        expect(navigatePage1).toHaveBeenCalledTimes(1);

        // Discord warning sent for unexpected error
        expect(sendDiscordWarning).toHaveBeenCalledTimes(1);
        expect(sendDiscordWarning).toHaveBeenCalledWith(
            'https://discord.com/api/webhooks/test',
            'GPS Automation Error',
            expect.stringContaining('Network timeout')
        );
    });

    test('respects delay between retries (mocked timer)', async () => {
        jest.useFakeTimers();
        navigatePage1.mockRejectedValue(new CaptchaFailedError('CAPTCHA failed'));

        const promise = runWithRetry(1, 5); // 5 minute delay

        // Advance timers until all pending timers have been flushed
        for (let i = 0; i < 10; i++) {
            jest.advanceTimersByTime(5 * 60 * 1000);
            await Promise.resolve(); // flush microtask queue
        }

        await promise;

        expect(navigatePage1).toHaveBeenCalledTimes(2);
        jest.useRealTimers();
    });

    test('retries immediately when delay is 0', async () => {
        navigatePage1
            .mockRejectedValueOnce(new CaptchaFailedError('CAPTCHA failed'))
            .mockResolvedValueOnce(undefined);

        const start = Date.now();
        await runWithRetry(1, 0);
        const elapsed = Date.now() - start;

        expect(elapsed).toBeLessThan(1000); // Should be nearly instant
        expect(navigatePage1).toHaveBeenCalledTimes(2);
    });
});

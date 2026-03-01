// Mock dotenv BEFORE requiring config, so it doesn't load the real .env file
jest.mock('dotenv', () => ({
    config: jest.fn(),
}));

describe('config', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.resetModules();
        // Re-mock dotenv on each module reset
        jest.mock('dotenv', () => ({ config: jest.fn() }));

        process.env = {
            // Only set what we need — no real .env leaking in
            PIS: '123.45678.90-1',
            WIT_AI_TOKEN: 'test-wit-token',
            CAPSOLVER_API_KEY: 'test-capsolver-key',
        };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    function loadConfig() {
        return require('../src/config');
    }

    test('exports the correct RFB URL', () => {
        const config = loadConfig();
        expect(config.url).toBe('https://sal.rfb.gov.br/calculo-contribuicao/contribuintes-2');
    });

    test('reads PIS from process.env.PIS', () => {
        process.env.PIS = '999.88877.66-5';
        const config = loadConfig();
        expect(config.pis).toBe('999.88877.66-5');
    });

    test('reads capsolverKey from process.env.CAPSOLVER_API_KEY', () => {
        process.env.CAPSOLVER_API_KEY = 'my-key-123';
        const config = loadConfig();
        expect(config.capsolverKey).toBe('my-key-123');
    });

    test('debug is true only when DEBUG env is exactly "true"', () => {
        process.env.DEBUG = 'true';
        const config = loadConfig();
        expect(config.debug).toBe(true);
    });

    test('debug is false for other values like "1", "yes", undefined', () => {
        const testCases = ['1', 'yes', 'false', undefined];
        for (const val of testCases) {
            jest.resetModules();
            jest.mock('dotenv', () => ({ config: jest.fn() }));
            process.env = { PIS: '123', WIT_AI_TOKEN: 'x', CAPSOLVER_API_KEY: 'x' };
            if (val !== undefined) {
                process.env.DEBUG = val;
            }
            const config = require('../src/config');
            expect(config.debug).toBe(false);
        }
    });

    test('capsolverMaxRetries defaults to 5 when env is unset', () => {
        const config = loadConfig();
        expect(config.capsolverMaxRetries).toBe(5);
    });

    test('capsolverMaxRetries parses custom value from env', () => {
        process.env.CAPSOLVER_MAX_RETRIES = '10';
        const config = loadConfig();
        expect(config.capsolverMaxRetries).toBe(10);
    });

    // ─── New config fields ──────────────────────────────────────────

    test('savePdf defaults to false when env is unset', () => {
        const config = loadConfig();
        expect(config.savePdf).toBe(false);
    });

    test('savePdf parses "true" correctly', () => {
        process.env.SAVE_PDF = 'true';
        const config = loadConfig();
        expect(config.savePdf).toBe(true);
    });

    test('saveJson defaults to false when env is unset', () => {
        const config = loadConfig();
        expect(config.saveJson).toBe(false);
    });

    test('saveJson parses "true" correctly', () => {
        process.env.SAVE_JSON = 'true';
        const config = loadConfig();
        expect(config.saveJson).toBe(true);
    });


    test('captchaRetryAttempts defaults to 2 when env is unset', () => {
        const config = loadConfig();
        expect(config.captchaRetryAttempts).toBe(2);
    });

    test('captchaRetryAttempts parses custom value from env', () => {
        process.env.CAPTCHA_RETRY_ATTEMPTS = '4';
        const config = loadConfig();
        expect(config.captchaRetryAttempts).toBe(4);
    });

    test('processRetryAttempts defaults to 2 when env is unset', () => {
        const config = loadConfig();
        expect(config.processRetryAttempts).toBe(2);
    });

    test('processRetryAttempts parses custom value from env', () => {
        process.env.PROCESS_RETRY_ATTEMPTS = '3';
        const config = loadConfig();
        expect(config.processRetryAttempts).toBe(3);
    });

    test('processRetryDelayMinutes defaults to 5 when env is unset', () => {
        const config = loadConfig();
        expect(config.processRetryDelayMinutes).toBe(5);
    });

    test('processRetryDelayMinutes parses custom value from env', () => {
        process.env.PROCESS_RETRY_DELAY_MINUTES = '10';
        const config = loadConfig();
        expect(config.processRetryDelayMinutes).toBe(10);
    });

    test('cronSchedule reads from CRON_SCHEDULE env', () => {
        process.env.CRON_SCHEDULE = '0 8 16 * *';
        const config = loadConfig();
        expect(config.cronSchedule).toBe('0 8 16 * *');
    });

    test('cronSchedule defaults to empty string when env is unset', () => {
        const config = loadConfig();
        expect(config.cronSchedule).toBe('');
    });

    // ─── API key validation ─────────────────────────────────────────

    test('calls process.exit(1) when PIS is missing', () => {
        const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('process.exit called');
        });

        delete process.env.PIS;
        expect(() => loadConfig()).toThrow('process.exit called');
        expect(mockExit).toHaveBeenCalledWith(1);

        mockExit.mockRestore();
    });

    test('calls process.exit(1) when CAPSOLVER_API_KEY is missing', () => {
        const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('process.exit called');
        });

        delete process.env.CAPSOLVER_API_KEY;
        expect(() => loadConfig()).toThrow('process.exit called');
        expect(mockExit).toHaveBeenCalledWith(1);

        mockExit.mockRestore();
    });

    test('logs a warning (not exit) when WIT_AI_TOKEN is missing', () => {
        const mockWarn = jest.spyOn(console, 'warn').mockImplementation(() => { });
        const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('process.exit called');
        });

        delete process.env.WIT_AI_TOKEN;
        // Should NOT throw or call process.exit
        expect(() => loadConfig()).not.toThrow();

        mockWarn.mockRestore();
        mockExit.mockRestore();
    });
});

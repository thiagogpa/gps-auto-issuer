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

    test('calls process.exit(1) when PIS is missing', () => {
        const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('process.exit called');
        });

        delete process.env.PIS;
        expect(() => loadConfig()).toThrow('process.exit called');
        expect(mockExit).toHaveBeenCalledWith(1);

        mockExit.mockRestore();
    });

    test('logs a warning when WIT_AI_TOKEN and CAPSOLVER_API_KEY are missing', () => {
        const mockWarn = jest.spyOn(console, 'warn').mockImplementation(() => { });

        delete process.env.WIT_AI_TOKEN;
        delete process.env.CAPSOLVER_API_KEY;
        loadConfig();

        expect(mockWarn).toHaveBeenCalledWith(
            expect.stringContaining('WIT_AI_TOKEN or CAPSOLVER_API_KEY is missing')
        );

        mockWarn.mockRestore();
    });
});

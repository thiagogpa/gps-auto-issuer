describe('logger', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
        delete process.env.LOG_LEVEL;
        delete process.env.LOG_FILE;
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    test('exports a winston logger instance', () => {
        const logger = require('../src/logger');
        expect(logger).toBeDefined();
        expect(typeof logger.info).toBe('function');
        expect(typeof logger.error).toBe('function');
        expect(typeof logger.warn).toBe('function');
        expect(typeof logger.debug).toBe('function');
    });

    test('defaults to "info" log level', () => {
        const logger = require('../src/logger');
        expect(logger.level).toBe('info');
    });

    test('respects LOG_LEVEL env var', () => {
        process.env.LOG_LEVEL = 'debug';
        const logger = require('../src/logger');
        expect(logger.level).toBe('debug');
    });

    test('has at least one transport (console)', () => {
        const logger = require('../src/logger');
        expect(logger.transports.length).toBeGreaterThanOrEqual(1);
    });

    test('adds file transport when LOG_FILE=true', () => {
        process.env.LOG_FILE = 'true';
        const logger = require('../src/logger');
        // Should have console + file = at least 2 transports
        expect(logger.transports.length).toBeGreaterThanOrEqual(2);
    });

    test('does not add file transport when LOG_FILE is not true', () => {
        process.env.LOG_FILE = 'false';
        const logger = require('../src/logger');
        expect(logger.transports.length).toBe(1);
    });
});

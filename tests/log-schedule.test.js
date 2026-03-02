const cronParser = require('cron-parser');

jest.mock('../src/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));

jest.mock('../src/config', () => ({
    cronSchedule: '0 8 16 * *' // Default target cron
}));

describe('log-schedule.js execution dates', () => {
    let logger;
    let config;

    beforeEach(() => {
        jest.resetModules();
        logger = require('../src/logger');
        config = require('../src/config');
    });

    test('should log next execution when valid cron is provided', () => {
        // Mock to a fixed date to have deterministic string output if needed, or simply regex test the localized date.
        // Easiest is to regex string
        require('../src/log-schedule.js');

        expect(logger.info).toHaveBeenCalled();
        const infoMessage = logger.info.mock.calls[0][0];

        // Should contain strings like "GPS Scheduler started. Next execution scheduled for: 2026-03-16 08:00:00"
        expect(infoMessage).toMatch(/GPS Scheduler started\. Next execution scheduled for: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    });

    test('should log warning when CRON_SCHEDULE is undefined', () => {
        config.cronSchedule = undefined;

        require('../src/log-schedule.js');

        expect(logger.warn).toHaveBeenCalledWith('No CRON_SCHEDULE provided. Scheduler will not execute tasks.');
    });

    test('should log error when CRON_SCHEDULE is malformed', () => {
        config.cronSchedule = 'INVALID_CRON';

        require('../src/log-schedule.js');

        expect(logger.error).toHaveBeenCalledWith('Invalid CRON_SCHEDULE string: INVALID_CRON');
    });
});

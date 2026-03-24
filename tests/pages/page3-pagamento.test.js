jest.mock('date-holidays', () => {
    const HOLIDAYS = new Set([
        '2026-04-21', // Tiradentes
        '2026-05-01', // Labor Day (Friday)
    ]);

    return jest.fn().mockImplementation(() => ({
        isHoliday: (date) => {
            const iso = date.toISOString().slice(0, 10);
            return HOLIDAYS.has(iso) ? [{ name: 'Holiday' }] : false;
        },
    }));
});

const { isBusinessDay, getNextBusinessDay } = require('../../src/business-days');

// ─── BCB minimum wage API failure handling ───────────────────────────

describe('page3 BCB minimum wage API fallback', () => {
    let navigatePage3;
    let axios;
    let mockLogger;

    beforeEach(() => {
        jest.resetModules();

        jest.mock('axios');
        jest.mock('../../src/logger', () => ({
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        }));
        jest.mock('../../src/helpers', () => ({
            delay: jest.fn().mockResolvedValue(),
            focusInputByLabel: jest.fn().mockResolvedValue(),
            clickBrButton: jest.fn().mockResolvedValue(true),
            saveDebug: jest.fn().mockResolvedValue(),
        }));

        axios = require('axios');
        mockLogger = require('../../src/logger');
        navigatePage3 = require('../../src/pages/page3-pagamento');
    });

    const makeMockPage = () => ({
        waitForFunction: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue(),
        keyboard: { type: jest.fn().mockResolvedValue(), press: jest.fn().mockResolvedValue() },
    });

    const mockConfig = {
        minWageApiUrl: 'https://api.bcb.gov.br/test',
        codigoPagamento: '1473',
        debug: false,
        dryRun: false,
    };

    test('uses the API value when BCB call succeeds', async () => {
        axios.get.mockResolvedValue({ data: [{ valor: '1518.00' }] });
        const page = makeMockPage();

        await navigatePage3(page, mockConfig);

        expect(axios.get).toHaveBeenCalledTimes(1);
        expect(mockLogger.warn).not.toHaveBeenCalledWith(expect.stringContaining('fallback'));
    });

    test('retries once on first API failure and succeeds on retry', async () => {
        axios.get
            .mockRejectedValueOnce(new Error('Network timeout'))
            .mockResolvedValueOnce({ data: [{ valor: '1518.00' }] });
        const page = makeMockPage();

        await navigatePage3(page, mockConfig);

        expect(axios.get).toHaveBeenCalledTimes(2);
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Retrying once'));
    });

    test('uses fallback value when both API attempts fail', async () => {
        axios.get.mockRejectedValue(new Error('Service unavailable'));
        const page = makeMockPage();

        await navigatePage3(page, mockConfig);

        expect(axios.get).toHaveBeenCalledTimes(2);
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('fallback minimum wage: 1518'));
    });

    test('uses fallback when API returns malformed data', async () => {
        axios.get.mockResolvedValue({ data: [] }); // empty array → data[0] is undefined
        const page = makeMockPage();

        // parseFloat(undefined) = NaN — should still proceed with fallback
        await navigatePage3(page, mockConfig);
        // Verify it didn't throw
        expect(page.keyboard.type).toHaveBeenCalled();
    });
});

// ─── Date calculation ────────────────────────────────────────────────

describe('page3-pagamento date calculation', () => {
    const calculatePaymentDate = (baseDate) => {
        const paymentDate = new Date(baseDate.getTime());

        if (!isBusinessDay(paymentDate)) {
            paymentDate.setTime(getNextBusinessDay(paymentDate).getTime());
        }

        return `${paymentDate.getFullYear()}-${String(paymentDate.getMonth() + 1).padStart(2, '0')}-${String(paymentDate.getDate()).padStart(2, '0')}`;
    };

    test('weekday (Wednesday) returns the same date', () => {
        const wednesday = new Date('2026-02-25'); // Feb 25, 2026
        expect(calculatePaymentDate(wednesday)).toBe('2026-02-25');
    });

    test('Saturday shifts to next Monday', () => {
        const saturday = new Date('2026-02-14'); // Feb 14, 2026
        expect(calculatePaymentDate(saturday)).toBe('2026-02-16'); // Monday, Feb 16
    });

    test('Sunday shifts to next Monday', () => {
        const sunday = new Date('2026-02-15'); // Feb 15, 2026
        expect(calculatePaymentDate(sunday)).toBe('2026-02-16'); // Monday, Feb 16
    });

    test('Tiradentes holiday (Tuesday Apr 21) shifts to next Wednesday', () => {
        const tiradentes = new Date('2026-04-21'); // Tuesday, national holiday
        expect(calculatePaymentDate(tiradentes)).toBe('2026-04-22'); // Wednesday
    });

    test('Labor Day holiday (Friday May 1) shifts to next Monday', () => {
        const laborDay = new Date('2026-05-01'); // Friday, national holiday
        expect(calculatePaymentDate(laborDay)).toBe('2026-05-04'); // Monday
    });

    test('end-of-month Saturday advances to Monday in next month', () => {
        const endOfMonthSaturday = new Date('2026-01-31'); // Saturday, Jan 31
        expect(calculatePaymentDate(endOfMonthSaturday)).toBe('2026-02-02'); // Monday, Feb 2
    });
});

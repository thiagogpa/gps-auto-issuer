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

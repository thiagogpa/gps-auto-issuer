jest.mock('date-holidays', () => {
    const HOLIDAYS = new Set([
        '2026-01-01', // New Year
        '2026-01-25', // São Paulo birthday
        '2026-04-21', // Tiradentes
        '2026-05-01', // Labor Day
        '2026-11-20', // Consciência Negra (SP)
        '2026-12-25', // Christmas
    ]);

    return jest.fn().mockImplementation(() => ({
        isHoliday: (date) => {
            const iso = date.toISOString().slice(0, 10);
            return HOLIDAYS.has(iso) ? [{ name: 'Holiday' }] : false;
        },
    }));
});

const { isBusinessDay, getNextBusinessDay } = require('../src/business-days');

describe('isBusinessDay', () => {
    test('regular Wednesday is a business day', () => {
        expect(isBusinessDay(new Date('2026-05-20'))).toBe(true); // Wednesday
    });

    test('Saturday is not a business day', () => {
        expect(isBusinessDay(new Date('2026-05-16'))).toBe(false);
    });

    test('Sunday is not a business day', () => {
        expect(isBusinessDay(new Date('2026-05-17'))).toBe(false);
    });

    test('Tiradentes (April 21) is not a business day', () => {
        expect(isBusinessDay(new Date('2026-04-21'))).toBe(false);
    });

    test('São Paulo birthday (January 25) is not a business day', () => {
        expect(isBusinessDay(new Date('2026-01-25'))).toBe(false); // Sunday in 2026, but also a holiday
    });

    test('Consciência Negra SP (November 20) is not a business day', () => {
        expect(isBusinessDay(new Date('2026-11-20'))).toBe(false);
    });

    test('Christmas (December 25) is not a business day', () => {
        expect(isBusinessDay(new Date('2026-12-25'))).toBe(false);
    });
});

describe('getNextBusinessDay', () => {
    test('from Friday returns next Monday', () => {
        const friday = new Date('2026-05-15'); // Friday
        const result = getNextBusinessDay(friday);
        expect(result.toISOString().slice(0, 10)).toBe('2026-05-18'); // Monday
    });

    test('from Saturday returns Monday', () => {
        const saturday = new Date('2026-05-16');
        const result = getNextBusinessDay(saturday);
        expect(result.toISOString().slice(0, 10)).toBe('2026-05-18'); // Monday
    });

    test('from Sunday returns Monday', () => {
        const sunday = new Date('2026-05-17');
        const result = getNextBusinessDay(sunday);
        expect(result.toISOString().slice(0, 10)).toBe('2026-05-18'); // Monday
    });

    test('from Wednesday returns Thursday', () => {
        const wednesday = new Date('2026-05-20');
        const result = getNextBusinessDay(wednesday);
        expect(result.toISOString().slice(0, 10)).toBe('2026-05-21'); // Thursday
    });

    test('skips a holiday: from April 20 (Mon before Tiradentes) returns April 22', () => {
        // April 21 is Tiradentes (holiday), so next business day after April 20 is April 22
        const monday = new Date('2026-04-20');
        const result = getNextBusinessDay(monday);
        expect(result.toISOString().slice(0, 10)).toBe('2026-04-22'); // Wednesday
    });

    test('never returns the same day as input', () => {
        const wednesday = new Date('2026-05-20');
        const result = getNextBusinessDay(wednesday);
        expect(result.toISOString().slice(0, 10)).not.toBe('2026-05-20');
    });
});

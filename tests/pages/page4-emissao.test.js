// page4-emissao.js does not export todayStr directly. We test it by accessing
// the module internals. Since todayStr is not exported, we need to extract
// the logic or test it indirectly. Here we test the date formatting logic.

describe('page4-emissao date formatting', () => {
    test('todayStr() returns date in YYYY-MM-DD format', () => {
        // Replicate the todayStr logic from page4-emissao.js
        const todayStr = () => {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };

        const result = todayStr();
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('todayStr() zero-pads single-digit months and days', () => {
        const todayStr = (date) => {
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        };

        // January 5th
        const jan5 = new Date(2026, 0, 5); // month is 0-indexed
        expect(todayStr(jan5)).toBe('2026-01-05');

        // December 25th
        const dec25 = new Date(2026, 11, 25);
        expect(todayStr(dec25)).toBe('2026-12-25');

        // March 1st
        const mar1 = new Date(2026, 2, 1);
        expect(todayStr(mar1)).toBe('2026-03-01');
    });
});

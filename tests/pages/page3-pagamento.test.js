describe('page3-pagamento date calculation', () => {
    // Replicate the payment date logic from page3-pagamento.js
    const calculatePaymentDate = (baseDate) => {
        const paymentDate = new Date(baseDate.getTime());
        const originalMonth = paymentDate.getMonth();

        if (paymentDate.getDay() === 6) paymentDate.setDate(paymentDate.getDate() + 2); // Saturday -> Monday
        else if (paymentDate.getDay() === 0) paymentDate.setDate(paymentDate.getDate() + 1); // Sunday -> Monday

        // If pushing to Monday changed the month, fallback to Friday
        if (paymentDate.getMonth() !== originalMonth) {
            paymentDate.setTime(baseDate.getTime()); // reset
            if (paymentDate.getDay() === 6) paymentDate.setDate(paymentDate.getDate() - 1); // Friday
            else if (paymentDate.getDay() === 0) paymentDate.setDate(paymentDate.getDate() - 2); // Friday
        }

        return `${paymentDate.getFullYear()}-${String(paymentDate.getMonth() + 1).padStart(2, '0')}-${String(paymentDate.getDate()).padStart(2, '0')}`;
    };

    test('weekday (Wednesday) returns the same date', () => {
        const wednesday = new Date(2026, 1, 25); // Feb 25, 2026
        expect(calculatePaymentDate(wednesday)).toBe('2026-02-25');
    });

    test('standard Saturday shifts to next Monday within the same month', () => {
        const saturday = new Date(2026, 1, 14); // Feb 14, 2026
        expect(calculatePaymentDate(saturday)).toBe('2026-02-16'); // Monday, Feb 16
    });

    test('standard Sunday shifts to next Monday within the same month', () => {
        const sunday = new Date(2026, 1, 15); // Feb 15, 2026
        expect(calculatePaymentDate(sunday)).toBe('2026-02-16'); // Monday, Feb 16
    });

    test('end of month Saturday rolls back to Friday to prevent crossing month', () => {
        const endOfMonthSaturday = new Date(2026, 1, 28); // Feb 28, 2026 (Saturday)
        expect(calculatePaymentDate(endOfMonthSaturday)).toBe('2026-02-27'); // Friday, Feb 27
    });

    test('end of month Sunday rolls back to Friday to prevent crossing month', () => {
        const endOfMonthSunday = new Date(2026, 4, 31); // May 31, 2026 (Sunday)
        expect(calculatePaymentDate(endOfMonthSunday)).toBe('2026-05-29'); // Friday, May 29
    });
});

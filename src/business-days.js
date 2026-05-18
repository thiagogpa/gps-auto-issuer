const Holidays = require('date-holidays');

const hd = new Holidays('BR', 'SP');

/**
 * Returns true if the given date is a business day in São Paulo:
 * not a weekend and not a Brazilian national or SP state holiday.
 * @param {Date} date
 * @returns {boolean}
 */
function isBusinessDay(date) {
    const day = date.getDay();
    if (day === 0 || day === 6) return false;
    return !hd.isHoliday(date);
}

/**
 * Returns the first business day after the given date (never the same day).
 * @param {Date} date
 * @returns {Date}
 */
function getNextBusinessDay(date) {
    const next = new Date(date);
    do {
        next.setDate(next.getDate() + 1);
    } while (!isBusinessDay(next));
    return next;
}

module.exports = { isBusinessDay, getNextBusinessDay };

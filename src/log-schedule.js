const cronParser = require('cron-parser');
const config = require('./config');
const logger = require('./logger');

if (!config.cronSchedule) {
    logger.warn('No CRON_SCHEDULE provided. Scheduler will not execute tasks.');
} else {
    try {
        const nextDate = cronParser.CronExpressionParser.parse(config.cronSchedule).next().toDate();

        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        const formattedDate = formatter.format(nextDate).replace(',', '');

        logger.info(`GPS Scheduler started. Next execution scheduled for: ${formattedDate}`);
    } catch (err) {
        logger.error(`Invalid CRON_SCHEDULE string: ${config.cronSchedule}`);
    }
}

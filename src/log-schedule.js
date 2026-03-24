const cronParser = require('cron-parser');
const config = require('./config');
const logger = require('./logger');

const CRON_FORMAT = /^[0-9*/,\-]+ [0-9*/,\-]+ [0-9*/,\-]+ [0-9*/,\-]+ [0-9*/,\-]+$/;

if (!config.cronSchedule) {
    logger.warn('No CRON_SCHEDULE provided. Scheduler will not execute tasks.');
} else if (!CRON_FORMAT.test(config.cronSchedule)) {
    logger.error(`Invalid CRON_SCHEDULE format: "${config.cronSchedule}". Expected 5 fields (minute hour day month weekday).`);
} else {
    try {
        const nextDate = cronParser.CronExpressionParser.parse(config.cronSchedule, { tz: 'America/Sao_Paulo' }).next().toDate();

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

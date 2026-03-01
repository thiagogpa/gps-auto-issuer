const cronParser = require('cron-parser');
const config = require('./config');
const logger = require('./logger');

if (!config.cronSchedule) {
    logger.warn('No CRON_SCHEDULE provided. Scheduler will not execute tasks.');
} else {
    try {
        const nextDate = cronParser.CronExpressionParser.parse(config.cronSchedule).next().toDate();
        const formattedDate = nextDate.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        logger.info(`GPS Scheduler started. Next execution scheduled for: ${formattedDate}`);
    } catch (err) {
        logger.error(`Invalid CRON_SCHEDULE string: ${config.cronSchedule}`);
    }
}

const { createLogger, format, transports } = require('winston');

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_FILE = process.env.LOG_FILE === 'true';

const logger = createLogger({
    level: LOG_LEVEL,
    format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.errors({ stack: true }),
        format.printf(({ timestamp, level, message, stack }) => {
            const msg = stack || message;
            return `[${timestamp}] [${level.toUpperCase()}] ${msg}`;
        })
    ),
    transports: [
        new transports.Console({
            format: format.combine(
                format.colorize({ level: true }),
                format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                format.printf(({ timestamp, level, message, stack }) => {
                    const msg = stack || message;
                    return `[${timestamp}] ${level}: ${msg}`;
                })
            )
        })
    ]
});

if (LOG_FILE) {
    const path = require('path');
    const fs = require('fs');
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }
    logger.add(new transports.File({
        filename: path.join(logsDir, 'gps.log'),
        maxsize: 5 * 1024 * 1024, // 5MB
        maxFiles: 3,
    }));
}

module.exports = logger;

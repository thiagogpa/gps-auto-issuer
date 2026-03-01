require('dotenv').config();
const logger = require('./logger');

const config = {
    // Target URL
    url: 'https://sal.rfb.gov.br/calculo-contribuicao/contribuintes-2',

    // User-provided PIS number
    pis: process.env.PIS,

    // Category radio button ID
    categoria: 'categoria_op_FACULTATIVO',

    // Payment code to select
    codigoPagamento: '1473',

    // API for fetching current minimum wage
    minWageApiUrl: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.1619/dados/ultimos/1?formato=json',

    // CAPTCHA keys
    witAiToken: process.env.WIT_AI_TOKEN,
    capsolverKey: process.env.CAPSOLVER_API_KEY,

    // Debug mode — saves screenshots and HTML dumps when true
    debug: process.env.DEBUG === 'true',

    // File saving toggles
    savePdf: process.env.SAVE_PDF === 'true',
    saveJson: process.env.SAVE_JSON === 'true',

    // Discord webhook for notifications
    discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,

    // CapSolver retry config
    capsolverMaxRetries: parseInt(process.env.CAPSOLVER_MAX_RETRIES, 10) || 5,
    capsolverPollLimit: 40,

    // Cron schedule (e.g. "0 8 16 * *" = 8:00 AM on the 16th monthly)
    cronSchedule: process.env.CRON_SCHEDULE || '',

    // CAPTCHA-level retry (immediate, no delay between retries)
    captchaRetryAttempts: parseInt(process.env.CAPTCHA_RETRY_ATTEMPTS, 10) || 2,

    // Process-level retry (full end-to-end retry when CAPTCHA fails entirely)
    processRetryAttempts: parseInt(process.env.PROCESS_RETRY_ATTEMPTS, 10) || 2,
    processRetryDelayMinutes: parseInt(process.env.PROCESS_RETRY_DELAY_MINUTES, 10) || 5,
};

// Validate required config
if (!config.pis) {
    logger.error('PIS is required. Set it in the .env file.');
    process.exit(1);
}

// WIT_AI_TOKEN is optional — audio CAPTCHA tier will be skipped if not provided
if (!config.witAiToken) {
    logger.warn('WIT_AI_TOKEN not provided. Audio CAPTCHA tier (Tier 2) will be skipped.');
}

// CAPSOLVER_API_KEY is required
if (!config.capsolverKey) {
    logger.error('CAPSOLVER_API_KEY is required. Set it in the .env file.');
    // Discord warning is sent from index.js before exit since config should not
    // have a circular dependency on discord.js
    process.exit(1);
}

module.exports = config;

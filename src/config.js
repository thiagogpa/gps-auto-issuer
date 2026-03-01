require('dotenv').config();

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

    // Discord webhook for notifications
    discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,

    // CapSolver retry config
    capsolverMaxRetries: parseInt(process.env.CAPSOLVER_MAX_RETRIES, 10) || 5,
    capsolverPollLimit: 40,
};

// Validate required config
if (!config.pis) {
    console.error('ERROR: PIS is required. Set it in the .env file.');
    process.exit(1);
}

if (!config.witAiToken || !config.capsolverKey) {
    console.warn('WARNING: WIT_AI_TOKEN or CAPSOLVER_API_KEY is missing. Waterfall might fail at later tiers.');
}

module.exports = config;

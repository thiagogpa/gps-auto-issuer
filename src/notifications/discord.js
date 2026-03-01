const axios = require('axios');

/**
 * Send a boleto summary to a Discord channel via webhook.
 *
 * @param {string} webhookUrl - Discord webhook URL
 * @param {object} summary - Boleto summary data from Page 5
 */
async function sendDiscordNotification(webhookUrl, summary) {
    if (!webhookUrl) {
        console.log('DISCORD_WEBHOOK_URL not set. Skipping Discord notification.');
        return;
    }

    const embed = {
        title: '📄 GPS Emitida com Sucesso',
        color: 0x2ecc71, // green
        fields: [
            { name: 'NIS/PIS/PASEP', value: summary.nis || '—', inline: true },
            { name: 'Nome', value: summary.nome || '—', inline: false },
            { name: 'Data de Cálculo', value: summary.data_calculo || '—', inline: true },
            { name: 'Data de Vencimento', value: summary.data_vencimento || '—', inline: true },
            { name: 'Total', value: summary.total || '—', inline: true },
            { name: 'Código de Barras', value: `\`${summary.barcode || '—'}\``, inline: false },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'GPS Automation' }
    };

    try {
        await axios.post(webhookUrl, {
            embeds: [embed]
        });
        console.log('Discord notification sent successfully!');
    } catch (err) {
        console.error('Failed to send Discord notification:', err.message);
    }
}

/**
 * Send a warning/error message to a Discord channel via webhook.
 *
 * @param {string} webhookUrl - Discord webhook URL
 * @param {string} title - Warning title
 * @param {string} description - Warning description/details
 */
async function sendDiscordWarning(webhookUrl, title, description) {
    if (!webhookUrl) {
        console.log('DISCORD_WEBHOOK_URL not set. Skipping Discord warning.');
        return;
    }

    const embed = {
        title: `⚠️ ${title}`,
        description: description,
        color: 0xe74c3c, // red
        timestamp: new Date().toISOString(),
        footer: { text: 'GPS Automation' }
    };

    try {
        await axios.post(webhookUrl, {
            embeds: [embed]
        });
        console.log('Discord warning sent successfully!');
    } catch (err) {
        console.error('Failed to send Discord warning:', err.message);
    }
}

module.exports = { sendDiscordNotification, sendDiscordWarning };

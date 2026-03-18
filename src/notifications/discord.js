const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

/**
 * Send a boleto summary to a Discord channel via webhook.
 *
 * @param {string} webhookUrl - Discord webhook URL
 * @param {object} summary - Boleto summary data from Page 5
 */
async function sendDiscordNotification(webhookUrl, summary, pdfPath = null) {
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
        if (pdfPath && fs.existsSync(pdfPath)) {
            const formData = new FormData();
            formData.append('payload_json', JSON.stringify({ embeds: [embed] }));
            formData.append('file', fs.createReadStream(pdfPath));

            await axios.post(webhookUrl, formData, {
                headers: { ...formData.getHeaders() }
            });
        } else {
            await axios.post(webhookUrl, {
                embeds: [embed]
            });
        }
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

/**
 * Send a startup notification to a Discord channel via webhook.
 *
 * @param {string} webhookUrl - Discord webhook URL
 * @param {string} [nextRunStr] - Human-readable next scheduled run time, or falsy if unscheduled
 */
async function sendDiscordStartup(webhookUrl, nextRunStr) {
    if (!webhookUrl) {
        console.log('DISCORD_WEBHOOK_URL not set. Skipping Discord startup notification.');
        return;
    }

    const nowStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).format(new Date()).replace(',', '');

    const embed = {
        title: '🚀 GPS Automation Started',
        color: 0x3498db, // blue
        fields: [
            { name: 'Started At', value: nowStr, inline: true },
            { name: 'Next Scheduled Run', value: nextRunStr || '—', inline: true },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'GPS Automation' }
    };

    try {
        await axios.post(webhookUrl, { embeds: [embed] });
        console.log('Discord startup notification sent successfully!');
    } catch (err) {
        console.error('Failed to send Discord startup notification:', err.message);
    }
}

module.exports = { sendDiscordNotification, sendDiscordWarning, sendDiscordStartup };

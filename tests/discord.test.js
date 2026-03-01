jest.mock('axios');
jest.mock('fs');
jest.mock('form-data');

const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const { sendDiscordNotification, sendDiscordWarning } = require('../src/notifications/discord');

const fullSummary = {
    nis: '123.45678.90-1',
    nome: 'THIAGO SILVA',
    data_calculo: '28/02/2026',
    data_vencimento: '15/03/2026',
    total: 'R$ 264,40',
    barcode: '85820000002-6 64400286025-0 02600000000-0 00000000000-4',
};

// ─── sendDiscordNotification() ──────────────────────────────────────

describe('sendDiscordNotification()', () => {
    beforeEach(() => {
        axios.post.mockReset();
    });

    test('sends POST to webhookUrl with correct embed structure', async () => {
        axios.post.mockResolvedValue({ status: 204 });

        await sendDiscordNotification('https://discord.com/api/webhooks/test', fullSummary);

        expect(axios.post).toHaveBeenCalledTimes(1);
        const [url, body] = axios.post.mock.calls[0];
        expect(url).toBe('https://discord.com/api/webhooks/test');
        expect(body.embeds).toHaveLength(1);
        expect(body.embeds[0].title).toContain('GPS Emitida');
    });

    test('embed contains all expected fields', async () => {
        axios.post.mockResolvedValue({ status: 204 });

        await sendDiscordNotification('https://discord.com/api/webhooks/test', fullSummary);

        const embed = axios.post.mock.calls[0][1].embeds[0];
        const fieldNames = embed.fields.map(f => f.name);

        expect(fieldNames).toContain('NIS/PIS/PASEP');
        expect(fieldNames).toContain('Nome');
        expect(fieldNames).toContain('Data de Cálculo');
        expect(fieldNames).toContain('Data de Vencimento');
        expect(fieldNames).toContain('Total');
        expect(fieldNames).toContain('Código de Barras');
    });

    test('handles null summary fields gracefully (shows "—")', async () => {
        axios.post.mockResolvedValue({ status: 204 });
        const emptySummary = { nis: null, nome: null, data_calculo: null, data_vencimento: null, total: null, barcode: null };

        await sendDiscordNotification('https://discord.com/api/webhooks/test', emptySummary);

        const embed = axios.post.mock.calls[0][1].embeds[0];
        const values = embed.fields.map(f => f.value);
        // All fields should show '—' or contain '—'
        values.forEach(v => {
            expect(v).toContain('—');
        });
    });

    test('attaches PDF as FormData when pdfPath is provided and file exists', async () => {
        axios.post.mockResolvedValue({ status: 204 });
        fs.existsSync.mockReturnValue(true);
        fs.createReadStream.mockReturnValue('mocked-stream');

        const mockFormDataInstance = {
            append: jest.fn(),
            getHeaders: jest.fn().mockReturnValue({ 'content-type': 'multipart/form-data' })
        };
        FormData.mockImplementation(() => mockFormDataInstance);

        await sendDiscordNotification('https://discord.com/api/webhooks/test', fullSummary, 'output/dummy.pdf');

        expect(fs.existsSync).toHaveBeenCalledWith('output/dummy.pdf');
        expect(fs.createReadStream).toHaveBeenCalledWith('output/dummy.pdf');

        expect(mockFormDataInstance.append).toHaveBeenCalledWith('payload_json', expect.any(String));
        expect(mockFormDataInstance.append).toHaveBeenCalledWith('file', 'mocked-stream');

        expect(axios.post).toHaveBeenCalledWith(
            'https://discord.com/api/webhooks/test',
            mockFormDataInstance,
            { headers: { 'content-type': 'multipart/form-data' } }
        );
    });

    test('falls back to JSON embed if pdfPath is provided but file does not exist', async () => {
        axios.post.mockResolvedValue({ status: 204 });
        fs.existsSync.mockReturnValue(false);

        await sendDiscordNotification('https://discord.com/api/webhooks/test', fullSummary, 'output/missing.pdf');

        expect(axios.post).toHaveBeenCalledTimes(1);
        const [url, body] = axios.post.mock.calls[0];
        expect(url).toBe('https://discord.com/api/webhooks/test');
        expect(body.embeds).toHaveLength(1); // Sent cleanly as JSON instead of FormData
    });

    test('skips sending when webhookUrl is falsy', async () => {
        await sendDiscordNotification(undefined, fullSummary);
        await sendDiscordNotification(null, fullSummary);
        await sendDiscordNotification('', fullSummary);

        expect(axios.post).not.toHaveBeenCalled();
    });

    test('logs error but does not throw when Axios fails', async () => {
        const mockError = jest.spyOn(console, 'error').mockImplementation(() => { });
        axios.post.mockRejectedValue(new Error('Network error'));

        await expect(
            sendDiscordNotification('https://discord.com/api/webhooks/test', fullSummary)
        ).resolves.toBeUndefined(); // should not throw

        expect(mockError).toHaveBeenCalledWith(
            expect.stringContaining('Failed to send Discord notification'),
            expect.any(String)
        );

        mockError.mockRestore();
    });
});

// ─── sendDiscordWarning() ───────────────────────────────────────────

describe('sendDiscordWarning()', () => {
    beforeEach(() => {
        axios.post.mockReset();
    });

    test('sends POST with red-colored warning embed', async () => {
        axios.post.mockResolvedValue({ status: 204 });

        await sendDiscordWarning(
            'https://discord.com/api/webhooks/test',
            'Test Warning',
            'Something went wrong'
        );

        expect(axios.post).toHaveBeenCalledTimes(1);
        const [url, body] = axios.post.mock.calls[0];
        expect(url).toBe('https://discord.com/api/webhooks/test');
        expect(body.embeds).toHaveLength(1);

        const embed = body.embeds[0];
        expect(embed.title).toContain('Test Warning');
        expect(embed.title).toContain('⚠️');
        expect(embed.description).toBe('Something went wrong');
        expect(embed.color).toBe(0xe74c3c); // red
    });

    test('includes timestamp and footer', async () => {
        axios.post.mockResolvedValue({ status: 204 });

        await sendDiscordWarning('https://discord.com/api/webhooks/test', 'Title', 'Desc');

        const embed = axios.post.mock.calls[0][1].embeds[0];
        expect(embed.timestamp).toBeDefined();
        expect(embed.footer.text).toBe('GPS Automation');
    });

    test('skips sending when webhookUrl is falsy', async () => {
        await sendDiscordWarning(undefined, 'Title', 'Desc');
        await sendDiscordWarning(null, 'Title', 'Desc');
        await sendDiscordWarning('', 'Title', 'Desc');

        expect(axios.post).not.toHaveBeenCalled();
    });

    test('logs error but does not throw when Axios fails', async () => {
        const mockError = jest.spyOn(console, 'error').mockImplementation(() => { });
        axios.post.mockRejectedValue(new Error('Network error'));

        await expect(
            sendDiscordWarning('https://discord.com/api/webhooks/test', 'Title', 'Desc')
        ).resolves.toBeUndefined();

        expect(mockError).toHaveBeenCalledWith(
            expect.stringContaining('Failed to send Discord warning'),
            expect.any(String)
        );

        mockError.mockRestore();
    });
});

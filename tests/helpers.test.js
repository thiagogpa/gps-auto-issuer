const { delay, clickBrButton, focusInputByLabel, extractSiteKey, saveDebug, cleanupDebugArtifacts } = require('../src/helpers');

// ─── delay() ────────────────────────────────────────────────────────

describe('delay()', () => {
    test('returns a promise that resolves', async () => {
        await expect(delay(0, 0)).resolves.toBeUndefined();
    });

    test('resolves within the expected time range', async () => {
        const start = Date.now();
        await delay(50, 100);
        const elapsed = Date.now() - start;
        expect(elapsed).toBeGreaterThanOrEqual(45); // small tolerance
        expect(elapsed).toBeLessThan(200);
    });

    test('fixed bounds (min === max) resolves in approximately that time', async () => {
        const start = Date.now();
        await delay(100, 100);
        const elapsed = Date.now() - start;
        expect(elapsed).toBeGreaterThanOrEqual(95);
        expect(elapsed).toBeLessThan(200);
    });
});

// ─── clickBrButton() ────────────────────────────────────────────────

describe('clickBrButton()', () => {
    const makePage = (evalReturn) => ({
        evaluate: jest.fn().mockResolvedValue(evalReturn),
    });

    test('returns true when matching button is found', async () => {
        const page = makePage(true);
        const result = await clickBrButton(page, 'Consultar');
        expect(result).toBe(true);
        expect(page.evaluate).toHaveBeenCalledTimes(1);
    });

    test('returns false when no button matches', async () => {
        const page = makePage(false);
        const result = await clickBrButton(page, 'NonExistent');
        expect(result).toBe(false);
    });

    test('passes primary option correctly', async () => {
        const page = makePage(true);
        await clickBrButton(page, 'Confirmar', { primary: true });

        const callArgs = page.evaluate.mock.calls[0][1];
        expect(callArgs.primary).toBe(true);
    });

    test('passes excludeModal option correctly', async () => {
        const page = makePage(true);
        await clickBrButton(page, 'Confirmar', { excludeModal: true });

        const callArgs = page.evaluate.mock.calls[0][1];
        expect(callArgs.excludeModal).toBe(true);
    });
});

// ─── focusInputByLabel() ────────────────────────────────────────────

describe('focusInputByLabel()', () => {
    test('calls page.evaluate with correct label text', async () => {
        const page = { evaluate: jest.fn().mockResolvedValue(undefined) };
        await focusInputByLabel(page, 'competência');

        expect(page.evaluate).toHaveBeenCalledTimes(1);
        const labelArg = page.evaluate.mock.calls[0][1];
        expect(labelArg).toBe('competência');
    });
});

// ─── extractSiteKey() ───────────────────────────────────────────────

describe('extractSiteKey()', () => {
    test('returns the site key from iframe src', async () => {
        const page = {
            waitForSelector: jest.fn().mockResolvedValue({}),
            $: jest.fn().mockResolvedValue({}),
            evaluate: jest.fn().mockResolvedValue('https://www.google.com/recaptcha/api2/anchor?ar=1&k=6LeSomeKey123&co=aHR0cHM6'),
        };

        const key = await extractSiteKey(page);
        expect(key).toBe('6LeSomeKey123');
    });

    test('returns null when no iframe is found (timeout)', async () => {
        const page = {
            waitForSelector: jest.fn().mockRejectedValue(new Error('Timeout')),
        };

        const key = await extractSiteKey(page);
        expect(key).toBeNull();
    });
});

// ─── saveDebug() ────────────────────────────────────────────────────

describe('saveDebug()', () => {
    test('saves screenshot when debug=true and type="screenshot"', async () => {
        const fs = require('fs');
        const path = require('path');
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        const page = {
            screenshot: jest.fn().mockResolvedValue(undefined),
        };
        const expectedPath = path.join(process.cwd(), 'output', 'test.png');
        await saveDebug(page, 'test.png', 'screenshot', true);
        expect(page.screenshot).toHaveBeenCalledWith({ path: expectedPath, fullPage: true });
        fs.existsSync.mockRestore();
    });

    test('saves HTML dump when debug=true and type="html"', async () => {
        const fs = require('fs');
        const path = require('path');
        jest.spyOn(fs, 'writeFileSync').mockImplementation(() => { });
        jest.spyOn(fs, 'existsSync').mockReturnValue(false);
        jest.spyOn(fs, 'mkdirSync').mockImplementation(() => { });
        const page = {
            content: jest.fn().mockResolvedValue('<html>test</html>'),
        };

        const expectedPath = path.join(process.cwd(), 'output', 'dump.html');
        await saveDebug(page, 'dump.html', 'html', true);

        expect(page.content).toHaveBeenCalled();
        expect(fs.writeFileSync).toHaveBeenCalledWith(expectedPath, '<html>test</html>');
        expect(fs.mkdirSync).toHaveBeenCalledWith(path.dirname(expectedPath), { recursive: true });

        fs.writeFileSync.mockRestore();
        fs.existsSync.mockRestore();
        fs.mkdirSync.mockRestore();
    });

    test('does nothing when debug=false', async () => {
        const page = {
            screenshot: jest.fn(),
            content: jest.fn(),
        };

        await saveDebug(page, 'test.png', 'screenshot', false);
        expect(page.screenshot).not.toHaveBeenCalled();

        await saveDebug(page, 'dump.html', 'html', false);
        expect(page.content).not.toHaveBeenCalled();
    });
});

// ─── cleanupDebugArtifacts() ─────────────────────────────────────────

describe('cleanupDebugArtifacts()', () => {
    const path = require('path');
    let fs;

    beforeEach(() => {
        fs = require('fs');
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'readdirSync');
        jest.spyOn(fs, 'statSync');
        jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    const OLD_MTIME = Date.now() - 10 * 24 * 60 * 60 * 1000; // 10 days ago
    const NEW_MTIME = Date.now() - 1 * 24 * 60 * 60 * 1000;  // 1 day ago

    test('deletes matching artifact older than maxDays', () => {
        fs.readdirSync.mockReturnValue(['page1_dump.html']);
        fs.statSync.mockReturnValue({ mtimeMs: OLD_MTIME });

        cleanupDebugArtifacts('/fake/output', 7);

        expect(fs.unlinkSync).toHaveBeenCalledWith(path.join('/fake/output', 'page1_dump.html'));
    });

    test('does NOT delete matching artifact newer than maxDays', () => {
        fs.readdirSync.mockReturnValue(['page1_dump.html']);
        fs.statSync.mockReturnValue({ mtimeMs: NEW_MTIME });

        cleanupDebugArtifacts('/fake/output', 7);

        expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    test('does NOT delete non-matching file regardless of age', () => {
        fs.readdirSync.mockReturnValue(['boleto_summary_2026-03-17.json']);
        fs.statSync.mockReturnValue({ mtimeMs: OLD_MTIME });

        cleanupDebugArtifacts('/fake/output', 7);

        expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    test('does not throw when output directory does not exist', () => {
        fs.existsSync.mockReturnValue(false);

        expect(() => cleanupDebugArtifacts('/fake/output', 7)).not.toThrow();
        expect(fs.unlinkSync).not.toHaveBeenCalled();
    });
});


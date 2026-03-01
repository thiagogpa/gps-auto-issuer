jest.mock('axios');
jest.mock('../src/helpers', () => ({
    delay: jest.fn().mockResolvedValue(undefined),
}));

const axios = require('axios');
const { solveCaptcha, requestCapsolverToken, injectCaptchaToken } = require('../src/captcha');

// Mock process.exit globally so it doesn't kill the Jest worker
const mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Error(`process.exit(${code})`);
});

afterAll(() => {
    mockExit.mockRestore();
});

// ─── Helper: build a mock Puppeteer page ────────────────────────────

function makeMockPage({ stealthSolves = false } = {}) {
    const checkboxFrame = {
        waitForSelector: jest.fn().mockResolvedValue({}),
        click: jest.fn().mockResolvedValue(undefined),
        waitForFunction: stealthSolves
            ? jest.fn().mockResolvedValue(undefined)
            : jest.fn().mockRejectedValue(new Error('Timeout')),
    };

    const primaryFrameEl = {
        contentFrame: jest.fn().mockResolvedValue(checkboxFrame),
    };

    return {
        $: jest.fn().mockResolvedValue(primaryFrameEl),
        waitForSelector: jest.fn().mockResolvedValue(null), // no challenge frame by default
        evaluate: jest.fn().mockResolvedValue(undefined),
    };
}

// ─── solveCaptcha() ─────────────────────────────────────────────────

describe('solveCaptcha()', () => {
    const baseConfig = {
        witAiToken: 'fake-wit-token',
        capsolverKey: 'fake-capsolver-key',
        capsolverMaxRetries: 1,
        capsolverPollLimit: 1,
    };

    beforeEach(() => {
        axios.get.mockReset();
        axios.post.mockReset();
        mockExit.mockClear();
    });

    test('returns true when Tier 1 (stealth) succeeds', async () => {
        const page = makeMockPage({ stealthSolves: true });
        const result = await solveCaptcha(page, baseConfig, 'site-key', 'https://example.com');
        expect(result).toBe(true);
    });

    test('skips Tier 2 when witAiToken is missing and proceeds to Tier 3', async () => {
        const page = makeMockPage({ stealthSolves: false });
        const configNoWit = { ...baseConfig, witAiToken: undefined };

        // Tier 3: successful CapSolver flow
        axios.post
            .mockResolvedValueOnce({ data: { errorId: 0, taskId: 'task-1' } })
            .mockResolvedValueOnce({ data: { status: 'ready', solution: { gRecaptchaResponse: 'token-abc' } } });

        const result = await solveCaptcha(page, configNoWit, 'site-key', 'https://example.com');
        expect(result).toBe(true);
        // Axios GET (Tier 2 audio download) should NOT have been called
        expect(axios.get).not.toHaveBeenCalled();
    });

    test('calls process.exit(1) when all tiers fail', async () => {
        const page = makeMockPage({ stealthSolves: false });
        const configNoWit = { ...baseConfig, witAiToken: undefined };

        // Tier 3 fails (CapSolver returns error)
        axios.post.mockResolvedValue({
            data: { errorId: 1, errorDescription: 'Invalid key' }
        });

        await expect(
            solveCaptcha(page, configNoWit, 'site-key', 'https://example.com')
        ).rejects.toThrow('process.exit(1)');

        expect(mockExit).toHaveBeenCalledWith(1);
    });

    test('falls through to manual fallback when no capsolverKey and stealth fails', async () => {
        const page = makeMockPage({ stealthSolves: false });
        const configNoKeys = { ...baseConfig, witAiToken: undefined, capsolverKey: undefined };

        const result = await solveCaptcha(page, configNoKeys, 'site-key', 'https://example.com');
        // Manual fallback sets solved = true after waiting
        expect(result).toBe(true);
    });
});

// ─── requestCapsolverToken() ────────────────────────────────────────

describe('requestCapsolverToken()', () => {
    const config = {
        capsolverKey: 'test-key',
        capsolverMaxRetries: 3,
        capsolverPollLimit: 2,
    };

    beforeEach(() => {
        axios.post.mockReset();
    });

    test('returns token on first attempt success', async () => {
        axios.post
            .mockResolvedValueOnce({ data: { errorId: 0, taskId: 'task-1' } })
            .mockResolvedValueOnce({ data: { status: 'ready', solution: { gRecaptchaResponse: 'my-token-xyz' } } });

        const token = await requestCapsolverToken(config, 'site-key', 'https://example.com');
        expect(token).toBe('my-token-xyz');
    });

    test('retries on failure up to maxRetries', async () => {
        // First attempt: task creation fails
        axios.post.mockRejectedValueOnce(new Error('Network error'));
        // Second attempt: success
        axios.post
            .mockResolvedValueOnce({ data: { errorId: 0, taskId: 'task-2' } })
            .mockResolvedValueOnce({ data: { status: 'ready', solution: { gRecaptchaResponse: 'retry-token' } } });

        const token = await requestCapsolverToken(config, 'site-key', 'https://example.com');
        expect(token).toBe('retry-token');
        // 1 failed + 2 successful = 3 calls
        expect(axios.post).toHaveBeenCalledTimes(3);
    });

    test('throws after exhausting all retries', async () => {
        axios.post.mockRejectedValue(new Error('Always fails'));

        await expect(
            requestCapsolverToken(config, 'site-key', 'https://example.com')
        ).rejects.toThrow('All 3 CapSolver attempts failed');
    });

    test('handles polling timeout when status never becomes ready', async () => {
        const shortConfig = { ...config, capsolverPollLimit: 2 };

        axios.post
            .mockResolvedValueOnce({ data: { errorId: 0, taskId: 'task-3' } })
            .mockResolvedValue({ data: { status: 'processing' } }); // never ready

        // It will timeout and retry, eventually exhausting all retries
        await expect(
            requestCapsolverToken(shortConfig, 'site-key', 'https://example.com')
        ).rejects.toThrow();
    });

    test('throws on task creation error from CapSolver', async () => {
        axios.post.mockResolvedValue({
            data: { errorId: 1, errorDescription: 'Invalid key' }
        });

        await expect(
            requestCapsolverToken(config, 'site-key', 'https://example.com')
        ).rejects.toThrow('All 3 CapSolver attempts failed');
    });
});

// ─── injectCaptchaToken() ───────────────────────────────────────────

describe('injectCaptchaToken()', () => {
    test('calls page.evaluate with the provided token', async () => {
        const page = { evaluate: jest.fn().mockResolvedValue(undefined) };
        await injectCaptchaToken(page, 'my-recaptcha-token');

        expect(page.evaluate).toHaveBeenCalledTimes(1);
        const tokenArg = page.evaluate.mock.calls[0][1];
        expect(tokenArg).toBe('my-recaptcha-token');
    });
});

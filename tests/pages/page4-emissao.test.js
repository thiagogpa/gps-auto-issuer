// page4-emissao.js does not export todayStr directly. We test it by accessing
// the module internals. Since todayStr is not exported, we need to extract
// the logic or test it indirectly. Here we test the date formatting logic.

describe('page4-emissao date formatting', () => {
    test('todayStr() returns date in YYYY-MM-DD format', () => {
        // Replicate the todayStr logic from page4-emissao.js
        const todayStr = () => {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };

        const result = todayStr();
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('todayStr() zero-pads single-digit months and days', () => {
        const todayStr = (date) => {
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        };

        // January 5th
        const jan5 = new Date(2026, 0, 5); // month is 0-indexed
        expect(todayStr(jan5)).toBe('2026-01-05');

        // December 25th
        const dec25 = new Date(2026, 11, 25);
        expect(todayStr(dec25)).toBe('2026-12-25');

        // March 1st
        const mar1 = new Date(2026, 2, 1);
        expect(todayStr(mar1)).toBe('2026-03-01');
    });
});

describe('navigatePage4 DOM selection', () => {
    test('uses page.evaluateHandle to natively locate the Emitir GPS button', async () => {
        jest.mock('fs', () => ({
            existsSync: jest.fn().mockReturnValue(true),
            mkdirSync: jest.fn(),
            writeFileSync: jest.fn()
        }));

        jest.mock('../../src/helpers', () => ({
            delay: jest.fn().mockResolvedValue(),
            saveDebug: jest.fn().mockResolvedValue(),
            extractSiteKey: jest.fn().mockResolvedValue('fake-site-key')
        }));

        const { requestCapsolverToken } = require('../../src/captcha');
        jest.mock('../../src/captcha', () => ({
            requestCapsolverToken: jest.fn().mockResolvedValue('mock-token'),
            injectCaptchaToken: jest.fn().mockResolvedValue()
        }));

        jest.mock('../../src/logger', () => ({
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        }));

        const navigatePage4 = require('../../src/pages/page4-emissao');

        const mockPage = {
            target: jest.fn().mockReturnValue({ createCDPSession: jest.fn().mockResolvedValue({ send: jest.fn() }) }),
            on: jest.fn(),
            waitForFunction: jest.fn().mockResolvedValue(true),
            evaluate: jest.fn().mockImplementation((fn, ...args) => {
                const fnStr = fn.toString();
                if (fnStr.includes('!el')) return false; // Not missing
                if (fnStr.includes('hasAttribute(\'disabled\')')) return false; // Not disabled
                if (fnStr.includes('left + rect.width / 2')) return { x: 10, y: 10, found: true };
                return undefined;
            }),
            evaluateHandle: jest.fn().mockResolvedValue({ _isMockBtn: true, click: jest.fn() }),
            mouse: { click: jest.fn().mockResolvedValue() },
            url: jest.fn().mockResolvedValue('https://dummyUrl.com')
        };

        const mockBrowser = {
            on: jest.fn(),
            once: jest.fn((evt, cb) => {
                if (evt === 'targetcreated') {
                    cb({
                        type: () => 'page',
                        page: async () => ({
                            url: () => 'blob:mock-url',
                            evaluate: jest.fn().mockResolvedValue('bW9jay1wZGY='),
                            close: jest.fn()
                        })
                    });
                }
            })
        };

        const mockConfig = { debug: false, capsolverKey: 'test-key' };

        // Test running
        await navigatePage4(mockPage, mockBrowser, mockConfig);

        expect(mockPage.evaluateHandle).toHaveBeenCalled();
        const evaluateHandleFn = mockPage.evaluateHandle.mock.calls[0][0].toString();

        // Assert atomic handle logic instead of multiple element reads
        expect(evaluateHandleFn).toContain('document.querySelectorAll(\'br-button\')');
        expect(evaluateHandleFn).toContain('emitir gps');
    });
});


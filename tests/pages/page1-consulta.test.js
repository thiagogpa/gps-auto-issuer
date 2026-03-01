const navigatePage1 = require('../../src/pages/page1-consulta');
const { delay, extractSiteKey } = require('../../src/helpers');
const { solveCaptcha } = require('../../src/captcha');

jest.mock('../../src/helpers', () => ({
    delay: jest.fn().mockResolvedValue(),
    extractSiteKey: jest.fn().mockResolvedValue('test-site-key')
}));

jest.mock('../../src/captcha', () => ({
    solveCaptcha: jest.fn().mockResolvedValue()
}));

jest.mock('../../src/logger', () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn()
}));

describe('navigatePage1', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('completes the Page 1 workflow with innerInput', async () => {
        const mockPage = {
            waitForSelector: jest.fn().mockResolvedValue(),
            click: jest.fn().mockResolvedValue(),
            evaluateHandle: jest.fn().mockResolvedValue({
                asElement: () => ({
                    click: jest.fn().mockResolvedValue()
                })
            }),
            keyboard: {
                press: jest.fn().mockResolvedValue(),
                type: jest.fn().mockResolvedValue()
            },
            evaluate: jest.fn().mockResolvedValue(),
            waitForFunction: jest.fn().mockResolvedValue()
        };

        const mockConfig = {
            categoria: '1',
            pis: '123.45678.90-1',
            url: 'http://test.com'
        };

        await navigatePage1(mockPage, {}, mockConfig);

        expect(mockPage.waitForSelector).toHaveBeenCalledWith('label[for="1"]');
        expect(mockPage.click).toHaveBeenCalledWith('label[for="1"]');
        expect(extractSiteKey).toHaveBeenCalledWith(mockPage);
        expect(solveCaptcha).toHaveBeenCalledWith(mockPage, mockConfig, 'test-site-key', 'http://test.com');
        expect(mockPage.keyboard.press).toHaveBeenCalled();
    });

    test('completes the Page 1 workflow with fallback wrapper click', async () => {
        const mockPage = {
            waitForSelector: jest.fn().mockResolvedValue(),
            click: jest.fn().mockResolvedValue(),
            evaluateHandle: jest.fn().mockResolvedValue({
                asElement: () => null
            }),
            $: jest.fn().mockResolvedValue({
                click: jest.fn().mockResolvedValue()
            }),
            keyboard: {
                press: jest.fn().mockResolvedValue(),
                type: jest.fn().mockResolvedValue()
            },
            evaluate: jest.fn().mockResolvedValue(),
            waitForFunction: jest.fn().mockResolvedValue()
        };

        const mockConfig = {
            categoria: '2',
            pis: '12345678901',
            url: 'http://test2.com'
        };

        await navigatePage1(mockPage, {}, mockConfig);

        expect(mockPage.$).toHaveBeenCalledWith('br-input[formcontrolname="nit"]');
        expect(mockPage.keyboard.type).toHaveBeenCalledWith('12345678901', expect.any(Object));
    });
});

const navigatePage2 = require('../../src/pages/page2-confirmacao');
const { delay, clickBrButton } = require('../../src/helpers');

jest.mock('../../src/helpers', () => ({
    delay: jest.fn().mockResolvedValue(),
    clickBrButton: jest.fn().mockResolvedValue(true)
}));

jest.mock('../../src/logger', () => ({
    info: jest.fn(),
    debug: jest.fn()
}));

describe('navigatePage2', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('waits for transition and clicks Confirmar', async () => {
        const mockPage = {
            waitForFunction: jest.fn().mockResolvedValue()
        };
        const mockConfig = {};

        await navigatePage2(mockPage, mockConfig);

        expect(mockPage.waitForFunction).toHaveBeenCalledTimes(2);
        expect(clickBrButton).toHaveBeenCalledWith(mockPage, 'Confirmar', { primary: true });
        expect(delay).toHaveBeenCalledTimes(2);
    });
});

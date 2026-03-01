describe('page5-resumo', () => {
    // ─── todayStr() ─────────────────────────────────────────────────

    describe('date formatting', () => {
        test('todayStr() returns date in YYYY-MM-DD format', () => {
            const todayStr = () => {
                const d = new Date();
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            };

            const result = todayStr();
            expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });
    });

    // ─── Summary extraction regexes ─────────────────────────────────

    describe('summary extraction regexes', () => {
        const sampleText = [
            'NIT / PIS / PASEP: 123.45678.90-1',
            'Nome: THIAGO SILVA',
            'Data de Cálculo: 28/02/2026',
            'Vencimento 15/03/2026',
            'Total R$ 264,40',
            '85820000002-6 64400286025-0 02600000000-0 00000000000-4',
        ].join('\n');

        test('NIS regex matches expected format', () => {
            const nisMatch = sampleText.match(/NIT\s*\/\s*PIS\s*\/\s*PASEP:\s*([\d\.\-]+)/i);
            expect(nisMatch).not.toBeNull();
            expect(nisMatch[1]).toBe('123.45678.90-1');
        });

        test('Nome regex captures the name', () => {
            const nomeMatch = sampleText.match(/Nome:\s*([^\n]+)/i);
            expect(nomeMatch).not.toBeNull();
            expect(nomeMatch[1].trim()).toBe('THIAGO SILVA');
        });

        test('Data de Cálculo regex captures the date', () => {
            const calcMatch = sampleText.match(/Data de C[aá]lculo:\s*([\d\/]+)/i);
            expect(calcMatch).not.toBeNull();
            expect(calcMatch[1]).toBe('28/02/2026');
        });

        test('Vencimento regex captures the date', () => {
            const vencMatch = sampleText.match(/Vencimento\s*([\d\/]+)/i);
            expect(vencMatch).not.toBeNull();
            expect(vencMatch[1]).toBe('15/03/2026');
        });

        test('Total regex captures the value', () => {
            const totalMatch = sampleText.match(/Total\s*(R\$\s*[\d\,\.]+)/i);
            expect(totalMatch).not.toBeNull();
            expect(totalMatch[1]).toBe('R$ 264,40');
        });

        test('Barcode regex captures the full code', () => {
            const barcodeMatch = sampleText.match(/([\d]{11}\-\d\s+[\d]{11}\-\d\s+[\d]{11}\-\d\s+[\d]{11}\-\d)/);
            expect(barcodeMatch).not.toBeNull();
            expect(barcodeMatch[1]).toBe('85820000002-6 64400286025-0 02600000000-0 00000000000-4');
        });

        test('returns null for missing fields', () => {
            const emptyText = 'Some random page content with no GPS data';
            expect(emptyText.match(/NIT\s*\/\s*PIS\s*\/\s*PASEP:\s*([\d\.\-]+)/i)).toBeNull();
            expect(emptyText.match(/Nome:\s*([^\n]+)/i)).toBeNull();
            expect(emptyText.match(/Total\s*(R\$\s*[\d\,\.]+)/i)).toBeNull();
        });
    });
});

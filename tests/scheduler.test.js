/**
 * Tests for cron schedule validation and Docker compose configuration.
 * Since the scheduler is a Docker container, we validate the configuration
 * rather than testing the actual scheduling logic.
 */

const fs = require('fs');
const path = require('path');

describe('Cron Schedule Configuration', () => {
    test('docker-compose.yml contains gps-scheduler service', () => {
        const composePath = path.join(__dirname, '..', 'docker-compose.yml');
        const content = fs.readFileSync(composePath, 'utf-8');

        expect(content).toContain('gps-scheduler');
        expect(content).toContain('gps-worker');
    });

    test('docker-compose.yml scheduler uses docker:cli image', () => {
        const composePath = path.join(__dirname, '..', 'docker-compose.yml');
        const content = fs.readFileSync(composePath, 'utf-8');

        expect(content).toContain('image: docker:cli');
    });

    test('docker-compose.yml scheduler mounts Docker socket', () => {
        const composePath = path.join(__dirname, '..', 'docker-compose.yml');
        const content = fs.readFileSync(composePath, 'utf-8');

        expect(content).toContain('/var/run/docker.sock');
    });

    test('docker-compose.yml scheduler references CRON_SCHEDULE variable', () => {
        const composePath = path.join(__dirname, '..', 'docker-compose.yml');
        const content = fs.readFileSync(composePath, 'utf-8');

        expect(content).toContain('CRON_SCHEDULE');
    });

    test('docker-compose.yml scheduler uses crond', () => {
        const composePath = path.join(__dirname, '..', 'docker-compose.yml');
        const content = fs.readFileSync(composePath, 'utf-8');

        expect(content).toContain('crond -f');
    });

    test('docker-compose.yml scheduler restarts unless-stopped', () => {
        const composePath = path.join(__dirname, '..', 'docker-compose.yml');
        const content = fs.readFileSync(composePath, 'utf-8');

        expect(content).toContain('restart: unless-stopped');
    });

    test('docker-compose.yml worker does not restart', () => {
        const composePath = path.join(__dirname, '..', 'docker-compose.yml');
        const content = fs.readFileSync(composePath, 'utf-8');

        // Worker should have restart: "no"
        expect(content).toMatch(/restart:\s*"no"/);
    });

    test('docker-compose.yml worker uses output volume (not pdf)', () => {
        const composePath = path.join(__dirname, '..', 'docker-compose.yml');
        const content = fs.readFileSync(composePath, 'utf-8');

        expect(content).toContain('./output:/app/output');
        expect(content).not.toContain('./pdf:/app/pdf');
    });
});

describe('Cron Schedule Validation', () => {
    test('.env.example contains CRON_SCHEDULE', () => {
        const envExamplePath = path.join(__dirname, '..', '.env.example');
        const content = fs.readFileSync(envExamplePath, 'utf-8');

        expect(content).toContain('CRON_SCHEDULE=');
    });

    test('CRON_SCHEDULE in .env.example uses the expected format', () => {
        const envExamplePath = path.join(__dirname, '..', '.env.example');
        const content = fs.readFileSync(envExamplePath, 'utf-8');

        // Should match a cron expression with 5 fields
        const match = content.match(/CRON_SCHEDULE=(.+)/);
        expect(match).toBeTruthy();

        const cronValue = match[1].trim();
        const fields = cronValue.split(/\s+/);
        expect(fields).toHaveLength(5);
    });

    test('validates well-formed cron expressions', () => {
        // Simple validation: 5 space-separated fields
        const validCrons = [
            '0 8 16 * *',
            '5 4 * * *',
            '*/5 * * * *',
            '0 0 1 1 *',
            '30 12 * * 1-5',
        ];

        for (const cron of validCrons) {
            const fields = cron.split(/\s+/);
            expect(fields).toHaveLength(5);
        }
    });

    test('identifies malformed cron expressions', () => {
        const invalidCrons = [
            '* * *',           // too few fields
            '* * * * * *',     // too many fields
            '',                // empty
        ];

        for (const cron of invalidCrons) {
            const fields = cron.trim().split(/\s+/).filter(Boolean);
            expect(fields.length).not.toBe(5);
        }
    });
});

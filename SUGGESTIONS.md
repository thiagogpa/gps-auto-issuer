# Project Suggestions & Recommendations

This file tracks proposed enhancements and industry-standard automations for the GPS project, based on research conducted in May 2026.

## 1. Maintenance & Dependency Management

### Renovate Bot ✅ Picked
- **Why:** Groups updates, auto-merges patch versions, handles Puppeteer updates.
- **Config:** `.github/renovate.json`

## 2. Security & Governance

### GitHub CodeQL (SAST) ✅ Picked
- **Why:** Scans code for vulnerabilities.

### Socket.dev ✅ Picked
- **Why:** Scans `node_modules` for supply-chain risks.

## 3. Code Quality & Formatting

### ESLint & Prettier ✅ Picked
- **Why:** Standardized JS linting.

### Test Reporter (`dorny/test-reporter`) ✅ Picked
- **Why:** Inline test results in PRs.

## 4. Project Health & Management

### Stale Bot ✅ Picked
- **Why:** Automatically closes inactive issues/PRs.

### PR Labeler ✅ Picked
- **Why:** Auto-labels PRs by changed files.

### Release Please ✅ Picked
- **Why:** Automated versioning and changelogs.

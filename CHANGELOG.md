# Changelog

## 1.0.0 (2026-05-19)


### Features

* add date stamp to PDF and JSON output filenames ([08b9afe](https://github.com/thiagogpa/gps-auto-issuer/commit/08b9afeaf3a89577a2ce762aad73a38a9d644637))
* add dry run mode, configurable poll limit, debug cleanup, and Discord startup notification ([521427b](https://github.com/thiagogpa/gps-auto-issuer/commit/521427bad226b23a9ac40c1323ed8c13b1b768fb))
* add IP block detection, PIS validation, and reliability hardening ([ab6a6e9](https://github.com/thiagogpa/gps-auto-issuer/commit/ab6a6e98a1bb8dc86e1a618ffa520b62273e5b15))
* add Jest test suite with 47 unit tests ([bf87883](https://github.com/thiagogpa/gps-auto-issuer/commit/bf8788322c152fd9f76918bc5b26a5188db0d7fa))
* add process start/end and schedule logging ([fbeec73](https://github.com/thiagogpa/gps-auto-issuer/commit/fbeec7382206b5ab0c8d258eb63c03c4a3b4d55a))
* **config:** add FORCE_RUN flag to bypass business day guard ([5d17aa4](https://github.com/thiagogpa/gps-auto-issuer/commit/5d17aa40cd2d2fddc50ef5dfd815a0972bff6242))
* implement scheduler, centralized logging, and process retries ([c1e9db1](https://github.com/thiagogpa/gps-auto-issuer/commit/c1e9db100bc81441e343efb4d3b01cea2e5300d4))


### Bug Fixes

* **automation:** resolve Page 4 race condition and add PDF export features ([b5da606](https://github.com/thiagogpa/gps-auto-issuer/commit/b5da606ad0d0671e77d91ffb571d1230666767e9))
* **ci:** add check permissions and correct socket.dev action path ([c79df4a](https://github.com/thiagogpa/gps-auto-issuer/commit/c79df4a7c345d3d747f080e9e0e9f883d5ad1c5b))
* **ci:** add mode and correct token parameter for socket scan ([8a924fc](https://github.com/thiagogpa/gps-auto-issuer/commit/8a924fc83b9952360df5fcf11373956d2221fbc0))
* resolve post-rebase issues found during Docker test run ([67bd533](https://github.com/thiagogpa/gps-auto-issuer/commit/67bd533766d94d8c7eea93f592d928f2df57f5be))
* update next run date format to YYYY-MM-DD ([07a8bd2](https://github.com/thiagogpa/gps-auto-issuer/commit/07a8bd2b946e18330eb11876b8d1232de1339b8e))

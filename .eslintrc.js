module.exports = {
  env: {
    node: true,
    commonjs: true,
    es2021: true,
    jest: true,
    browser: true,
  },
  globals: {
    ___grecaptcha_cfg: "readonly",
  },
  extends: ["eslint:recommended", "prettier"],

  parserOptions: {
    ecmaVersion: 'latest',
  },
  rules: {
    'no-unused-vars': 'warn',
    'no-console': 'off',
    'no-useless-escape': 'off',
    'no-empty': 'off',
  },
};

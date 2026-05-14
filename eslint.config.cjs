const js = require("@eslint/js");
const tsParser = require("@typescript-eslint/parser");

const globals = {
  AbortController: "readonly",
  Buffer: "readonly",
  clearInterval: "readonly",
  console: "readonly",
  fetch: "readonly",
  globalThis: "readonly",
  process: "readonly",
  setInterval: "readonly",
  setTimeout: "readonly",
  URL: "readonly",
};

module.exports = [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "eslint.config.cjs",
    ],
  },
  {
    files: ["**/*.{js,cjs,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals,
    },
    rules: {
      ...js.configs.recommended.rules,
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals,
    },
    rules: {},
  },
];

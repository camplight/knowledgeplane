const js = require("@eslint/js");
const tsParser = require("@typescript-eslint/parser");

module.exports = [
  {
    ignores: [
      "**/node_modules/**",
      ".next/**",
      "dist/**",
      "eslint.config.js",
      "next.config.js",
      "postcss.config.js",
      "tailwind.config.js",
    ],
  },
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
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
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {},
  },
];

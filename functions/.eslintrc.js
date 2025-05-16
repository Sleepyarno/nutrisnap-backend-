module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "google",
    "prettier"
  ],
  rules: {
    quotes: ["error", "single"],
    "max-len": ["error", { "code": 100, "ignoreUrls": true, "ignoreTemplateLiterals": true }],
    "no-unused-vars": ["error", { "args": "none" }],
    "object-curly-spacing": ["error", "always"],
    "require-jsdoc": 0,
  },
  parserOptions: {
    ecmaVersion: 2018,
  },
};

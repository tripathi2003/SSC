import js from '@eslint/js';
import globals from 'globals';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
        process: 'readonly',
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // Disable rules that conflict with existing codebase style
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'no-empty': 'off',
      'react/react-in-jsx-scope': 'off',
    },
  },
  {
    files: ['src/chat/**/*.{js,jsx}', 'src/lib/signal/**/*.{js,jsx}', 'src/context/**/*.{js,jsx}'],
    rules: {
      'no-empty-function': 'off',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.property.name="catch"] > ArrowFunctionExpression[body.type="BlockStatement"][params.length=0][body.body.length=0]',
          message: 'Empty .catch(() => {}) hides failures on critical paths. Use recordDiagnostic() or handle the error explicitly.',
        },
      ],
    },
  },
];

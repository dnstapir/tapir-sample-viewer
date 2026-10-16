import js from '@eslint/js'
import solid from 'eslint-plugin-solid/configs/typescript'
import { defineConfig } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  {
    files: ['src/**/*.{ts,tsx}', 'test/**/*.ts'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      solid,
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'arrow-spacing': 'error',
      camelcase: 'off',
      'comma-spacing': 'error',
      'comma-dangle': ['error', 'always-multiline'],
      'eol-last': 'error',
      eqeqeq: 'error',
      'func-style': ['error', 'declaration'],
      indent: ['error', 2],
      'key-spacing': 'error',
      'no-constant-condition': 'off',
      'no-extra-parens': 'warn',
      'no-multi-spaces': 'error',
      'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 0 }],
      'no-trailing-spaces': 'error',
      'no-unused-vars': 'off',
      'no-useless-concat': 'error',
      'no-useless-rename': 'error',
      'no-useless-return': 'error',
      'no-var': 'error',
      'object-curly-spacing': ['error', 'always'],
      'prefer-const': 'warn',
      'prefer-destructuring': ['warn', {
        object: true,
        array: false,
      }],
      'prefer-promise-reject-errors': 'error',
      quotes: ['error', 'single'],
      'require-await': 'warn',
      semi: ['error', 'never'],
      'sort-imports': ['error', {
        ignoreDeclarationSort: true,
        ignoreMemberSort: false,
        memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
      }],
      'space-infix-ops': 'error',

      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
)

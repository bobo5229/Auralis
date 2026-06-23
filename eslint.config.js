import pluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import tseslint from 'typescript-eslint'
import prettier from '@vue/eslint-config-prettier'

export default [
  {
    ignores: [
      'dist/**',
      '**/dist/**',
      'out/**',
      '**/out/**',
      'node_modules/**',
      '**/node_modules/**',
      '.npm-cache/**',
      '**/.npm-cache/**',
      '.electron-gyp/**',
      '**/.electron-gyp/**',
      '.electron-home/**',
      '**/.electron-home/**',
      '**/AppData/**',
      'data/**',
      '**/data/**',
    ],
  },
  ...pluginVue.configs['flat/recommended'],
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
]

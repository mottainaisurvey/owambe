module.exports = {
  extends: ['expo'],
  rules: {
    // Align with API and web ESLint rules
    'no-console': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
  ignorePatterns: ['node_modules/', 'dist/', '.expo/'],
};

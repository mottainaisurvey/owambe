module.exports = {
  extends: ['expo'],
  rules: {
    // Align with API and web ESLint rules
    'no-console': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    // Expo packages are not resolvable by standard import/no-unresolved
    // because they use Expo's custom module resolver (Metro bundler).
    // Disable this rule for the mobile app.
    'import/no-unresolved': 'off',
  },
  ignorePatterns: ['node_modules/', 'dist/', '.expo/'],
};

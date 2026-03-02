module.exports = {
  arrowParens: 'always',
  bracketSpacing: true,
  printWidth: 120,
  tabWidth: 2,
  semi: true,
  singleQuote: true,
  trailingComma: 'none',
  endOfLine: 'auto',
  overrides: [
    {
      files: '.prettierrc',
      options: {
        parser: 'json'
      }
    }
  ]
};

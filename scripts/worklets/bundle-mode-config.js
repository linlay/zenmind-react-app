function isWorkletsBundleModeEnabled(environment = process.env) {
  const babelEnvironment = String(environment.BABEL_ENV || '')
    .trim()
    .toLowerCase();
  if (babelEnvironment) {
    return babelEnvironment === 'production';
  }

  return (
    String(environment.NODE_ENV || '')
      .trim()
      .toLowerCase() === 'production'
  );
}

module.exports = {
  isWorkletsBundleModeEnabled
};

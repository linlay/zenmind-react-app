function isWorkletsBundleModeEnabled() {
  // Streamdown imports remend into its Worklet runtime through Bundle Mode.
  // Inline Worklets capture remend as a remote JS function and cannot call it.
  return true;
}

function isProductionBuild(environment = process.env) {
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
  isWorkletsBundleModeEnabled,
  isProductionBuild
};

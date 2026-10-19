const { isWorkletsBundleModeEnabled } = require('./scripts/worklets/bundle-mode-config');

module.exports = function (api) {
  const bundleMode = isWorkletsBundleModeEnabled();
  api.cache.using(() => isWorkletsBundleModeEnabled());

  return {
    presets: ['babel-preset-expo', 'nativewind/babel'],
    plugins: [
      [
        'react-native-worklets/plugin',
        {
          bundleMode,
          workletizableModules: ['remend']
        }
      ]
    ]
  };
};

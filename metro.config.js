const { getDefaultConfig } = require('expo/metro-config');
const fs = require('fs');
const path = require('path');
const { getBundleModeMetroConfig } = require('react-native-worklets/bundleMode');
const { withNativeWind } = require('nativewind/metro');
const { isWorkletsBundleModeEnabled, isProductionBuild } = require('./scripts/worklets/bundle-mode-config');

let config = getDefaultConfig(__dirname);
const bundleModeEnabled = isWorkletsBundleModeEnabled();
const generatedWorkletsModulePrefix = 'react-native-worklets/.worklets/';
const generatedWorkletsDir = path.resolve(__dirname, '.generated', 'react-native-worklets', '.worklets');
const packageWorkletsDir = path.join(path.dirname(require.resolve('react-native-worklets/package.json')), '.worklets');
const resolvedWorkletsDir = isProductionBuild() ? generatedWorkletsDir : packageWorkletsDir;
const workspaceNodeModulesDir = path.resolve(__dirname, '..', 'node_modules');

fs.mkdirSync(resolvedWorkletsDir, { recursive: true });

if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

config.watchFolders = fs.existsSync(workspaceNodeModulesDir) ? [workspaceNodeModulesDir] : [];
config.watchFolders.push(resolvedWorkletsDir);

if (bundleModeEnabled) {
  const defaultResolver = config.resolver.resolveRequest;

  config = getBundleModeMetroConfig(config);

  const bundleModeResolver = config.resolver.resolveRequest;

  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName.startsWith(generatedWorkletsModulePrefix)) {
      const generatedWorkletPath = path.join(
        resolvedWorkletsDir,
        moduleName.slice(generatedWorkletsModulePrefix.length)
      );
      if (fs.existsSync(generatedWorkletPath)) {
        return {
          type: 'sourceFile',
          filePath: generatedWorkletPath
        };
      }
    }
    if (bundleModeResolver) {
      return bundleModeResolver(context, moduleName, platform);
    }
    if (defaultResolver) {
      return defaultResolver(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = withNativeWind(config, { input: './global.css' });

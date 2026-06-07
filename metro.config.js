const { getDefaultConfig } = require('expo/metro-config');
const fs = require('fs');
const path = require('path');
const { getBundleModeMetroConfig } = require('react-native-worklets/bundleMode');

let config = getDefaultConfig(__dirname);
const generatedWorkletsModulePrefix = 'react-native-worklets/.worklets/';
const generatedWorkletsDir = path.resolve(
  __dirname,
  '.generated',
  'react-native-worklets',
  '.worklets'
);
const workspaceNodeModulesDir = path.resolve(__dirname, '..', 'node_modules');

fs.mkdirSync(generatedWorkletsDir, { recursive: true });

if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

config.watchFolders = fs.existsSync(workspaceNodeModulesDir) ? [workspaceNodeModulesDir] : [];

const defaultResolver = config.resolver.resolveRequest;

config = getBundleModeMetroConfig(config);

const bundleModeResolver = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith(generatedWorkletsModulePrefix)) {
    const generatedWorkletPath = path.join(
      generatedWorkletsDir,
      moduleName.slice(generatedWorkletsModulePrefix.length)
    );
    if (fs.existsSync(generatedWorkletPath)) {
      return {
        type: 'sourceFile',
        filePath: generatedWorkletPath,
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

module.exports = config;

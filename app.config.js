const packageJson = require('./package.json');
const { resolveBrandId, syncBrandArtifacts } = require('./scripts/lib/brand-config');
const { syncReactAppEnvArtifact } = require('./scripts/lib/app-env-config');

function assetPath(relativePath) {
  return `./${relativePath}`;
}

module.exports = () => {
  const brand = syncBrandArtifacts({
    rootDir: __dirname,
    brandId: resolveBrandId(process.argv.slice(2), process.env, __dirname, { allowPositional: false }),
    appVersion: packageJson.version,
    syncNativeProject: false,
  });
  const appEnv = syncReactAppEnvArtifact({ rootDir: __dirname });

  return {
    expo: {
      name: brand.expoName,
      slug: brand.slug,
      version: brand.version,
      orientation: 'portrait',
      icon: assetPath(brand.generatedAssets.icon),
      userInterfaceStyle: 'light',
      newArchEnabled: true,
      plugins: [
        [
          'expo-splash-screen',
          {
            backgroundColor: brand.splash.backgroundColor,
            image: assetPath(brand.generatedAssets.logo),
            imageWidth: brand.splash.imageWidth,
            resizeMode: 'contain',
            android: {
              imageWidth: brand.splash.androidImageWidth,
            },
          },
        ],
        [
          'expo-notifications',
          {
            defaultChannel: brand.notification.channel,
            color: brand.notification.color,
          },
        ],
        [
          'expo-camera',
          {
            cameraPermission: 'Allow $(PRODUCT_NAME) to use the camera to scan login QR codes.',
            microphonePermission: false,
            recordAudioAndroid: false,
          },
        ],
        [
          'react-native-enriched-markdown',
          {
            enableMath: true,
          },
        ],
        './plugins/withAndroidAutolinkingCacheGuard',
        './plugins/withAndroidNdkVersionForSubprojects',
      ],
      ios: {
        supportsTablet: true,
        bundleIdentifier: brand.ios.bundleIdentifier,
      },
      android: {
        adaptiveIcon: {
          foregroundImage: assetPath(brand.generatedAssets.adaptiveIcon),
          backgroundColor: brand.android.adaptiveIconBackgroundColor,
        },
        usesCleartextTraffic: true,
        package: brand.android.package,
        softwareKeyboardLayoutMode: 'adjustResize',
      },
      web: {
        favicon: assetPath(brand.generatedAssets.favicon),
      },
      extra: {
        brand: {
          id: brand.id,
          productName: brand.productName,
        },
        appEnvironment: {
          schemaVersion: appEnv.schemaVersion,
          artifactVersion: appEnv.artifactVersion,
        },
        eas: {
          projectId: brand.updates.projectId,
        },
      },
      owner: 'zqfrank',
      runtimeVersion: {
        policy: 'appVersion',
      },
      updates: {
        url: brand.updates.url,
      },
    },
  };
};

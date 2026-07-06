const fs = require('fs');
const path = require('path');

const { getDefaultConfig } = require('expo/metro-config');
const { functionMapBabelPlugin } = require('metro-source-map');
const { importLocationsPlugin } = require('metro/private/ModuleGraph/worker/importLocationsPlugin');

const projectRoot = path.resolve(__dirname, '..', '..');
const workspaceNodeModulesDir = path.resolve(projectRoot, '..', 'node_modules');
const metroConfig = getDefaultConfig(projectRoot);
const metroBabelTransformer = require(metroConfig.transformer.babelTransformerPath);
const metroBabelPlugins = [functionMapBabelPlugin, importLocationsPlugin];
const packageGeneratedWorkletsDir = path.join(
  path.dirname(require.resolve('react-native-worklets/package.json')),
  '.worklets'
);
const projectGeneratedWorkletsDir = path.join(
  projectRoot,
  '.generated',
  'react-native-worklets',
  '.worklets'
);
const projectWorkletsPackageDir = path.join(projectRoot, 'node_modules', 'react-native-worklets');
const cssInteropPackageDir = path.dirname(require.resolve('react-native-css-interop/package.json'));

const sourceRoots = [
  'App.tsx',
  'index.js',
  'src',
  'node_modules/react-native-reanimated/src',
  'node_modules/react-native-reanimated/lib/module',
  'node_modules/react-native-streamdown/src',
  'node_modules/react-native-streamdown/lib/module',
  'node_modules/react-native-worklets/src',
  'node_modules/react-native-worklets/lib/module',
  'node_modules/remend',
  path.join(workspaceNodeModulesDir, 'react-native-css-interop', 'src'),
  path.join(workspaceNodeModulesDir, 'react-native-css-interop', 'dist'),
  path.join(cssInteropPackageDir, 'src'),
  path.join(cssInteropPackageDir, 'dist'),
];

const sourceExtensions = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx']);
const ignoredDirectoryNames = new Set([
  '.git',
  '.expo',
  '.generated',
  '__fixtures__',
  '__mocks__',
  '__tests__',
  'android',
  'apple',
  'ios',
  'build',
  'builds',
  'dist',
  'typescript',
]);
const MAX_GENERATED_PASSES = 10;
const buildEnvironments = [
  {
    label: 'development',
    babelEnv: 'development',
    nodeEnv: 'development',
    dev: true,
  },
  {
    label: 'production',
    babelEnv: 'production',
    nodeEnv: 'production',
    dev: false,
  },
];
const buildPlatforms = ['android', 'web'];
const productionBuildEnvironment = buildEnvironments.find(
  (buildEnvironment) => buildEnvironment.label === 'production'
);

function isSourceFile(filePath) {
  return sourceExtensions.has(path.extname(filePath)) && !filePath.endsWith('.d.ts');
}

function collectSourceFiles(entryPath, candidates) {
  if (!fs.existsSync(entryPath)) {
    return;
  }

  const stat = fs.statSync(entryPath);
  if (stat.isDirectory()) {
    for (const childName of fs.readdirSync(entryPath).sort()) {
      if (ignoredDirectoryNames.has(childName)) {
        continue;
      }
      collectSourceFiles(path.join(entryPath, childName), candidates);
    }
    return;
  }

  if (stat.isFile() && isSourceFile(entryPath)) {
    candidates.add(entryPath);
  }
}

function collectSourceRoot(entryPath, candidates) {
  collectSourceFiles(entryPath, candidates);

  if (!fs.existsSync(entryPath)) {
    return;
  }

  const realEntryPath = fs.realpathSync(entryPath);
  if (realEntryPath !== entryPath) {
    collectSourceFiles(realEntryPath, candidates);
  }
}

function listGeneratedWorkletFiles(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    return [];
  }

  return fs
    .readdirSync(directoryPath)
    .filter((fileName) => fileName.endsWith('.js'))
    .sort()
    .map((fileName) => path.join(directoryPath, fileName));
}

function clearGeneratedJsFiles(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });

  let deletedCount = 0;
  for (const filePath of listGeneratedWorkletFiles(directoryPath)) {
    fs.unlinkSync(filePath);
    deletedCount += 1;
  }
  return deletedCount;
}

function toImportPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function rewriteGeneratedWorkletImports(content) {
  const workletsPackageImportPath = toImportPath(
    path.relative(projectGeneratedWorkletsDir, projectWorkletsPackageDir)
  );
  return content.replace(
    /(["'])\.\.\/(src|lib\/module)\//g,
    (_match, quote, packageSubpath) => `${quote}${workletsPackageImportPath}/${packageSubpath}/`
  );
}

function syncPackageGeneratedWorkletsToProject() {
  fs.rmSync(projectGeneratedWorkletsDir, { recursive: true, force: true });
  fs.mkdirSync(projectGeneratedWorkletsDir, { recursive: true });

  let copiedCount = 0;
  for (const filePath of listGeneratedWorkletFiles(packageGeneratedWorkletsDir)) {
    fs.writeFileSync(
      path.join(projectGeneratedWorkletsDir, path.basename(filePath)),
      rewriteGeneratedWorkletImports(fs.readFileSync(filePath, 'utf8'))
    );
    copiedCount += 1;
  }
  return copiedCount;
}

function withBuildEnvironment(buildEnvironment, callback) {
  const previousBabelEnv = process.env.BABEL_ENV;
  const previousNodeEnv = process.env.NODE_ENV;

  process.env.BABEL_ENV = buildEnvironment.babelEnv;
  process.env.NODE_ENV = buildEnvironment.nodeEnv;

  try {
    return callback();
  } finally {
    if (previousBabelEnv === undefined) {
      delete process.env.BABEL_ENV;
    } else {
      process.env.BABEL_ENV = previousBabelEnv;
    }

    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
}

function transformSourceText(filename, src, buildEnvironment, platform) {
  metroBabelTransformer.transform({
    filename,
    src,
    options: {
      customTransformOptions: {
        routerRoot: 'src/app',
      },
      dev: buildEnvironment.dev,
      enableBabelRCLookup: true,
      experimentalImportSupport: false,
      hermesParser: false,
      platform,
      projectRoot,
      type: 'module',
    },
    plugins: metroBabelPlugins,
  });
}

function transformFile(filePath, buildEnvironment, platform) {
  transformSourceText(filePath, fs.readFileSync(filePath, 'utf8'), buildEnvironment, platform);
}

function transformSourceFiles(sourceCandidates, buildEnvironment, platform) {
  let transformedSourceCount = 0;
  for (const filePath of Array.from(sourceCandidates).sort()) {
    transformFile(filePath, buildEnvironment, platform);
    transformedSourceCount += 1;
  }
  return transformedSourceCount;
}

function transformGeneratedFilesUntilStable(buildEnvironment, platform) {
  const processedGeneratedFiles = new Set();
  let copiedCount = syncPackageGeneratedWorkletsToProject();
  let transformedGeneratedCount = 0;

  for (let pass = 0; pass < MAX_GENERATED_PASSES; pass += 1) {
    let transformedInPass = 0;

    for (const filePath of listGeneratedWorkletFiles(projectGeneratedWorkletsDir)) {
      if (processedGeneratedFiles.has(filePath)) {
        continue;
      }

      transformFile(filePath, buildEnvironment, platform);
      processedGeneratedFiles.add(filePath);
      transformedGeneratedCount += 1;
      transformedInPass += 1;
    }

    copiedCount = syncPackageGeneratedWorkletsToProject();

    if (transformedInPass === 0) {
      return {
        copiedCount,
        transformedGeneratedCount,
      };
    }
  }

  throw new Error(
    `Worklets pregeneration did not stabilize after ${MAX_GENERATED_PASSES} generated passes.`
  );
}

function pregenerateReanimatedKeyframeProductionVariants() {
  if (!productionBuildEnvironment) {
    return 0;
  }

  const keyframeSourcePath = path.join(
    projectRoot,
    'node_modules',
    'react-native-reanimated',
    'src',
    'layoutReanimation',
    'animationBuilder',
    'Keyframe.ts'
  );
  if (!fs.existsSync(keyframeSourcePath)) {
    return 0;
  }

  const before = new Set(
    listGeneratedWorkletFiles(packageGeneratedWorkletsDir).map((filePath) =>
      path.basename(filePath)
    )
  );

  // Metro can later emit these Reanimated Keyframe production hashes from the
  // anonymous worklets in source order. Seed them up front so the project-local
  // .generated directory is complete before Metro builds its file map.
  const source = `
const withDelay = null;
const reduceMotion = null;
const getReduceMotionFromConfig = null;
const keyframes = null;
const delayFunction = null;
const delay = null;
const withTiming = null;
const Easing = null;
const withSequence = null;
const initialValues = null;
const makeKeyframeKey = null;
const callback = null;

void ((delay, animation) => {
  'worklet';
  return withDelay(delay, animation, reduceMotion);
});

void ((_, animation) => {
  'worklet';
  animation.reduceMotion = getReduceMotionFromConfig(reduceMotion);
  return animation;
});

void (() => {
  'worklet';
  const animations = {};
  const addAnimation = (key) => {
    const keyframePoints = keyframes[key];
    if (keyframePoints.length === 0) {
      return;
    }
    const animation = delayFunction(
      delay,
      keyframePoints.length === 1
        ? withTiming(keyframePoints[0].value, {
            duration: keyframePoints[0].duration,
            easing: keyframePoints[0].easing ? keyframePoints[0].easing : Easing.linear,
          })
        : withSequence(
            ...keyframePoints.map((keyframePoint) =>
              withTiming(keyframePoint.value, {
                duration: keyframePoint.duration,
                easing: keyframePoint.easing ? keyframePoint.easing : Easing.linear,
              })
            )
          )
    );
    if (key.includes('transform')) {
      if (!('transform' in animations)) {
        animations.transform = [];
      }
      animations.transform.push({
        [key.split(':')[1]]: animation,
      });
    } else {
      animations[key] = animation;
    }
  };
  Object.keys(initialValues).forEach((key) => {
    if (key.includes('transform')) {
      initialValues[key].forEach((transformProp, index) => {
        Object.keys(transformProp).forEach((transformPropKey) => {
          addAnimation(makeKeyframeKey(index, transformPropKey));
        });
      });
    } else {
      addAnimation(key);
    }
  });
  return {
    animations,
    initialValues,
    callback,
  };
});
`;

  withBuildEnvironment(productionBuildEnvironment, () => {
    for (const platform of buildPlatforms) {
      transformSourceText(
        fs.realpathSync(keyframeSourcePath),
        source,
        productionBuildEnvironment,
        platform
      );
    }
  });

  return listGeneratedWorkletFiles(packageGeneratedWorkletsDir).filter(
    (filePath) => !before.has(path.basename(filePath))
  ).length;
}

function main() {
  const deletedPackageGeneratedCount = clearGeneratedJsFiles(packageGeneratedWorkletsDir);
  const sourceCandidates = new Set();
  for (const sourceRoot of sourceRoots) {
    // Keep both paths: Metro can transform either the project node_modules
    // symlink path or pnpm's real .pnpm path, and filenames participate in the
    // Worklets hash.
    collectSourceRoot(
      path.isAbsolute(sourceRoot) ? sourceRoot : path.join(projectRoot, sourceRoot),
      sourceCandidates
    );
  }

  let copiedCount = 0;
  const summaries = [];
  for (const buildEnvironment of buildEnvironments) {
    for (const platform of buildPlatforms) {
      const summary = withBuildEnvironment(buildEnvironment, () => {
        const transformedSourceCount = transformSourceFiles(
          sourceCandidates,
          buildEnvironment,
          platform
        );
        const generatedSummary = transformGeneratedFilesUntilStable(buildEnvironment, platform);
        return {
          ...generatedSummary,
          label: `${buildEnvironment.label}/${platform}`,
          transformedSourceCount,
        };
      });

      copiedCount = summary.copiedCount;
      summaries.push(summary);
    }
  }

  const keyframeVariantCount = pregenerateReanimatedKeyframeProductionVariants();
  if (keyframeVariantCount > 0) {
    copiedCount = syncPackageGeneratedWorkletsToProject();
  }

  process.stdout.write(
    [
      `Pregenerated Worklets bundle files for ${summaries
        .map(
          (summary) =>
            `${summary.label}: ${summary.transformedSourceCount} source files, ${summary.transformedGeneratedCount} generated files`
        )
        .join('; ')}.`,
      `Seeded ${keyframeVariantCount} Reanimated Keyframe production variants.`,
      `Deleted ${deletedPackageGeneratedCount} stale package files; copied ${copiedCount} files to ${path.relative(projectRoot, projectGeneratedWorkletsDir)}.`,
    ].join(' ') + '\n'
  );
}

main();

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const kbRoot = path.join(repoRoot, 'doc', 'kb');
const curatedRoot = path.join(kbRoot, 'curated');

const curatedDirs = {
  modules: path.join(curatedRoot, 'modules'),
  flows: path.join(curatedRoot, 'flows'),
  tasks: path.join(curatedRoot, 'tasks'),
};

const outputDirs = {
  catalog: path.join(kbRoot, 'catalog'),
  modules: path.join(kbRoot, 'modules'),
  flows: path.join(kbRoot, 'flows'),
  tasks: path.join(kbRoot, 'tasks'),
  generated: path.join(kbRoot, 'generated'),
};

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

function fromRepoPath(relativePath) {
  return path.join(repoRoot, ...relativePath.split('/'));
}

function repoPathFromAbsolute(absolutePath) {
  return toPosixPath(path.relative(repoRoot, absolutePath));
}

function ensureDir(absolutePath) {
  fs.mkdirSync(absolutePath, { recursive: true });
}

function resetDirectory(absolutePath) {
  fs.rmSync(absolutePath, { recursive: true, force: true });
  ensureDir(absolutePath);
}

function existsRepoPath(relativePath) {
  return fs.existsSync(fromRepoPath(relativePath));
}

function readText(relativePath) {
  return fs.readFileSync(fromRepoPath(relativePath), 'utf8');
}

function readJson(absolutePath) {
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

function writeJson(absolutePath, value) {
  ensureDir(path.dirname(absolutePath));
  fs.writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sortUnique(values) {
  return [...new Set(values)].sort();
}

function listFilesRecursive(absoluteDir) {
  if (!fs.existsSync(absoluteDir)) {
    return [];
  }

  const results = [];
  const entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
  entries
    .sort((left, right) => left.name.localeCompare(right.name))
    .forEach((entry) => {
      const absolutePath = path.join(absoluteDir, entry.name);
      if (entry.isDirectory()) {
        results.push(...listFilesRecursive(absolutePath));
        return;
      }

      results.push(absolutePath);
    });

  return results;
}

function getSourceFiles() {
  const sourceFiles = [];

  ['App.tsx', 'index.js'].forEach((relativePath) => {
    if (existsRepoPath(relativePath)) {
      sourceFiles.push(relativePath);
    }
  });

  listFilesRecursive(fromRepoPath('src')).forEach((absolutePath) => {
    if (!SOURCE_EXTENSIONS.has(path.extname(absolutePath))) {
      return;
    }

    sourceFiles.push(repoPathFromAbsolute(absolutePath));
  });

  return sortUnique(sourceFiles);
}

function resolveImportTarget(fromFile, specifier) {
  if (!specifier.startsWith('.')) {
    return null;
  }

  const fromAbsolute = fromRepoPath(fromFile);
  const baseAbsolute = path.resolve(path.dirname(fromAbsolute), specifier);
  const candidates = [
    baseAbsolute,
    ...[...SOURCE_EXTENSIONS].map((extension) => `${baseAbsolute}${extension}`),
    ...[...SOURCE_EXTENSIONS].map((extension) => path.join(baseAbsolute, `index${extension}`)),
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }

    const stats = fs.statSync(candidate);
    if (!stats.isFile()) {
      continue;
    }

    return repoPathFromAbsolute(candidate);
  }

  return null;
}

function extractImportSpecifiers(content) {
  const results = [];
  const regex = /\b(?:import|export)\s+(?:type\s+)?(?:(?:[\w*\s{},]+)\s+from\s+)?['"]([^'"]+)['"]/g;

  let match = regex.exec(content);
  while (match) {
    results.push(match[1]);
    match = regex.exec(content);
  }

  return sortUnique(results);
}

function extractExportedSymbols(content) {
  const symbols = new Set();

  if (/\bexport\s+default\b/.test(content)) {
    symbols.add('default');
  }

  [
    /\bexport\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g,
    /\bexport\s+class\s+([A-Za-z0-9_$]+)/g,
    /\bexport\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/g,
    /\bexport\s+(?:type|interface|enum)\s+([A-Za-z0-9_$]+)/g,
  ].forEach((regex) => {
    let match = regex.exec(content);
    while (match) {
      symbols.add(match[1]);
      match = regex.exec(content);
    }
  });

  const namedExportRegex = /\bexport\s*\{\s*([^}]+)\s*\}/g;
  let namedMatch = namedExportRegex.exec(content);
  while (namedMatch) {
    namedMatch[1]
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .forEach((entry) => {
        const parts = entry.split(/\s+as\s+/i).map((part) => part.trim());
        symbols.add(parts[parts.length - 1]);
      });
    namedMatch = namedExportRegex.exec(content);
  }

  return [...symbols].sort();
}

function readCuratedRoot() {
  return readJson(path.join(curatedRoot, 'root.json'));
}

function readCuratedRules() {
  return readJson(path.join(curatedRoot, 'rules.json'));
}

function readCuratedCollection(kind) {
  const directory = curatedDirs[kind];
  return listFilesRecursive(directory)
    .filter((absolutePath) => absolutePath.endsWith('.json'))
    .map((absolutePath) => readJson(absolutePath))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function readBuiltCollection(kind) {
  const directory = outputDirs[kind];
  return listFilesRecursive(directory)
    .filter((absolutePath) => absolutePath.endsWith('.json'))
    .map((absolutePath) => readJson(absolutePath))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function normalizeOwnedPath(relativePath) {
  return relativePath.replace(/\/+$/, '');
}

function buildModuleOwnership(modules, sourceFiles) {
  const fileToModule = {};
  const moduleToFiles = Object.fromEntries(modules.map((moduleCard) => [moduleCard.id, []]));
  const ownershipAmbiguities = [];
  const unownedFiles = [];

  sourceFiles.forEach((file) => {
    const matches = [];

    modules.forEach((moduleCard) => {
      (moduleCard.paths || []).forEach((ownedPath) => {
        const normalizedPath = normalizeOwnedPath(ownedPath);
        const exactMatch = file === normalizedPath;
        const nestedMatch = file.startsWith(`${normalizedPath}/`);

        if (exactMatch || nestedMatch) {
          matches.push({
            moduleId: moduleCard.id,
            ownedPath: normalizedPath,
            length: normalizedPath.length,
          });
        }
      });
    });

    matches.sort(
      (left, right) => right.length - left.length || left.moduleId.localeCompare(right.moduleId)
    );

    if (matches.length === 0) {
      unownedFiles.push(file);
      return;
    }

    const bestMatch = matches[0];
    const sameLengthMatches = matches.filter((match) => match.length === bestMatch.length);
    if (sameLengthMatches.length > 1) {
      ownershipAmbiguities.push({
        file,
        candidates: sameLengthMatches.map((match) => ({
          moduleId: match.moduleId,
          ownedPath: match.ownedPath,
        })),
      });
      return;
    }

    fileToModule[file] = bestMatch.moduleId;
    moduleToFiles[bestMatch.moduleId].push(file);
  });

  Object.keys(moduleToFiles).forEach((moduleId) => {
    moduleToFiles[moduleId] = sortUnique(moduleToFiles[moduleId]);
  });

  return {
    fileToModule,
    moduleToFiles,
    ownershipAmbiguities,
    unownedFiles: sortUnique(unownedFiles),
  };
}

function buildDirectoryTree(relativePaths) {
  const root = {
    name: '.',
    type: 'directory',
    children: [],
  };

  const childMap = new Map([[root, new Map()]]);

  relativePaths.forEach((relativePath) => {
    const parts = relativePath.split('/');
    let node = root;

    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1;
      let childrenByName = childMap.get(node);
      if (!childrenByName) {
        childrenByName = new Map();
        childMap.set(node, childrenByName);
      }

      let child = childrenByName.get(part);
      if (!child) {
        child = {
          name: part,
          type: isFile ? 'file' : 'directory',
          children: isFile ? undefined : [],
        };
        childrenByName.set(part, child);
        node.children.push(child);
      }

      node = child;
    });
  });

  function sortNode(node) {
    if (!node.children) {
      return;
    }

    node.children.sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === 'directory' ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });

    node.children.forEach(sortNode);
  }

  sortNode(root);
  return root;
}

function buildEntryMappings(sourceContents) {
  const appEntryChain = [];
  const tabRoutes = [];

  const indexContent = sourceContents['index.js'] || '';
  if (indexContent.includes('registerRootComponent(App)')) {
    appEntryChain.push({
      file: 'index.js',
      detail: 'registerRootComponent(App)',
    });
  }

  const appContent = sourceContents['App.tsx'] || '';
  if (appContent.includes('<AppRoot />')) {
    appEntryChain.push({
      file: 'App.tsx',
      detail: 'App renders SafeAreaProvider and AppRoot',
    });
  }

  const appRootContent = sourceContents['src/app/AppRoot.tsx'] || '';
  if (appRootContent.includes('<RootNavigator />')) {
    appEntryChain.push({
      file: 'src/app/AppRoot.tsx',
      detail: 'AppRoot mounts NavigationContainer and RootNavigator',
    });
  }

  const rootNavigatorContent = sourceContents['src/app/navigation/RootNavigator.tsx'] || '';
  const routeRegex = /<Tab\.Screen\s+name="([^"]+)"\s+component=\{([A-Za-z0-9_]+)\}\s*\/>/g;
  let routeMatch = routeRegex.exec(rootNavigatorContent);
  while (routeMatch) {
    tabRoutes.push({
      routeName: routeMatch[1],
      component: routeMatch[2],
      file: 'src/app/navigation/RootNavigator.tsx',
    });
    routeMatch = routeRegex.exec(rootNavigatorContent);
  }

  return {
    appEntryChain,
    tabRoutes,
  };
}

function computeStaticFacts(modules) {
  const sourceFiles = getSourceFiles();
  const ownership = buildModuleOwnership(modules, sourceFiles);
  const sourceContents = {};
  const importsByFile = {};
  const resolvedImportsByFile = {};
  const exportsByFile = {};

  sourceFiles.forEach((file) => {
    const content = readText(file);
    sourceContents[file] = content;
    const specifiers = extractImportSpecifiers(content);
    importsByFile[file] = specifiers;
    resolvedImportsByFile[file] = sortUnique(
      specifiers.map((specifier) => resolveImportTarget(file, specifier)).filter(Boolean)
    );
    exportsByFile[file] = extractExportedSymbols(content);
  });

  const moduleGraph = {};
  const reverseGraph = Object.fromEntries(modules.map((moduleCard) => [moduleCard.id, new Set()]));

  modules.forEach((moduleCard) => {
    const dependencies = new Set();

    (ownership.moduleToFiles[moduleCard.id] || []).forEach((file) => {
      (resolvedImportsByFile[file] || []).forEach((importedFile) => {
        const importedModuleId = ownership.fileToModule[importedFile];
        if (!importedModuleId || importedModuleId === moduleCard.id) {
          return;
        }

        dependencies.add(importedModuleId);
      });
    });

    moduleGraph[moduleCard.id] = sortUnique([...dependencies]);
    moduleGraph[moduleCard.id].forEach((dependencyId) => {
      reverseGraph[dependencyId].add(moduleCard.id);
    });
  });

  const moduleDependents = Object.fromEntries(
    Object.entries(reverseGraph).map(([moduleId, dependentSet]) => [
      moduleId,
      sortUnique([...dependentSet]),
    ])
  );

  return {
    sourceFiles,
    sourceContents,
    importsByFile,
    resolvedImportsByFile,
    exportsByFile,
    moduleOwnership: ownership,
    moduleGraph,
    moduleDependents,
    entryMappings: buildEntryMappings(sourceContents),
    directoryTree: buildDirectoryTree(sourceFiles),
  };
}

module.exports = {
  curatedDirs,
  curatedRoot,
  fromRepoPath,
  computeStaticFacts,
  ensureDir,
  existsRepoPath,
  kbRoot,
  outputDirs,
  readBuiltCollection,
  readCuratedCollection,
  readCuratedRoot,
  readCuratedRules,
  readJson,
  readText,
  repoRoot,
  repoPathFromAbsolute,
  resetDirectory,
  sortUnique,
  toPosixPath,
  writeJson,
};

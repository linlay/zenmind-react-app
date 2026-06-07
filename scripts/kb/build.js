const path = require('path');

const {
  computeStaticFacts,
  kbRoot,
  outputDirs,
  readCuratedCollection,
  readCuratedRoot,
  readCuratedRules,
  resetDirectory,
  sortUnique,
  writeJson,
} = require('./common');

function withGeneratedMetadata(card, generated) {
  return {
    ...card,
    generated,
  };
}

function buildModuleCard(moduleCard, facts) {
  const files = facts.moduleOwnership.moduleToFiles[moduleCard.id] || [];
  const exportedSymbolsByFile = Object.fromEntries(
    files.map((file) => [file, facts.exportsByFile[file] || []])
  );

  return withGeneratedMetadata(moduleCard, {
    fileCount: files.length,
    files,
    exportedSymbolsByFile,
    actualDependsOn: facts.moduleGraph[moduleCard.id] || [],
    actualDependedBy: facts.moduleDependents[moduleCard.id] || [],
  });
}

function buildFlowCard(flowCard) {
  return withGeneratedMetadata(flowCard, {
    stepCount: flowCard.steps.length,
    files: sortUnique(flowCard.steps.map((step) => step.file)),
    resolvedModules: sortUnique(flowCard.steps.map((step) => step.moduleId)),
  });
}

function buildTaskCard(taskCard) {
  return withGeneratedMetadata(taskCard, {
    mustReadCount: taskCard.mustRead.length,
    likelyFileCount: taskCard.likelyFiles.length,
  });
}

function buildModulesCatalog(moduleCards) {
  return {
    generatedAt: new Date().toISOString(),
    items: moduleCards.map((moduleCard) => ({
      id: moduleCard.id,
      title: moduleCard.title,
      layer: moduleCard.layer,
      summary: moduleCard.responsibility[0],
      pathHints: moduleCard.paths,
      relatedFlows: moduleCard.relatedFlows,
      relatedTasks: moduleCard.relatedTasks,
      card: `doc/kb/modules/${moduleCard.id}.json`,
    })),
  };
}

function buildFlowsCatalog(flowCards) {
  return {
    generatedAt: new Date().toISOString(),
    items: flowCards.map((flowCard) => ({
      id: flowCard.id,
      title: flowCard.title,
      trigger: flowCard.trigger,
      mustCheckModules: flowCard.mustCheckModules,
      relatedTasks: flowCard.relatedTasks,
      card: `doc/kb/flows/${flowCard.id}.json`,
    })),
  };
}

function buildTasksCatalog(taskCards) {
  return {
    generatedAt: new Date().toISOString(),
    items: taskCards.map((taskCard) => ({
      id: taskCard.id,
      title: taskCard.title,
      intentKeywords: taskCard.intentKeywords,
      entryDecision: taskCard.entryDecision[0],
      likelyFiles: taskCard.likelyFiles,
      card: `doc/kb/tasks/${taskCard.id}.json`,
    })),
  };
}

function buildProjectFacts(modules, flows, tasks, facts, generatedAt) {
  return {
    generatedAt,
    sourceFiles: facts.sourceFiles,
    directoryTree: facts.directoryTree,
    entryMappings: facts.entryMappings,
    moduleOwnership: facts.moduleOwnership.moduleToFiles,
    fileToModule: facts.moduleOwnership.fileToModule,
    moduleGraph: Object.fromEntries(
      modules.map((moduleCard) => [
        moduleCard.id,
        {
          dependsOn: facts.moduleGraph[moduleCard.id] || [],
          dependedBy: facts.moduleDependents[moduleCard.id] || [],
        },
      ])
    ),
    exportsByFile: facts.exportsByFile,
    resolvedImportsByFile: facts.resolvedImportsByFile,
    cardCounts: {
      modules: modules.length,
      flows: flows.length,
      tasks: tasks.length,
    },
  };
}

function buildRoot(curatedRoot, modules, flows, tasks, facts, generatedAt) {
  return {
    ...curatedRoot,
    generatedAt,
    catalogs: {
      modules: 'doc/kb/catalog/modules.json',
      flows: 'doc/kb/catalog/flows.json',
      tasks: 'doc/kb/catalog/tasks.json',
    },
    rulesRef: 'doc/kb/rules.json',
    generated: {
      moduleCount: modules.length,
      flowCount: flows.length,
      taskCount: tasks.length,
      sourceFileCount: facts.sourceFiles.length,
      factsRef: 'doc/kb/generated/project-facts.json',
      appEntryChain: facts.entryMappings.appEntryChain,
      tabRoutes: facts.entryMappings.tabRoutes,
    },
  };
}

function main() {
  const generatedAt = new Date().toISOString();
  const curatedRoot = readCuratedRoot();
  const curatedRules = readCuratedRules();
  const curatedModules = readCuratedCollection('modules');
  const curatedFlows = readCuratedCollection('flows');
  const curatedTasks = readCuratedCollection('tasks');

  const facts = computeStaticFacts(curatedModules);

  [
    outputDirs.catalog,
    outputDirs.modules,
    outputDirs.flows,
    outputDirs.tasks,
    outputDirs.generated,
  ].forEach(resetDirectory);

  const moduleCards = curatedModules.map((moduleCard) => buildModuleCard(moduleCard, facts));
  const flowCards = curatedFlows.map(buildFlowCard);
  const taskCards = curatedTasks.map(buildTaskCard);
  const rootCard = buildRoot(curatedRoot, moduleCards, flowCards, taskCards, facts, generatedAt);
  const rulesCard = {
    generatedAt,
    ...curatedRules,
  };
  const projectFacts = buildProjectFacts(moduleCards, flowCards, taskCards, facts, generatedAt);

  writeJson(path.join(kbRoot, 'root.json'), rootCard);
  writeJson(path.join(kbRoot, 'rules.json'), rulesCard);
  writeJson(path.join(outputDirs.generated, 'project-facts.json'), projectFacts);
  writeJson(path.join(outputDirs.catalog, 'modules.json'), buildModulesCatalog(moduleCards));
  writeJson(path.join(outputDirs.catalog, 'flows.json'), buildFlowsCatalog(flowCards));
  writeJson(path.join(outputDirs.catalog, 'tasks.json'), buildTasksCatalog(taskCards));

  moduleCards.forEach((moduleCard) => {
    writeJson(path.join(outputDirs.modules, `${moduleCard.id}.json`), moduleCard);
  });
  flowCards.forEach((flowCard) => {
    writeJson(path.join(outputDirs.flows, `${flowCard.id}.json`), flowCard);
  });
  taskCards.forEach((taskCard) => {
    writeJson(path.join(outputDirs.tasks, `${taskCard.id}.json`), taskCard);
  });

  process.stdout.write(`Built knowledge base JSON under ${kbRoot}\n`);
}

main();

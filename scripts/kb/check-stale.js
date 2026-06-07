const path = require('path');

const {
  computeStaticFacts,
  existsRepoPath,
  kbRoot,
  outputDirs,
  readBuiltCollection,
  readJson,
  readText,
  sortUnique,
} = require('./common');

function fail(errors) {
  errors.forEach((error) => {
    process.stderr.write(`${error}\n`);
  });
  process.exit(1);
}

function hasSymbolInFile(relativePath, symbol) {
  if (!symbol) {
    return true;
  }

  const content = readText(relativePath);
  if (symbol === 'default') {
    return /\bexport\s+default\b/.test(content);
  }

  const regex = new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  return regex.test(content);
}

function sameStringSet(left, right) {
  const leftValue = sortUnique(left || []);
  const rightValue = sortUnique(right || []);
  return JSON.stringify(leftValue) === JSON.stringify(rightValue);
}

function check() {
  const errors = [];
  const modules = readBuiltCollection('modules');
  const flows = readBuiltCollection('flows');
  const tasks = readBuiltCollection('tasks');
  const projectFacts = readJson(path.join(outputDirs.generated, 'project-facts.json'));
  const facts = computeStaticFacts(modules);

  if (facts.moduleOwnership.ownershipAmbiguities.length > 0) {
    facts.moduleOwnership.ownershipAmbiguities.forEach((ambiguity) => {
      errors.push(
        `Source file "${ambiguity.file}" matches multiple module paths: ${ambiguity.candidates
          .map((item) => `${item.moduleId} (${item.ownedPath})`)
          .join(', ')}.`
      );
    });
  }

  if (facts.moduleOwnership.unownedFiles.length > 0) {
    errors.push(`Unowned source files: ${facts.moduleOwnership.unownedFiles.join(', ')}`);
  }

  modules.forEach((moduleCard) => {
    const actualDependsOn = facts.moduleGraph[moduleCard.id] || [];
    const actualDependedBy = facts.moduleDependents[moduleCard.id] || [];

    if (!sameStringSet(moduleCard.dependsOn, actualDependsOn)) {
      errors.push(
        `module "${moduleCard.id}" dependsOn is stale. Declared=${JSON.stringify(
          moduleCard.dependsOn
        )} actual=${JSON.stringify(actualDependsOn)}`
      );
    }

    if (!sameStringSet(moduleCard.dependedBy, actualDependedBy)) {
      errors.push(
        `module "${moduleCard.id}" dependedBy is stale. Declared=${JSON.stringify(
          moduleCard.dependedBy
        )} actual=${JSON.stringify(actualDependedBy)}`
      );
    }

    (moduleCard.publicEntrypoints || []).forEach((entrypoint) => {
      if (!existsRepoPath(entrypoint.file)) {
        errors.push(`module "${moduleCard.id}" public entry file missing: ${entrypoint.file}`);
        return;
      }

      if (entrypoint.symbol && !hasSymbolInFile(entrypoint.file, entrypoint.symbol)) {
        errors.push(
          `module "${moduleCard.id}" public entry symbol "${entrypoint.symbol}" not found in ${entrypoint.file}`
        );
      }
    });
  });

  flows.forEach((flowCard) => {
    (flowCard.steps || []).forEach((step) => {
      if (!existsRepoPath(step.file)) {
        errors.push(`flow "${flowCard.id}" step file missing: ${step.file}`);
        return;
      }

      if (step.symbol && !hasSymbolInFile(step.file, step.symbol)) {
        errors.push(`flow "${flowCard.id}" step symbol "${step.symbol}" not found in ${step.file}`);
      }
    });
  });

  tasks.forEach((taskCard) => {
    (taskCard.likelyFiles || []).forEach((relativePath) => {
      if (!existsRepoPath(relativePath)) {
        errors.push(`task "${taskCard.id}" likely file missing: ${relativePath}`);
      }
    });
  });

  if (!sameStringSet(projectFacts.sourceFiles, facts.sourceFiles)) {
    errors.push('generated/project-facts.json sourceFiles is stale. Re-run kb:build.');
  }

  modules.forEach((moduleCard) => {
    const builtGraph = projectFacts.moduleGraph?.[moduleCard.id];
    if (!builtGraph) {
      errors.push(
        `generated/project-facts.json is missing moduleGraph entry for "${moduleCard.id}".`
      );
      return;
    }

    if (!sameStringSet(builtGraph.dependsOn, facts.moduleGraph[moduleCard.id])) {
      errors.push(`generated/project-facts.json dependsOn is stale for module "${moduleCard.id}".`);
    }

    if (!sameStringSet(builtGraph.dependedBy, facts.moduleDependents[moduleCard.id])) {
      errors.push(
        `generated/project-facts.json dependedBy is stale for module "${moduleCard.id}".`
      );
    }
  });

  if (errors.length > 0) {
    fail(errors);
  }

  process.stdout.write('Knowledge base stale checks passed.\n');
}

check();

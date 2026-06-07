const path = require('path');

const {
  existsRepoPath,
  kbRoot,
  outputDirs,
  readBuiltCollection,
  readJson,
  sortUnique,
} = require('./common');

function fail(errors) {
  errors.forEach((error) => {
    process.stderr.write(`${error}\n`);
  });
  process.exit(1);
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function validateReference(reference, label, idsByType, errors) {
  if (!reference || typeof reference !== 'object') {
    errors.push(`${label} must be an object reference.`);
    return;
  }

  if (typeof reference.type !== 'string' || typeof reference.ref !== 'string') {
    errors.push(`${label} must include string type and ref.`);
    return;
  }

  if (reference.type === 'module' || reference.type === 'flow' || reference.type === 'task') {
    if (!idsByType[reference.type].has(reference.ref)) {
      errors.push(`${label} points to missing ${reference.type} id "${reference.ref}".`);
    }
    return;
  }

  if (reference.type === 'code' || reference.type === 'doc') {
    if (!existsRepoPath(reference.ref)) {
      errors.push(`${label} points to missing file "${reference.ref}".`);
    }
    return;
  }

  errors.push(`${label} uses unsupported reference type "${reference.type}".`);
}

function validateCommonCardShape(card, cardType, errors) {
  if (!card || typeof card !== 'object') {
    errors.push(`${cardType} card must be an object.`);
    return;
  }

  if (typeof card.id !== 'string' || !card.id.trim()) {
    errors.push(`${cardType} card is missing a non-empty id.`);
  }

  if (typeof card.title !== 'string' || !card.title.trim()) {
    errors.push(`${cardType} card "${card.id || '<unknown>'}" is missing a non-empty title.`);
  }
}

function validate() {
  const errors = [];

  const rootCard = readJson(path.join(kbRoot, 'root.json'));
  const rulesCard = readJson(path.join(kbRoot, 'rules.json'));
  const modules = readBuiltCollection('modules');
  const flows = readBuiltCollection('flows');
  const tasks = readBuiltCollection('tasks');
  const projectFacts = readJson(path.join(outputDirs.generated, 'project-facts.json'));

  const idsByType = {
    module: new Set(modules.map((item) => item.id)),
    flow: new Set(flows.map((item) => item.id)),
    task: new Set(tasks.map((item) => item.id)),
    rule: new Set((rulesCard.rules || []).map((item) => item.id)),
  };

  const allIds = [
    ...modules.map((item) => item.id),
    ...flows.map((item) => item.id),
    ...tasks.map((item) => item.id),
    ...(rulesCard.rules || []).map((item) => item.id),
  ];
  if (sortUnique(allIds).length !== allIds.length) {
    errors.push('All module, flow, task, and rule ids must be globally unique.');
  }

  if (rootCard.kbVersion !== 1) {
    errors.push('root.json must declare kbVersion = 1.');
  }
  if (typeof rootCard.generatedAt !== 'string') {
    errors.push('root.json must include generatedAt.');
  }
  if (!rootCard.catalogs || typeof rootCard.catalogs !== 'object') {
    errors.push('root.json must include catalogs.');
  }
  if (!Array.isArray(rootCard.layerMap)) {
    errors.push('root.json must include layerMap.');
  } else {
    rootCard.layerMap.forEach((layer, index) => {
      if (typeof layer.layer !== 'string' || !isStringArray(layer.moduleIds)) {
        errors.push(`root.layerMap[${index}] must include layer and moduleIds.`);
        return;
      }

      layer.moduleIds.forEach((moduleId) => {
        if (!idsByType.module.has(moduleId)) {
          errors.push(`root.layerMap[${index}] points to missing module "${moduleId}".`);
        }
      });
    });
  }

  if (!Array.isArray(rootCard.backgroundDocs)) {
    errors.push('root.json must include backgroundDocs.');
  } else {
    rootCard.backgroundDocs.forEach((relativePath) => {
      if (!existsRepoPath(relativePath)) {
        errors.push(`root.backgroundDocs points to missing file "${relativePath}".`);
      }
    });
  }

  if (!Array.isArray(rulesCard.rules)) {
    errors.push('rules.json must include rules array.');
  } else {
    rulesCard.rules.forEach((rule, index) => {
      validateCommonCardShape(rule, `rule[${index}]`, errors);
      if (!isStringArray(rule.appliesTo)) {
        errors.push(`rule "${rule.id}" must include appliesTo string array.`);
      } else {
        rule.appliesTo.forEach((moduleId) => {
          if (!idsByType.module.has(moduleId)) {
            errors.push(`rule "${rule.id}" points to missing module "${moduleId}".`);
          }
        });
      }
    });
  }

  modules.forEach((moduleCard) => {
    validateCommonCardShape(moduleCard, 'module', errors);

    if (typeof moduleCard.layer !== 'string') {
      errors.push(`module "${moduleCard.id}" must include layer.`);
    }
    if (!isStringArray(moduleCard.paths)) {
      errors.push(`module "${moduleCard.id}" must include paths string array.`);
    } else {
      moduleCard.paths.forEach((relativePath) => {
        if (!existsRepoPath(relativePath)) {
          errors.push(`module "${moduleCard.id}" points to missing path "${relativePath}".`);
        }
      });
    }
    if (!isStringArray(moduleCard.responsibility)) {
      errors.push(`module "${moduleCard.id}" must include responsibility string array.`);
    }
    if (!Array.isArray(moduleCard.publicEntrypoints)) {
      errors.push(`module "${moduleCard.id}" must include publicEntrypoints.`);
    } else {
      moduleCard.publicEntrypoints.forEach((entrypoint, index) => {
        if (!entrypoint || typeof entrypoint !== 'object') {
          errors.push(`module "${moduleCard.id}" publicEntrypoints[${index}] must be an object.`);
          return;
        }
        if (typeof entrypoint.file !== 'string' || !existsRepoPath(entrypoint.file)) {
          errors.push(
            `module "${moduleCard.id}" publicEntrypoints[${index}] points to missing file.`
          );
        }
      });
    }
    [
      'dependsOn',
      'dependedBy',
      'relatedFlows',
      'relatedTasks',
      'stateTouches',
      'impactChecklist',
    ].forEach((field) => {
      if (!isStringArray(moduleCard[field])) {
        errors.push(`module "${moduleCard.id}" must include ${field} string array.`);
      }
    });
    if (!Array.isArray(moduleCard.readNext)) {
      errors.push(`module "${moduleCard.id}" must include readNext references.`);
    } else {
      moduleCard.readNext.forEach((reference, index) => {
        validateReference(
          reference,
          `module "${moduleCard.id}" readNext[${index}]`,
          idsByType,
          errors
        );
      });
    }
    (moduleCard.dependsOn || []).forEach((moduleId) => {
      if (!idsByType.module.has(moduleId)) {
        errors.push(`module "${moduleCard.id}" dependsOn missing module "${moduleId}".`);
      }
    });
    (moduleCard.dependedBy || []).forEach((moduleId) => {
      if (!idsByType.module.has(moduleId)) {
        errors.push(`module "${moduleCard.id}" dependedBy missing module "${moduleId}".`);
      }
    });
    (moduleCard.relatedFlows || []).forEach((flowId) => {
      if (!idsByType.flow.has(flowId)) {
        errors.push(`module "${moduleCard.id}" relatedFlows missing flow "${flowId}".`);
      }
    });
    (moduleCard.relatedTasks || []).forEach((taskId) => {
      if (!idsByType.task.has(taskId)) {
        errors.push(`module "${moduleCard.id}" relatedTasks missing task "${taskId}".`);
      }
    });
  });

  flows.forEach((flowCard) => {
    validateCommonCardShape(flowCard, 'flow', errors);

    if (typeof flowCard.trigger !== 'string') {
      errors.push(`flow "${flowCard.id}" must include trigger.`);
    }
    if (!isStringArray(flowCard.sourceOfTruth)) {
      errors.push(`flow "${flowCard.id}" must include sourceOfTruth string array.`);
    }
    if (!Array.isArray(flowCard.steps)) {
      errors.push(`flow "${flowCard.id}" must include steps array.`);
    } else {
      flowCard.steps.forEach((step, index) => {
        if (!step || typeof step !== 'object') {
          errors.push(`flow "${flowCard.id}" steps[${index}] must be an object.`);
          return;
        }
        if (
          typeof step.order !== 'number' ||
          typeof step.label !== 'string' ||
          typeof step.moduleId !== 'string'
        ) {
          errors.push(
            `flow "${flowCard.id}" steps[${index}] must include order, label, and moduleId.`
          );
        }
        if (typeof step.file !== 'string' || !existsRepoPath(step.file)) {
          errors.push(`flow "${flowCard.id}" steps[${index}] points to missing file.`);
        }
        if (!idsByType.module.has(step.moduleId)) {
          errors.push(
            `flow "${flowCard.id}" steps[${index}] points to missing module "${step.moduleId}".`
          );
        }
      });
    }
    ['failureModes', 'mustCheckModules', 'relatedTasks'].forEach((field) => {
      if (!isStringArray(flowCard[field])) {
        errors.push(`flow "${flowCard.id}" must include ${field} string array.`);
      }
    });
    (flowCard.mustCheckModules || []).forEach((moduleId) => {
      if (!idsByType.module.has(moduleId)) {
        errors.push(`flow "${flowCard.id}" mustCheckModules missing module "${moduleId}".`);
      }
    });
    (flowCard.relatedTasks || []).forEach((taskId) => {
      if (!idsByType.task.has(taskId)) {
        errors.push(`flow "${flowCard.id}" relatedTasks missing task "${taskId}".`);
      }
    });
  });

  tasks.forEach((taskCard) => {
    validateCommonCardShape(taskCard, 'task', errors);

    ['intentKeywords', 'entryDecision', 'likelyFiles', 'acceptanceChecks'].forEach((field) => {
      if (!isStringArray(taskCard[field])) {
        errors.push(`task "${taskCard.id}" must include ${field} string array.`);
      }
    });
    if (!Array.isArray(taskCard.mustRead)) {
      errors.push(`task "${taskCard.id}" must include mustRead references.`);
    } else {
      taskCard.mustRead.forEach((reference, index) => {
        validateReference(reference, `task "${taskCard.id}" mustRead[${index}]`, idsByType, errors);
      });
    }
    if (!Array.isArray(taskCard.doNotMiss)) {
      errors.push(`task "${taskCard.id}" must include doNotMiss array.`);
    }
    (taskCard.likelyFiles || []).forEach((relativePath) => {
      if (!existsRepoPath(relativePath)) {
        errors.push(`task "${taskCard.id}" likelyFiles points to missing file "${relativePath}".`);
      }
    });
  });

  if (!Array.isArray(projectFacts.sourceFiles) || typeof projectFacts.moduleGraph !== 'object') {
    errors.push('generated/project-facts.json is missing expected fact payload.');
  }

  if (errors.length > 0) {
    fail(errors);
  }

  process.stdout.write('Knowledge base validation passed.\n');
}

validate();

const path = require('path');

const GENERATED_RELATIVE_IMPORT_PATTERN = /^(\s*import(?:[^\r\n;]*?\sfrom\s+|\s*))(["'])(\.\.?(?:\/|\\+)[^"']+)\2/gm;

function toImportPath(filePath, pathImplementation) {
  return filePath.split(pathImplementation.sep).join('/');
}

function rebaseGeneratedImportSpecifier(specifier, sourceDirectory, targetDirectory, pathImplementation) {
  const decodedSpecifier = pathImplementation.sep === '\\' ? specifier.replace(/\\\\/g, '\\') : specifier;
  const absoluteTarget = pathImplementation.resolve(sourceDirectory, decodedSpecifier);
  const relativeTarget = toImportPath(pathImplementation.relative(targetDirectory, absoluteTarget), pathImplementation);

  return relativeTarget.startsWith('.') ? relativeTarget : `./${relativeTarget}`;
}

function rewriteGeneratedWorkletImports(content, sourceDirectory, targetDirectory, pathImplementation = path) {
  return content.replace(
    GENERATED_RELATIVE_IMPORT_PATTERN,
    (_match, prefix, quote, specifier) =>
      `${prefix}${quote}${rebaseGeneratedImportSpecifier(
        specifier,
        sourceDirectory,
        targetDirectory,
        pathImplementation
      )}${quote}`
  );
}

module.exports = {
  rebaseGeneratedImportSpecifier,
  rewriteGeneratedWorkletImports
};

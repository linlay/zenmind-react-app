const fs = require('fs');
const path = require('path');

const APP_ENV_ARTIFACT = 'brands/react-app-env.json';
const GENERATED_APP_ENV_TS = 'src/shared/generated/appEnv.ts';
const APP_ENV_SCHEMA_VERSION = 2;

const SOURCE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/u;

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read React app env artifact ${filePath}: ${message}`);
  }
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`React app env field "${label}" must be a non-empty string.`);
  }
  return value.trim();
}

function optionalUrl(value, label, protocols) {
  if (value === undefined) {
    return '';
  }
  const normalized = requireString(value, label).replace(/\/+$/u, '');
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`React app env field "${label}" must be an absolute URL.`);
  }
  if (!protocols.includes(parsed.protocol)) {
    throw new Error(
      `React app env field "${label}" must use ${protocols.join(' or ')}.`
    );
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(
      `React app env field "${label}" must not include credentials, query, or hash.`
    );
  }
  return normalized;
}

function optionalString(value, label) {
  if (value === undefined) {
    return '';
  }
  return requireString(value, label);
}

function normalizeDefaultSource(source, brandId) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error(`React app env field "brands.${brandId}.defaultSource" must be an object.`);
  }

  const id = requireString(source.id, `brands.${brandId}.defaultSource.id`).toLowerCase();
  if (!SOURCE_ID_PATTERN.test(id)) {
    throw new Error(`React app env default source id is invalid: ${id}`);
  }

  const apiBaseUrl = optionalUrl(
    source.apiBaseUrl,
    `brands.${brandId}.defaultSource.apiBaseUrl`,
    ['http:', 'https:']
  );
  const wsUrl = optionalUrl(
    source.wsUrl,
    `brands.${brandId}.defaultSource.wsUrl`,
    ['ws:', 'wss:']
  );
  if (!apiBaseUrl && !wsUrl) {
    throw new Error(
      `React app env default source "${id}" must configure an API or WebSocket endpoint.`
    );
  }

  const wsPath = requireString(
    source.wsPath,
    `brands.${brandId}.defaultSource.wsPath`
  );
  if (!wsPath.startsWith('/') || wsPath.includes('?') || wsPath.includes('#')) {
    throw new Error(
      `React app env field "brands.${brandId}.defaultSource.wsPath" must be a path without query or hash.`
    );
  }
  const authMode = requireString(
    source.authMode,
    `brands.${brandId}.defaultSource.authMode`
  );
  if (authMode !== 'none' && authMode !== 'query-token') {
    throw new Error(`Unsupported React app env default source authMode: ${authMode}`);
  }
  const accessToken = optionalString(
    source.accessToken,
    `brands.${brandId}.defaultSource.accessToken`
  );
  if (authMode === 'query-token' && !accessToken) {
    throw new Error(
      `React app env field "brands.${brandId}.defaultSource.accessToken" is required for query-token.`
    );
  }
  if (authMode === 'none' && accessToken) {
    throw new Error(
      `React app env field "brands.${brandId}.defaultSource.accessToken" requires query-token.`
    );
  }

  return {
    id,
    displayName: requireString(
      source.displayName,
      `brands.${brandId}.defaultSource.displayName`
    ),
    apiBaseUrl,
    wsUrl,
    wsPath,
    authMode,
    accessToken
  };
}

function loadReactAppEnvArtifact(rootDir = process.cwd()) {
  const configuredPath = String(process.env.REACT_APP_ENV_ARTIFACT || '').trim();
  const artifactPath = configuredPath
    ? path.resolve(rootDir, configuredPath)
    : path.join(rootDir, APP_ENV_ARTIFACT);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`React app env artifact not found: ${artifactPath}`);
  }

  const artifact = readJson(artifactPath);
  if (artifact.schemaVersion !== APP_ENV_SCHEMA_VERSION) {
    throw new Error(
      `React app env schemaVersion must be ${APP_ENV_SCHEMA_VERSION}, received ${artifact.schemaVersion}.`
    );
  }
  const brands = artifact.brands;
  if (!brands || typeof brands !== 'object' || Array.isArray(brands)) {
    throw new Error('React app env field "brands" must be an object.');
  }

  return {
    schemaVersion: APP_ENV_SCHEMA_VERSION,
    artifactVersion: requireString(artifact.artifactVersion, 'artifactVersion'),
    brands: Object.fromEntries(
      Object.keys(brands)
        .sort()
        .map((brandId) => {
          const brand = brands[brandId];
          if (!brand || typeof brand !== 'object' || Array.isArray(brand)) {
            throw new Error(`React app env field "brands.${brandId}" must be an object.`);
          }
          return [
            brandId,
            {
              brandId,
              environmentId: requireString(
                brand.environmentId,
                `brands.${brandId}.environmentId`
              ),
              defaultSource: normalizeDefaultSource(brand.defaultSource, brandId)
            }
          ];
        })
    ),
    artifactPath
  };
}

function writeFileIfChanged(filePath, content) {
  const next = Buffer.from(String(content));
  if (fs.existsSync(filePath) && Buffer.compare(fs.readFileSync(filePath), next) === 0) {
    return false;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, next);
  return true;
}

function assertBrandCoverage(appEnv, brandIds) {
  const envBrandIds = Object.keys(appEnv.brands).sort();
  const expectedBrandIds = [...brandIds].sort();
  if (JSON.stringify(envBrandIds) !== JSON.stringify(expectedBrandIds)) {
    throw new Error(
      `React app env brands must match installed brands. Expected ${expectedBrandIds.join(
        ', '
      )}; received ${envBrandIds.join(', ')}.`
    );
  }
}

function syncReactAppEnvArtifact({
  rootDir = process.cwd(),
  brandIds = fs
    .readdirSync(path.join(rootDir, 'brands'), { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        fs.existsSync(path.join(rootDir, 'brands', entry.name, 'brand.json'))
    )
    .map((entry) => entry.name)
} = {}) {
  const appEnv = loadReactAppEnvArtifact(rootDir);
  assertBrandCoverage(appEnv, brandIds);
  const generatedPath = path.join(rootDir, GENERATED_APP_ENV_TS);
  const generated = [
    "import { INSTALLED_BRAND_ID } from './brand';",
    '',
    `export const REACT_APP_ENV_SCHEMA_VERSION = ${APP_ENV_SCHEMA_VERSION} as const;`,
    `export const REACT_APP_ENV_ARTIFACT_VERSION = ${JSON.stringify(
      appEnv.artifactVersion
    )} as const;`,
    '',
    `export const APP_ENVIRONMENTS = ${JSON.stringify(
      appEnv.brands,
      null,
      2
    )} as const;`,
    '',
    'export type AppEnvironment = (typeof APP_ENVIRONMENTS)[keyof typeof APP_ENVIRONMENTS];',
    'export type DefaultSourceEnvironment = AppEnvironment["defaultSource"];',
    '',
    'export const APP_ENVIRONMENT = APP_ENVIRONMENTS[INSTALLED_BRAND_ID];',
    'export const DEFAULT_SOURCE_ENVIRONMENT = APP_ENVIRONMENT.defaultSource;',
    ''
  ].join('\n');
  writeFileIfChanged(generatedPath, generated);
  return appEnv;
}

module.exports = {
  APP_ENV_ARTIFACT,
  APP_ENV_SCHEMA_VERSION,
  GENERATED_APP_ENV_TS,
  loadReactAppEnvArtifact,
  syncReactAppEnvArtifact
};

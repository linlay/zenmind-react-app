const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { APP_ENV_SCHEMA_VERSION, parseReactAppEnvArtifact } = require('./lib/app-env-config');

const appRoot = path.resolve(__dirname, '..');
const artifactFile = 'react-app-env.json';
const manifestFile = 'manifest.json';

function parseJson(content, label) {
  try {
    const value = JSON.parse(content);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch {
    // JSON parse errors can include portions of a client credential.
  }
  throw new Error(`${label} must be a JSON object.`);
}

function verifyRelease(release, releaseId, brandId, environmentId) {
  const artifact = parseJson(release.artifact, artifactFile);
  const manifest = parseJson(release.manifest, manifestFile);
  if (createHash('sha256').update(release.artifact).digest('hex') !== manifest.sha256) {
    throw new Error('SHA-256 mismatch between the env artifact and manifest.');
  }
  if (artifact.schemaVersion !== APP_ENV_SCHEMA_VERSION || manifest.schemaVersion !== artifact.schemaVersion) {
    throw new Error(`The env release must use schema v${APP_ENV_SCHEMA_VERSION}.`);
  }
  if (
    manifest.artifact !== artifactFile ||
    manifest.artifactVersion !== releaseId ||
    artifact.artifactVersion !== releaseId ||
    manifest.brandId !== artifact.brandId ||
    manifest.environment !== artifact.environmentId
  ) {
    throw new Error('Env artifact metadata does not match its manifest.');
  }
  const sourceCommit = manifest.sourceCommit;
  if (typeof sourceCommit !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64}|unversioned)$/u.test(sourceCommit)) {
    throw new Error('The env manifest must record a valid source commit.');
  }
  const { artifactVersion } = parseReactAppEnvArtifact(artifact, {
    rootDir: appRoot,
    brandId,
    env: { REACT_APP_ENVIRONMENT: environmentId }
  });
  return { artifactVersion, sourceCommit };
}

function main() {
  const [brandId, environmentId, version, location] = process.argv.slice(2);
  if (
    !location ||
    !version ||
    !/^[0-9A-Za-z][0-9A-Za-z.+_-]*$/u.test(version) ||
    !/^[a-z0-9][a-z0-9_-]*$/u.test(brandId) ||
    !['development', 'staging', 'production'].includes(environmentId)
  ) {
    throw new Error('Invalid env release target or version.');
  }
  const releasesDir = path.resolve(
    process.env.REACT_APP_ENV_RELEASES_DIR?.trim() || path.join(appRoot, '..', 'env-releases')
  );
  const releaseId = `${brandId}-${environmentId}-${version}`;
  const releasePath = path.join(releasesDir, releaseId);
  let release;
  try {
    release = {
      artifact: fs.readFileSync(path.join(releasePath, artifactFile), 'utf8'),
      manifest: fs.readFileSync(path.join(releasePath, manifestFile), 'utf8')
    };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    throw new Error(`找不到完整的 env 包 ${releaseId}：${releasePath}`);
  }
  const { artifactVersion, sourceCommit } = verifyRelease(release, releaseId, brandId, environmentId);
  fs.mkdirSync(location, { mode: 0o700 });
  fs.writeFileSync(path.join(location, artifactFile), release.artifact, { mode: 0o600 });
  fs.writeFileSync(path.join(location, manifestFile), release.manifest, { mode: 0o600 });
  process.stdout.write(`Env release ${artifactVersion} (${sourceCommit})\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}

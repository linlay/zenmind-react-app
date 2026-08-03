import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  loadReactAppEnvArtifact,
  syncReactAppEnvArtifact
} = require('../lib/app-env-config.js') as typeof import('../lib/app-env-config.js');

const inheritedArtifactPath = process.env.REACT_APP_ENV_ARTIFACT;
delete process.env.REACT_APP_ENV_ARTIFACT;
test.after(() => {
  if (inheritedArtifactPath === undefined) {
    delete process.env.REACT_APP_ENV_ARTIFACT;
  } else {
    process.env.REACT_APP_ENV_ARTIFACT = inheritedArtifactPath;
  }
});

function createFixtureRoot() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenmind-app-env-'));
  fs.mkdirSync(path.join(rootDir, 'brands', 'zenmind'), { recursive: true });
  fs.mkdirSync(path.join(rootDir, 'brands', 'cutej'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'brands', 'zenmind', 'brand.json'), '{}\n');
  fs.writeFileSync(path.join(rootDir, 'brands', 'cutej', 'brand.json'), '{}\n');
  fs.copyFileSync(
    path.join(process.cwd(), 'brands', 'react-app-env.json'),
    path.join(rootDir, 'brands', 'react-app-env.json')
  );
  return rootDir;
}

function readFixtureArtifact(rootDir: string) {
  const artifactPath = path.join(rootDir, 'brands', 'react-app-env.json');
  return {
    artifactPath,
    artifact: JSON.parse(fs.readFileSync(artifactPath, 'utf8'))
  };
}

function writeFixtureArtifact(artifactPath: string, artifact: unknown) {
  fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
}

test('schema v2 artifact generates a full runtime registry with query token', () => {
  const rootDir = createFixtureRoot();
  try {
    const artifact = syncReactAppEnvArtifact({ rootDir });
    assert.equal(artifact.schemaVersion, 2);
    assert.equal(artifact.brands.zenmind.defaultSource.id, 'zenmind-example');
    assert.equal(artifact.brands.cutej.defaultSource.authMode, 'query-token');
    assert.equal(artifact.brands.cutej.defaultSource.accessToken, 'TOKEN');

    const generated = fs.readFileSync(
      path.join(rootDir, 'src', 'shared', 'generated', 'appEnv.ts'),
      'utf8'
    );
    assert.match(generated, /APP_ENVIRONMENTS = \{/u);
    assert.match(generated, /"cutej": \{/u);
    assert.match(generated, /"accessToken": "TOKEN"/u);
    assert.match(generated, /APP_ENVIRONMENTS\[INSTALLED_BRAND_ID\]/u);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('artifact rejects missing brand coverage', () => {
  const rootDir = createFixtureRoot();
  try {
    const { artifactPath, artifact } = readFixtureArtifact(rootDir);
    delete artifact.brands.cutej;
    writeFixtureArtifact(artifactPath, artifact);

    assert.throws(
      () => syncReactAppEnvArtifact({ rootDir }),
      /brands must match installed brands/u
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('query-token requires a token and none forbids one', () => {
  const rootDir = createFixtureRoot();
  try {
    const { artifactPath, artifact } = readFixtureArtifact(rootDir);
    delete artifact.brands.zenmind.defaultSource.accessToken;
    writeFixtureArtifact(artifactPath, artifact);
    assert.throws(
      () => loadReactAppEnvArtifact(rootDir),
      /accessToken.*required for query-token/u
    );

    artifact.brands.zenmind.defaultSource.authMode = 'none';
    artifact.brands.zenmind.defaultSource.accessToken = 'unexpected-token';
    writeFixtureArtifact(artifactPath, artifact);
    assert.throws(
      () => loadReactAppEnvArtifact(rootDir),
      /accessToken.*requires query-token/u
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('explicit wsUrl remains authoritative and default transport receives the configured token', () => {
  const generated = fs.readFileSync(
    path.join(process.cwd(), 'src', 'shared', 'generated', 'appEnv.ts'),
    'utf8'
  );
  const appEnvironmentSource = fs.readFileSync(
    path.join(process.cwd(), 'src', 'core', 'config', 'appEnvironment.ts'),
    'utf8'
  );
  const activeTransportSource = fs.readFileSync(
    path.join(process.cwd(), 'src', 'core', 'api', 'activeWsTransport.ts'),
    'utf8'
  );

  assert.match(generated, /wss:\/\/zenmind\.example\.invalid\/ap\/ws/u);
  assert.match(generated, /"authMode": "query-token"/u);
  assert.match(generated, /"accessToken": "TOKEN"/u);
  assert.match(
    appEnvironmentSource,
    /resolveWsUrl\(environment\.wsUrl,\s*apiBaseUrl,\s*wsPath\)/su
  );
  assert.match(activeTransportSource, /accessToken:\s*source\.accessToken/u);
});

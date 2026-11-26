import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { loadReactAppEnvArtifact, syncReactAppEnvArtifact } =
  require('../lib/app-env-config.js') as typeof import('../lib/app-env-config.js');

const env = {};

function createFixtureRoot() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenmind-app-env-'));
  fs.mkdirSync(path.join(rootDir, 'brands', 'zenmind'), { recursive: true });
  fs.mkdirSync(path.join(rootDir, 'brands', 'cutej'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'brands', 'zenmind', 'brand.json'), '{"accountLoginMethod":"email-code"}\n');
  fs.writeFileSync(path.join(rootDir, 'brands', 'cutej', 'brand.json'), '{"accountLoginMethod":"enterprise-sso"}\n');
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

test('legacy artifact generates only the selected brand configuration', () => {
  const rootDir = createFixtureRoot();
  try {
    const artifact = syncReactAppEnvArtifact({ rootDir, brandId: 'cutej', env });
    assert.equal(artifact.schemaVersion, 2);
    assert.equal(artifact.environment.defaultSource.id, 'cutej-example');
    assert.equal(artifact.environment.defaultSource.authMode, 'query-token');
    assert.equal(artifact.environment.defaultSource.accessToken, 'TOKEN');

    const generated = fs.readFileSync(path.join(rootDir, 'src', 'shared', 'generated', 'appEnv.ts'), 'utf8');
    assert.match(generated, /APP_ENVIRONMENT = \{/u);
    assert.match(generated, /"brandId": "cutej"/u);
    assert.match(generated, /"accessToken": "TOKEN"/u);
    assert.doesNotMatch(generated, /zenmind-example|APP_ENVIRONMENTS/u);
    assert.match(generated, /INSTALLED_BRAND_ID !== APP_ENVIRONMENT.brandId/u);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('legacy artifact rejects missing target brand', () => {
  const rootDir = createFixtureRoot();
  try {
    const { artifactPath, artifact } = readFixtureArtifact(rootDir);
    delete artifact.brands.cutej;
    writeFixtureArtifact(artifactPath, artifact);

    assert.throws(() => syncReactAppEnvArtifact({ rootDir, brandId: 'cutej', env }), /no configuration for cutej/u);
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
    assert.throws(() => loadReactAppEnvArtifact(rootDir, { env }), /accessToken.*required for query-token/u);

    artifact.brands.zenmind.defaultSource.authMode = 'none';
    artifact.brands.zenmind.defaultSource.accessToken = 'unexpected-token';
    writeFixtureArtifact(artifactPath, artifact);
    assert.throws(() => loadReactAppEnvArtifact(rootDir, { env }), /accessToken.*requires query-token/u);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('explicit wsUrl remains authoritative and default transport receives the configured token', () => {
  const rootDir = createFixtureRoot();
  let generated: string;
  try {
    syncReactAppEnvArtifact({ rootDir, env });
    generated = fs.readFileSync(path.join(rootDir, 'src', 'shared', 'generated', 'appEnv.ts'), 'utf8');
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
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
  assert.match(appEnvironmentSource, /resolveWsUrl\(environment\.wsUrl,\s*apiBaseUrl,\s*wsPath\)/su);
  assert.match(appEnvironmentSource, /authMode:\s*environment\.authMode/u);
  assert.match(appEnvironmentSource, /accessToken:\s*environment\.accessToken/u);
  assert.match(activeTransportSource, /accessToken: credential.token/u);
});

test('account service matches its installed-brand method and never carries credentials', () => {
  const rootDir = createFixtureRoot();
  try {
    const { artifactPath, artifact } = readFixtureArtifact(rootDir);
    artifact.brands.zenmind.accountServices = {
      officialApiBaseUrl: 'https://official.test',
      tunnelHubApiBaseUrl: 'https://hub.test'
    };
    artifact.brands.cutej.accountServices = { ssoBaseUrl: 'https://sso.test', tunnelHubApiBaseUrl: 'https://hub.test' };
    writeFixtureArtifact(artifactPath, artifact);
    const loaded = syncReactAppEnvArtifact({ rootDir, brandId: 'cutej', env });
    assert.equal(loaded.environment.accountServices.ssoBaseUrl, 'https://sso.test');
    assert.equal(syncReactAppEnvArtifact({ rootDir, env }).environment.accountServices.ssoBaseUrl, '');
    artifact.brands.cutej.accountServices = { ...artifact.brands.zenmind.accountServices };
    writeFixtureArtifact(artifactPath, artifact);
    assert.throws(() => syncReactAppEnvArtifact({ rootDir, brandId: 'cutej', env }), /do not match/);
    artifact.brands.cutej.accountServices = {
      ssoBaseUrl: 'https://sso.test',
      officialApiBaseUrl: 'https://official.test',
      tunnelHubApiBaseUrl: 'https://hub.test'
    };
    writeFixtureArtifact(artifactPath, artifact);
    assert.throws(() => syncReactAppEnvArtifact({ rootDir, brandId: 'cutej', env }), /exactly one/);
    delete artifact.brands.cutej.accountServices.officialApiBaseUrl;
    artifact.brands.cutej.accountServices.password = 'forbidden';
    writeFixtureArtifact(artifactPath, artifact);
    assert.throws(() => syncReactAppEnvArtifact({ rootDir, brandId: 'cutej', env }), /Invalid accountServices/);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('single-brand artifact rejects a mismatched build brand and environment', (t) => {
  const rootDir = createFixtureRoot();
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));
  const { artifactPath, artifact } = readFixtureArtifact(rootDir);
  writeFixtureArtifact(artifactPath, {
    schemaVersion: 3,
    artifactVersion: 'cutej-development-3.0.0',
    brandId: 'cutej',
    ...artifact.brands.cutej,
    environmentId: 'development'
  });

  assert.throws(() => syncReactAppEnvArtifact({ rootDir, env }), /brand does not match build brand zenmind/u);
  assert.throws(
    () => syncReactAppEnvArtifact({ rootDir, brandId: 'cutej', env: { REACT_APP_ENVIRONMENT: 'production' } }),
    /does not match environment production/u
  );
  const parsed = syncReactAppEnvArtifact({
    rootDir,
    brandId: 'cutej',
    env: { REACT_APP_ENVIRONMENT: 'development' }
  });
  assert.equal(parsed.environment.brandId, 'cutej');
  assert.equal(parsed.environment.environmentId, 'development');
});

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';

function createFixture(t: TestContext) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'zenmind-eas-context-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, 'app');
  const write = (file: string, content: string) => {
    const target = path.join(app, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  };
  for (const file of ['package.sh', 'scripts/prepare-eas-context.js', 'scripts/lib/env-target.sh']) {
    write(file, fs.readFileSync(path.join(process.cwd(), file), 'utf8'));
  }
  write('package.json', '{"name":"build-fixture","version":"1.0.0"}\n');
  write('eas.json', JSON.stringify({ build: { 'preview-zenmind': { env: { BRAND: 'zenmind' } } } }));
  write('.gitignore', 'node_modules/\n.env.local\n/zenmind-app-output/\ngenerated/\n');
  write('tracked.txt', 'indexed content');
  write('deleted.txt', 'removed from working tree');
  execFileSync('git', ['-c', 'init.templateDir=', 'init', '--quiet', app]);
  execFileSync('git', ['add', '.'], { cwd: app });
  write('tracked.txt', 'current working tree content');
  fs.unlinkSync(path.join(app, 'deleted.txt'));
  write('src/new component.ts', 'export const included = true;');
  write('src/native/NewInput.kt', 'class NewInput');
  write('.env.local', 'LOCAL_ONLY=fixture');
  write('zenmind-app-output/old.apk', 'old output');
  write('generated/cache.txt', 'ignored generated file');
  write('node_modules/fixture/index.js', 'module.exports = {};');
  const envDir = path.join(root, 'env');
  fs.mkdirSync(envDir);
  fs.writeFileSync(path.join(envDir, 'react-app-env.json'), '{"fixture":true}');
  fs.writeFileSync(path.join(envDir, 'manifest.json'), '{"fixture":"manifest"}');
  return { root, app, envDir, write };
}

test('EAS context includes working tree changes and untracked sources while respecting ignores', (t) => {
  const { root, app, envDir } = createFixture(t);
  const destination = path.join(root, 'build');
  const indexBefore = fs.readFileSync(path.join(app, '.git/index'));
  const configBefore = fs.readFileSync(path.join(app, 'eas.json'));
  execFileSync(process.execPath, [
    path.join(app, 'scripts/prepare-eas-context.js'),
    destination,
    'preview-zenmind',
    'zenmind',
    'development',
    path.join(envDir, 'react-app-env.json')
  ]);

  for (const file of ['package.json', 'tracked.txt', 'src/new component.ts', 'src/native/NewInput.kt']) {
    assert.deepEqual(fs.readFileSync(path.join(destination, file)), fs.readFileSync(path.join(app, file)));
  }
  for (const file of ['deleted.txt', '.git', '.env.local', 'zenmind-app-output', 'generated']) {
    assert.equal(fs.existsSync(path.join(destination, file)), false, file);
  }
  assert.equal(fs.lstatSync(path.join(destination, 'node_modules')).isSymbolicLink(), true);
  assert.equal(fs.realpathSync(path.join(destination, 'node_modules')), path.join(app, 'node_modules'));
  for (const file of ['react-app-env.json', 'manifest.json']) {
    assert.deepEqual(
      fs.readFileSync(path.join(destination, 'env-input', file)),
      fs.readFileSync(path.join(envDir, file))
    );
  }
  const profile = JSON.parse(fs.readFileSync(path.join(destination, 'eas.json'), 'utf8')).build['preview-zenmind'];
  assert.equal(profile.environment, 'development');
  assert.equal(profile.channel, 'zenmind-development');
  assert.equal(profile.env.REACT_APP_ENV_ARTIFACT, 'env-input/react-app-env.json');
  assert.deepEqual(fs.readFileSync(path.join(app, 'eas.json')), configBefore);
  assert.deepEqual(fs.readFileSync(path.join(app, '.git/index')), indexBefore);
});

for (const scenario of [
  { name: 'local success', local: true, exitCode: 0 },
  { name: 'cloud success', local: false, exitCode: 0 },
  { name: 'local failure', local: true, exitCode: 7 }
]) {
  test(`package.sh uses the physical project root and cleans up on ${scenario.name}`, (t) => {
    const { root, app, write } = createFixture(t);
    write(
      'scripts/app-env-release.js',
      `
      const fs = require('node:fs');
      const path = require('node:path');
      const envDir = process.argv[5];
      fs.mkdirSync(envDir);
      fs.writeFileSync(path.join(envDir, 'react-app-env.json'), '{}');
      fs.writeFileSync(path.join(envDir, 'manifest.json'), '{}');
    `
    );
    const bin = path.join(root, 'bin');
    fs.mkdirSync(bin);
    // Capture the EAS invocation without running npx, installing dependencies, or building.
    fs.writeFileSync(
      path.join(bin, 'npx'),
      `#!/usr/bin/env node
      const fs = require('node:fs');
      const args = process.argv.slice(2);
      fs.writeFileSync(process.env.TEST_EAS_CAPTURE, JSON.stringify({
        cwd: process.cwd(), root: process.env.EAS_PROJECT_ROOT, args
      }));
      if (process.env.TEST_EAS_EXIT === '0' && args.includes('--output')) {
        fs.writeFileSync(args[args.indexOf('--output') + 1], 'fixture artifact');
      }
      process.exit(Number(process.env.TEST_EAS_EXIT));
    `,
      { mode: 0o755 }
    );
    const realTemp = path.join(root, 'real temp');
    const tempAlias = path.join(root, 'temp alias');
    fs.mkdirSync(realTemp);
    fs.symlinkSync(realTemp, tempAlias, 'dir');
    const capture = path.join(root, 'eas-invocation.json');
    const args = [path.join(app, 'package.sh'), 'zenmind-dev', '3.0.0', 'android'];
    if (scenario.local) args.push('--local');
    const result = spawnSync('bash', args, {
      cwd: app,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}`,
        TMPDIR: `${tempAlias}/`,
        TEST_EAS_CAPTURE: capture,
        TEST_EAS_EXIT: String(scenario.exitCode)
      }
    });
    assert.equal(result.status, scenario.exitCode, result.stderr);
    const invocation = JSON.parse(fs.readFileSync(capture, 'utf8'));
    assert.equal(invocation.root, invocation.cwd);
    assert.equal(path.dirname(path.dirname(invocation.cwd)), realTemp);
    const expectedArgs = ['eas-cli', 'build', '--platform', 'android', '--profile', 'preview-zenmind'];
    const artifact = path.join(app, 'zenmind-app-output/zenmind-development-3.0.0.apk');
    if (scenario.local) expectedArgs.push('--local', '--output', artifact);
    assert.deepEqual(invocation.args, expectedArgs);
    assert.equal(fs.existsSync(path.dirname(invocation.cwd)), false);
    assert.equal(fs.readFileSync(path.join(app, 'zenmind-app-output/old.apk'), 'utf8'), 'old output');
    assert.equal(fs.existsSync(artifact), scenario.local && scenario.exitCode === 0);
  });
}

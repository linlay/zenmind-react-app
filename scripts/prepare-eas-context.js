const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const [buildDir, profileName, brandId, environmentId, artifactPath] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(path.join(appRoot, 'eas.json'), 'utf8'));
const profile = config.build[profileName];
if (!profile || profile.env?.BRAND !== brandId) {
  throw new Error(`EAS profile ${profileName} is missing or has a different brand.`);
}

const artifactRelativePath = 'env-input/react-app-env.json';
profile.env.REACT_APP_ENV_ARTIFACT = artifactRelativePath;
profile.env.REACT_APP_ENVIRONMENT = environmentId;
if (environmentId === 'development') {
  profile.environment = 'development';
  profile.channel = `${brandId}-development`;
}

const sourceFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
  cwd: appRoot,
  encoding: 'utf8',
  env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }
})
  .split('\0')
  .filter(Boolean);

fs.mkdirSync(buildDir);
for (const file of sourceFiles) {
  const source = path.join(appRoot, file);
  const stats = fs.lstatSync(source, { throwIfNoEntry: false });
  if (!stats) continue;
  const destination = path.join(buildDir, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { verbatimSymlinks: true });
}
const appDependencies = path.join(appRoot, 'node_modules');
if (fs.existsSync(appDependencies)) {
  fs.symlinkSync(appDependencies, path.join(buildDir, 'node_modules'), 'dir');
}

const stagedArtifact = path.join(buildDir, artifactRelativePath);
fs.mkdirSync(path.dirname(stagedArtifact));
fs.copyFileSync(artifactPath, stagedArtifact);
fs.copyFileSync(
  path.join(path.dirname(artifactPath), 'manifest.json'),
  path.join(path.dirname(stagedArtifact), 'manifest.json')
);
fs.writeFileSync(path.join(buildDir, 'eas.json'), `${JSON.stringify(config, null, 2)}\n`);

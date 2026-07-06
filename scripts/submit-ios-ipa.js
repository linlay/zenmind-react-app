#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function usage() {
  return [
    'Usage: node ./scripts/submit-ios-ipa.js <eas-profile> <ipa-path>',
    '       node ./scripts/submit-ios-ipa.js <eas-profile> --path <ipa-path>',
    '',
    'Examples:',
    '  pnpm run submit:ios:zenmind:ipa -- /Users/ther/project/git/zenmind/app.ipa',
    '  pnpm run submit:ios:cutej:ipa -- ~/project/git/zenmind/app.ipa'
  ].join('\n');
}

function expandPath(input, homeDir = os.homedir(), cwd = process.cwd()) {
  const raw = String(input || '').trim();
  if (!raw) {
    return '';
  }
  if (raw === '~') {
    return homeDir;
  }
  if (raw.startsWith('~/')) {
    return path.join(homeDir, raw.slice(2));
  }
  return path.resolve(cwd, raw);
}

function parseSubmitIosIpaArgs(argv, options = {}) {
  const [profile, ...rawArgs] = argv;
  if (!profile || profile.startsWith('-')) {
    throw new Error('Missing EAS submit profile.');
  }

  const args = rawArgs.filter((arg) => arg !== '--');
  let ipaInput = '';
  const extraArgs = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--path') {
      if (ipaInput) {
        throw new Error('IPA path was provided more than once.');
      }
      ipaInput = args[index + 1] || '';
      index += 1;
      continue;
    }
    if (arg.startsWith('-')) {
      extraArgs.push(arg);
      continue;
    }
    if (ipaInput) {
      extraArgs.push(arg);
      continue;
    }
    ipaInput = arg;
  }

  if (extraArgs.length > 0) {
    throw new Error(`Unexpected argument${extraArgs.length === 1 ? '' : 's'}: ${extraArgs.join(' ')}`);
  }
  if (!ipaInput) {
    throw new Error('Missing IPA path.');
  }

  return {
    profile,
    ipaPath: expandPath(ipaInput, options.homeDir, options.cwd)
  };
}

function validateIpaPath(ipaPath) {
  if (path.extname(ipaPath).toLowerCase() !== '.ipa') {
    throw new Error(`Expected an .ipa file: ${ipaPath}`);
  }
  let stats;
  try {
    stats = fs.statSync(ipaPath);
  } catch {
    throw new Error(`IPA file not found: ${ipaPath}`);
  }
  if (!stats.isFile()) {
    throw new Error(`IPA path is not a file: ${ipaPath}`);
  }
}

function buildEasSubmitArgs(profile, ipaPath) {
  return ['eas-cli', 'submit', '-p', 'ios', '--profile', profile, '--path', ipaPath];
}

function main(argv = process.argv.slice(2), env = process.env) {
  let parsed;
  try {
    parsed = parseSubmitIosIpaArgs(argv);
    validateIpaPath(parsed.ipaPath);
  } catch (error) {
    process.stderr.write(`[submit-ios-ipa] ${error.message}\n\n${usage()}\n`);
    return 1;
  }

  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const commandArgs = buildEasSubmitArgs(parsed.profile, parsed.ipaPath);

  process.stdout.write(`[submit-ios-ipa] BRAND=${env.BRAND || ''} profile=${parsed.profile}\n`);
  process.stdout.write(`[submit-ios-ipa] path=${parsed.ipaPath}\n`);

  if (env.SUBMIT_IOS_IPA_DRY_RUN === '1') {
    process.stdout.write(`[submit-ios-ipa] dry run: ${command} ${commandArgs.map(JSON.stringify).join(' ')}\n`);
    return 0;
  }

  const result = spawnSync(command, commandArgs, {
    env,
    stdio: 'inherit'
  });

  if (result.error) {
    process.stderr.write(`[submit-ios-ipa] Failed to run ${command}: ${result.error.message}\n`);
    return 1;
  }

  return result.status ?? 1;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  buildEasSubmitArgs,
  expandPath,
  main,
  parseSubmitIosIpaArgs,
  validateIpaPath
};

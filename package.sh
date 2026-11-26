#!/usr/bin/env bash

set -euo pipefail

usage() {
  printf '%s\n' '用法: ./package.sh <目标> <env版本> <android|ios> [--local]'
  printf '%s\n' '默认使用 EAS 云构建；--local 在本机构建并保存到项目根目录的 zenmind-app-output/。'
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
  '') usage >&2; exit 1 ;;
esac
platform="${3:-}"
if [[ $# -lt 3 || $# -gt 4 || ( "$platform" != android && "$platform" != ios ) || ( $# -eq 4 && "${4:-}" != --local ) ]]; then
  usage >&2
  exit 1
fi

app_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$app_root/scripts/lib/env-target.sh"
resolve_build_target "$1"
version="$2"

profile="preview-$brand"
if [[ "$environment" == production ]]; then
  profile="production-$brand"
fi

temp_root="$(mktemp -d "${TMPDIR:-/tmp}/zenmind-app-build.XXXXXX")"
trap 'rm -rf -- "$temp_root"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

node "$app_root/scripts/app-env-release.js" "$brand" "$environment" "$version" "$temp_root/env"

build_dir="$temp_root/app"
node "$app_root/scripts/prepare-eas-context.js" \
  "$build_dir" "$profile" "$brand" "$environment" "$temp_root/env/react-app-env.json"

build_args=(--platform "$platform" --profile "$profile")
if [[ "${4:-}" == --local ]]; then
  extension=ipa
  if [[ "$platform" == android ]]; then
    extension=apk
    if [[ "$environment" == production ]]; then
      extension=aab
    fi
  fi
  output_dir="$app_root/zenmind-app-output"
  mkdir -p -- "$output_dir"
  output_file="$output_dir/$brand-$environment-$version.$extension"
  build_args+=(--local --output "$output_file")
fi

cd -- "$build_dir"
# macOS /var is a symlink; EAS_PROJECT_ROOT must match Node's physical cwd.
build_dir="$(pwd -P)"
EAS_NO_VCS=1 EAS_PROJECT_ROOT="$build_dir" \
  BRAND="$brand" REACT_APP_ENVIRONMENT="$environment" REACT_APP_ENV_ARTIFACT=env-input/react-app-env.json \
  npx eas-cli build "${build_args[@]}"

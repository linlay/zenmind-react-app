#!/usr/bin/env bash

set -euo pipefail

usage() {
  printf '%s\n' '用法: ./run.sh <目标> <env版本> <android:device|android|ios|start|web> [Expo 参数...]'
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
  '') usage >&2; exit 1 ;;
esac
if [[ $# -lt 3 ]]; then
  usage >&2
  exit 1
fi

app_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$app_root/scripts/lib/env-target.sh"
resolve_build_target "$1"
version="$2"
app_command="$3"
case "$app_command" in
  android:device|android|ios|start|web) ;;
  *) usage >&2; exit 1 ;;
esac

temp_root="$(mktemp -d "${TMPDIR:-/tmp}/zenmind-app-run.XXXXXX")"
generated_dir="$app_root/src/shared/generated"
generated_files=(appEnv.ts brand.ts)
restore_generated=0
cleanup() {
  if [[ "$restore_generated" == 1 ]]; then
    for file in "${generated_files[@]}"; do
      if [[ -f "$temp_root/$file" ]]; then
        cp -p "$temp_root/$file" "$generated_dir/$file"
      else
        rm -f -- "$generated_dir/$file"
      fi
    done
  fi
  rm -rf -- "$temp_root"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

node "$app_root/scripts/app-env-release.js" "$brand" "$environment" "$version" "$temp_root/env"
for file in "${generated_files[@]}"; do
  if [[ -f "$generated_dir/$file" ]]; then
    cp -p "$generated_dir/$file" "$temp_root/$file"
  fi
done
restore_generated=1
BRAND="$brand" REACT_APP_ENVIRONMENT="$environment" REACT_APP_ENV_ARTIFACT="$temp_root/env/react-app-env.json" \
  pnpm --dir "$app_root" "$app_command" "${@:4}"

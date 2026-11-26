resolve_build_target() {
  local target
  target="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "$target" in
    *-dev) brand="${target%-dev}"; environment=development ;;
    *-staging) brand="${target%-staging}"; environment=staging ;;
    *-prod) brand="${target%-prod}"; environment=production ;;
    *) brand="$target"; environment=production ;;
  esac
  if [[ ! "$brand" =~ ^[a-z0-9][a-z0-9_-]*$ ]]; then
    printf '%s\n' '目标名必须包含有效品牌。' >&2
    return 1
  fi
}

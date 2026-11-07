#!/bin/bash
# 日常发布只看这次选中的目录和产物身份。旁边的预览树不能误伤日常，也不能把预览包当日常发出去。
refuse_if_selected_payload_is_preview() {
  local dist="${1:-}"
  local repo="${2:-.}"
  if [[ "${ORCA_REQUIREMENT_PREVIEW:-}" == 1 ]]; then
    echo 'requirement preview env cannot publish daily Orca' >&2
    exit 1
  fi
  if [[ -f "${repo}/out/requirement-preview-build.json" ]]; then
    echo 'daily out/ contains a requirement preview marker' >&2
    exit 1
  fi
  if [[ -z "$dist" ]]; then
    return 0
  fi
  if [[ "$dist" == *requirement-preview* ]]; then
    echo 'refusing to publish a requirement preview directory as daily Orca' >&2
    exit 1
  fi
  if [[ -f "${dist}/latest-mac.yml" ]] && grep -Eq 'orca-requirement-preview|Orca Requirement Preview' "${dist}/latest-mac.yml"; then
    echo 'selected latest-mac.yml is a requirement preview payload' >&2
    exit 1
  fi
  if [[ -d "$dist" ]] && find "$dist" -name 'Orca Requirement Preview.app' -print -quit | grep -q .; then
    echo 'selected dist contains a requirement preview app' >&2
    exit 1
  fi
}

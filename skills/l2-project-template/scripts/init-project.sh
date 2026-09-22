#!/usr/bin/env bash
# 将 L2 工程模板复制到目标路径，初始化新项目脚手架。
# 用法: ./init-project.sh <target-path> [project-name]

set -euo pipefail

TARGET_PATH="${1:?Usage: init-project.sh <target-path> [project-name]}"
PROJECT_NAME="${2:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ROOT="$(dirname "$SCRIPT_DIR")"
TEMPLATE_DIR="$SKILL_ROOT/template"

if [[ ! -d "$TEMPLATE_DIR" ]]; then
  echo "Template directory not found: $TEMPLATE_DIR" >&2
  exit 1
fi

mkdir -p "$TARGET_PATH"
if [[ -n "$(ls -A "$TARGET_PATH" 2>/dev/null)" ]]; then
  echo "Target directory is not empty: $TARGET_PATH" >&2
  exit 1
fi

cp -R "$TEMPLATE_DIR"/. "$TARGET_PATH"/

# 删除模板说明 README，用 README.md.template 作为起点
rm -f "$TARGET_PATH/README.md"
if [[ -f "$TARGET_PATH/README.md.template" ]]; then
  cp "$TARGET_PATH/README.md.template" "$TARGET_PATH/README.md"
fi

if [[ -n "$PROJECT_NAME" ]]; then
  find "$TARGET_PATH" -type f \( -name '*.md' -o -name '*.template' -o -name '*.json.template' -o -name '*.js.template' \) \
    -exec sed -i "s/{project_name}/$PROJECT_NAME/g; s/{package_name}/$PROJECT_NAME/g" {} +
fi

echo "L2 project scaffold initialized at: $TARGET_PATH"
echo "Next: fill *.template files, run git init, start P0 per .cursor/workflow.md"

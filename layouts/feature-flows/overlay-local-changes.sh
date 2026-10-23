#!/usr/bin/env bash
# Chép các thay đổi CHƯA COMMIT của cây local (apps/, libs/) đè lên bản clone đã đẩy (0c052aa) để sinh trang từ một snapshot đóng băng.
# usage: overlay-sync.sh apply|revert
set -u
MAIN="/c/Users/phan.van.manhb/workspace/litmatch"
PUSH="/c/Users/phan.van.manhb/workspace/litmatch-push"
SCR="$(cd "$(dirname "$0")" && pwd)"
MANIFEST="$SCR/.overlay-manifest.txt"
mode="${1:-apply}"

cd "$PUSH" || exit 1
echo "push pwd: $(pwd)"
head_now="$(git rev-parse --short HEAD)"
[ "$head_now" = "0c052aa" ] || { echo "HEAD là $head_now, không phải 0c052aa — dừng"; exit 1; }

if [ "$mode" = "revert" ]; then
  [ -f "$MANIFEST" ] || { echo "không có manifest"; exit 0; }
  while IFS=$'\t' read -r kind path; do
    [ -n "$path" ] || continue
    case "$kind" in
      M) git checkout -- "$path" ;;
      N) rm -f -- "$path" ;;
    esac
  done < "$MANIFEST"
  rm -f "$MANIFEST"
  echo "đã hoàn tác overlay"
  git status --porcelain | grep -v '^?? layouts/feature-flows/' | head
  exit 0
fi

# apply: bản clone phải sạch (ngoài generator chưa theo dõi)
dirty="$(git status --porcelain | grep -v '^?? layouts/feature-flows/' || true)"
if [ -n "$dirty" ] && [ ! -f "$MANIFEST" ]; then
  echo "clone push đang có thay đổi ngoài overlay:"; echo "$dirty" | head; exit 1
fi
[ -f "$MANIFEST" ] && "$0" revert

: > "$MANIFEST"
cd "$MAIN" || exit 1
echo "main pwd: $(pwd)"
git status --porcelain=v1 --untracked-files=all -- apps libs | while IFS= read -r line; do
  st="${line:0:2}"; path="${line:3}"
  case "$st" in
    " M"|"M "|"MM"|"AM"|"A ")
      kind="M"; git -C "$PUSH" cat-file -e "HEAD:$path" 2>/dev/null || kind="N" ;;
    "??") kind="N" ;;
    *) echo "bỏ qua trạng thái lạ: $line"; continue ;;
  esac
  mkdir -p "$(dirname "$PUSH/$path")"
  cp -f "$MAIN/$path" "$PUSH/$path"
  printf '%s\t%s\n' "$kind" "$path" >> "$MANIFEST"
done
echo "overlay: $(wc -l < "$MANIFEST") file"
cut -f1 "$MANIFEST" | sort | uniq -c

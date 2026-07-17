#!/bin/sh
set -eu

# Compose bind-mounts source từ host. Chạy process theo owner của /workspace để cache/.next/dist
# vẫn sửa được từ host, kể cả khi UID developer không phải 1000 (thường gặp ở máy công ty).
if [ "$(id -u)" = '0' ] && [ -d /workspace ]; then
  workspace_uid="$(stat -c '%u' /workspace)"
  workspace_gid="$(stat -c '%g' /workspace)"

  mkdir -p /workspace/node_modules /pnpm/store /pnpm/.cache
  chown "${workspace_uid}:${workspace_gid}" \
    /workspace/node_modules /pnpm /pnpm/store /pnpm/.cache

  # su-exec đổi HOME thành `/` nếu UID host không tồn tại trong /etc/passwd của image. Corepack
  # sẽ khi đó cố tạo `/.cache/...` và fail EACCES; đặt tường minh home/cache writable sau su-exec.
  exec su-exec "${workspace_uid}:${workspace_gid}" \
    env HOME=/pnpm XDG_CACHE_HOME=/pnpm/.cache COREPACK_HOME=/pnpm/.cache/node/corepack "$@"
fi

exec "$@"

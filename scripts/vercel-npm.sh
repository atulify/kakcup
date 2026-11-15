#!/bin/sh
set -eu

# Vercel exports npm_config_cache_dir, but npm recognizes npm_config_cache.
if [ -n "${npm_config_cache_dir:-}" ]; then
  export npm_config_cache="${npm_config_cache:-$npm_config_cache_dir}"
  unset npm_config_cache_dir
fi

exec npm "$@"

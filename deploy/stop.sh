#!/usr/bin/env bash
set -euo pipefail

docker rm -f todo-frontend todo-backend todo-db 2>/dev/null || true
echo "Application containers stopped."
echo "The PostgreSQL volume was NOT deleted."

#!/usr/bin/env bash
set -euo pipefail

docker ps --filter "name=todo-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo
echo "Backend health:"
docker exec todo-backend wget -qO- http://localhost:3000/api/health || true

echo
echo "Frontend health:"
curl -fsS http://localhost/api/health || true
echo

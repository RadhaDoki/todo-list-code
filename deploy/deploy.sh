#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/todo-devops-lab}"
NETWORK="${NETWORK:-todo-net}"
DB_VOLUME="${DB_VOLUME:-todo-postgres-data}"

cd "$APP_DIR"

if [ ! -f .env ]; then
  echo ".env not found in $APP_DIR"
  echo "Create it from deploy/.env.example and fill in real values."
  exit 1
fi

set -a
source .env
set +a

: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${JWT_SECRET:?JWT_SECRET is required}"
: "${OTP_DELIVERY_MODE:?OTP_DELIVERY_MODE is required}"

DB_PASSWORD_URLENCODED="$(python3 -c 'import os, urllib.parse; print(urllib.parse.quote(os.environ["POSTGRES_PASSWORD"], safe=""))')"

if [ "$OTP_DELIVERY_MODE" != "console" ]; then
  echo "Iteration 1 requires OTP_DELIVERY_MODE=console. SES will be added in Iteration 2."
  exit 1
fi

echo "Creating Docker network..."
docker network inspect "$NETWORK" >/dev/null 2>&1 || docker network create "$NETWORK"

echo "Creating persistent DB volume..."
docker volume inspect "$DB_VOLUME" >/dev/null 2>&1 || docker volume create "$DB_VOLUME"

echo "Stopping old application containers..."
docker rm -f todo-frontend todo-backend todo-db 2>/dev/null || true

echo "Building backend..."
docker build -t todo-backend:latest ./backend

echo "Building frontend..."
docker build -t todo-frontend:latest ./frontend

echo "Starting PostgreSQL..."
docker run -d \
  --name todo-db \
  --network "$NETWORK" \
  --restart unless-stopped \
  -e POSTGRES_DB="$POSTGRES_DB" \
  -e POSTGRES_USER="$POSTGRES_USER" \
  -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  -v "$DB_VOLUME:/var/lib/postgresql/data" \
  -v "$APP_DIR/backend/db/init.sql:/docker-entrypoint-initdb.d/001-init.sql:ro" \
  postgres:16-alpine

echo "Waiting for PostgreSQL..."
for i in $(seq 1 30); do
  if docker exec todo-db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then break; fi
  sleep 2
done
docker exec todo-db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"

echo "Applying database migration..."
docker exec -i todo-db psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" < ./backend/db/migrate-email.sql

echo "Starting backend..."
docker run -d \
  --name todo-backend \
  --network "$NETWORK" \
  --restart unless-stopped \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e DATABASE_URL="postgres://${POSTGRES_USER}:${DB_PASSWORD_URLENCODED}@todo-db:5432/${POSTGRES_DB}" \
  -e JWT_SECRET="$JWT_SECRET" \
  -e OTP_TTL_MINUTES="${OTP_TTL_MINUTES:-5}" \
  -e OTP_MAX_ATTEMPTS="${OTP_MAX_ATTEMPTS:-5}" \
  -e OTP_RESEND_COOLDOWN_SECONDS="${OTP_RESEND_COOLDOWN_SECONDS:-60}" \
  -e OTP_DELIVERY_MODE="$OTP_DELIVERY_MODE" \
  -e OTP_FIXED="${OTP_FIXED:-}" \
  todo-backend:latest

echo "Starting frontend..."
docker run -d \
  --name todo-frontend \
  --network "$NETWORK" \
  --restart unless-stopped \
  -e BACKEND_URL="http://todo-backend:3000" \
  -p 80:80 \
  todo-frontend:latest

echo "Waiting for backend..."
for i in $(seq 1 30); do
  if docker exec todo-backend wget -qO- http://localhost:3000/api/health >/dev/null 2>&1; then break; fi
  sleep 2
done

echo "Backend health:"
docker exec todo-backend wget -qO- http://localhost:3000/api/health

echo
echo "Frontend health:"
curl -fsS http://localhost/api/health

echo
echo "Deployment successful."
docker ps --filter "name=todo-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

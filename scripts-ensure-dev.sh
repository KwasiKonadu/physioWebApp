#!/bin/bash
# Ensure the Next.js dev server is up on :3000; wait for readiness.
# Usage: ./scripts-ensure-dev.sh [max_wait_seconds]
MAX=${1:-40}
if curl -s -o /dev/null --max-time 3 http://localhost:3000/ 2>/dev/null; then
  echo "dev: already up"
  exit 0
fi
cd /home/z/my-project
nohup bun run dev > dev.log 2>&1 &
for i in $(seq 1 "$MAX"); do
  sleep 1
  if curl -s -o /dev/null --max-time 3 http://localhost:3000/ 2>/dev/null; then
    echo "dev: ready after ${i}s"
    exit 0
  fi
done
echo "dev: FAILED to start in ${MAX}s"
exit 1

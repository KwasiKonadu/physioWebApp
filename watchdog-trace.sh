#!/bin/bash
# Trace wrapper: logs signals received, runs next dev
cd /home/z/my-project
exec_log=/tmp/dev-trace.log
echo "[$(date +%H:%M:%S)] wrapper start" >> $exec_log
trap 'echo "[$(date +%H:%M:%S)] got SIGTERM" >> $exec_log; exit 143' SIGTERM
trap 'echo "[$(date +%H:%M:%S)] got SIGINT" >> $exec_log; exit 130' SIGINT
trap 'echo "[$(date +%H:%M:%S)] got SIGHUP" >> $exec_log; exit 129' SIGHUP
trap 'echo "[$(date +%H:%M:%S)] got SIGQUIT" >> $exec_log; exit 131' SIGQUIT
exec bun run dev

#!/usr/bin/env bash
# تشغيل/إيقاف سيرفرَي الجسر الوهميين (أساسي 18081 واحتياطي 18082) بملفات PID.
#   tests/bridge/servers.sh start|stop|restart [primary|fallback|all]
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
RUN="${BRIDGE_RUN_DIR:-/tmp/ehsmaha-bridge-test}"
mkdir -p "$RUN"
which="${2:-all}"

start_one() { # name port ctlport
  local name=$1 port=$2 ctl=$3
  if [ -f "$RUN/$name.pid" ] && kill -0 "$(cat "$RUN/$name.pid")" 2>/dev/null; then return; fi
  PORT=$port CTL_PORT=$ctl nohup node "$DIR/start-server.js" >"$RUN/$name.log" 2>&1 &
  echo $! >"$RUN/$name.pid"
  for _ in $(seq 1 50); do curl -s "http://127.0.0.1:$port/healthz" >/dev/null 2>&1 && return; sleep 0.1; done
  echo "failed to start $name" >&2
}
stop_one() {
  local name=$1
  [ -f "$RUN/$name.pid" ] || return 0
  kill "$(cat "$RUN/$name.pid")" 2>/dev/null
  rm -f "$RUN/$name.pid"
}
each() {
  case "$which" in
    primary) "$1" primary 18081 19081 ;;
    fallback) "$1" fallback 18082 19082 ;;
    *) "$1" primary 18081 19081; "$1" fallback 18082 19082 ;;
  esac
}
start_w() { start_one "$@"; }
stop_w() { stop_one "$1"; }
case "${1:-}" in
  start) each start_w ;;
  stop) each stop_w ;;
  restart) each stop_w; sleep 0.5; each start_w ;;
  *) echo "usage: $0 start|stop|restart [primary|fallback|all]"; exit 1 ;;
esac

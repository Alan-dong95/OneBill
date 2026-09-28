#!/bin/bash
set -euo pipefail
SRC=/tmp/onebill-unpack
DST=/opt/onebill/server
test -d "$SRC/app" || { echo "missing unpack"; exit 1; }
cd "$SRC"
shopt -s nullglob dotglob
for item in * .[!.]*; do
  [ -e "$item" ] || continue
  base=$(basename "$item")
  case "$base" in
    .|.env|.venv) echo "skip $base"; continue ;;
  esac
  echo "sync $base"
  rm -rf "$DST/$base"
  cp -a "$item" "$DST/"
done
echo "preserve check:"
test -f "$DST/.env" && echo env-ok
test -d "$DST/.venv" && echo venv-ok
ls "$DST/app/routers/"
cd "$DST"
# shellcheck disable=SC1091
. .venv/bin/activate
pip install -r requirements.txt -q
alembic upgrade head
systemctl restart onebill
sleep 2
systemctl is-active onebill
curl -sS http://127.0.0.1:8000/health; echo
grep -n "create_bills_batch\|/batch" "$DST/app/routers/bills.py" | head -5
curl -sS http://127.0.0.1:8000/openapi.json | python -c "import sys,json; print('batch_route', '/api/v1/bills/batch' in json.load(sys.stdin).get('paths', {}))"

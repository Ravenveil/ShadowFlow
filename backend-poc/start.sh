#!/usr/bin/env sh
set -e
cd "$(dirname "$0")"
echo "ShadowFlow backend engine (MVP) -> http://127.0.0.1:8787"
python3 -m pip install -r requirements.txt --quiet
exec python3 run.py

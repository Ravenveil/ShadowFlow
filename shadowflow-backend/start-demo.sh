#!/bin/sh
# 演示模式：自动准备干净演示库再启动。
# 用法：sh start-demo.sh
set -e
cd "$(dirname "$0")"
echo "============================================"
echo " ShadowFlow - demo mode (clean data)"
echo " Opens http://127.0.0.1:8787"
echo "============================================"
python -m pip install -r requirements.txt --quiet
python tools/demo_reset.py
SF_DATA_DIR=data/demo-run python run.py

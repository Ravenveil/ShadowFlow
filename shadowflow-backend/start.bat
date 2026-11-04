@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  ShadowFlow backend engine (MVP)
echo  Open http://127.0.0.1:8787 after start
echo ============================================
python -m pip install -r requirements.txt --quiet
python run.py
pause

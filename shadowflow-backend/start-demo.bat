@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  ShadowFlow - demo mode (clean data)
echo  Opens http://127.0.0.1:8787
echo ============================================
python -m pip install -r requirements.txt --quiet
python tools\demo_reset.py
if errorlevel 1 pause & exit /b 1
echo.
echo Starting service with clean demo data...
set SF_DATA_DIR=data/demo-run
python run.py
pause

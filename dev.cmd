@echo off
REM Works when global Node is 16 — does not call nvm use.
cd /d "%~dp0"
node "%~dp0scripts\dev.js" %*

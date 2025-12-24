 @echo off
chcp 65001 > nul
setlocal

REM ==== APIキー（公開しないこと）====
set GEMINI_API_KEY=YOUR_API_KEY_HERE

start node.bat
start python.bat
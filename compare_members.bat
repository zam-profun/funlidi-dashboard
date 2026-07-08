@echo off
cd /d "%~dp0"
mode con: cols=120 lines=9999
python compare_members.py
start "" notepad "full_report.txt"
pause

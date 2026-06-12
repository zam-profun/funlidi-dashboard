@echo off
cd /d "%~dp0"

echo Creating .gitignore...
if not exist .gitignore (
    echo .env>.gitignore
    echo __pycache__/>>.gitignore
    echo *.pyc>>.gitignore
    echo .env.example>>.gitignore
)

if not exist .git (
    echo Initializing git repo...
    git init
)

echo Adding files...
git add .

echo Committing...
git commit -m "Fix: parse DONACION LOGISTICA + ARITA LA PLEVEYA records, add PAGOS dashboard section"

echo Pushing to GitHub...
git remote remove origin 2>nul
git remote add origin https://github.com/zam-profun/funlidi-dashboard.git
git branch -M main
git push -u origin main

echo Done!
pause

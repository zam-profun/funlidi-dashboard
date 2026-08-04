@echo off
cd /d "%~dp0"

echo Creating .gitignore...
if not exist .gitignore (
    echo .env>.gitignore
    echo __pycache__/>>.gitignore
    echo *.pyc>>.gitignore
    echo .env.example>>.gitignore
    echo .creds-funlidi>>.gitignore
)

if not exist .git (
    echo Initializing git repo...
    git init
)

echo Reading credentials from .env...
set "GITHUB_USER="
set "GITHUB_PAT="
for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
    if /i "%%a"=="GITHUB_USER" set "GITHUB_USER=%%b"
    if /i "%%a"=="GITHUB_PAT" set "GITHUB_PAT=%%b"
)

if not defined GITHUB_USER (
    echo [ERROR] Falta GITHUB_USER en .env
    pause
    exit /b 1
)
if not defined GITHUB_PAT (
    echo [ERROR] Falta GITHUB_PAT en .env
    pause
    exit /b 1
)

echo Writing local credential file...
> "%~dp0.creds-funlidi" echo https://%GITHUB_USER%:%GITHUB_PAT%@github.com

echo Configuring git credentials for this repo...
git config credential.https://github.com.username %GITHUB_USER%
git config credential.helper "store --file=%~dp0.creds-funlidi"

echo Adding files...
git add .

echo Committing...
git commit -m "Add B. DATOS - FARLEY CRM module with 5 sections + CONSULTA integration"

echo Pushing to GitHub...
git remote remove origin 2>nul
git remote add origin https://%GITHUB_USER%@github.com/zam-profun/funlidi-dashboard.git
git branch -M main
git push -u origin main

echo Done!
pause

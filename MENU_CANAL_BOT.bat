@echo off
REM ============================================================
REM  MENU CANAL vs BOT - comparar miembros Telegram con Supabase
REM ============================================================
chcp 65001 >nul
cd /d "%~dp0"

set PY=C:\Users\amazi\AppData\Local\Programs\Python\Python313\python.exe
if not exist "%PY%" set PY=python

:MENU
cls
echo.
echo  ============================================================
echo    MENU CANAL vs BOT - TELEGRAM vs SUPABASE
echo  ============================================================
echo.
echo   [1]  Consola grafica (elegir grupo admin + tabla, con buscadores)
echo   [2]  Listar mis grupos admin (solo descubrimiento, sin fetch)
echo   [3]  Comparar rapido por IDs (fetch + BOT-CIS, sin GUI)
echo   [4]  Instalar dependencias (pyrogram, supabase, openpyxl)
echo   [5]  Anadir cuenta Telegram (telefono -^> codigo -^> 2FA)
echo   [6]  Listar cuentas Telegram registradas
echo   [0]  Salir
echo.
set /p opt=Seleccione una opcion:

if "%opt%"=="1" ("%PY%" consola_canal.py & goto DONE)
if "%opt%"=="2" ("%PY%" consola_canal.py --list-groups & goto DONE)
if "%opt%"=="3" goto QUICK
if "%opt%"=="4" ("%PY%" -m pip install -r canal_vs_bot\requirements.txt & goto DONE)
if "%opt%"=="5" ("%PY%" consola_canal.py --add-account & goto DONE)
if "%opt%"=="6" ("%PY%" consola_canal.py --list-sessions & goto DONE)
if "%opt%"=="0" exit /b

goto MENU

:QUICK
echo.
set /p chat=ID del grupo/canal (ej. -1004286637959):
set /p tbl=Tabla [por defecto clientes_cis]:
if "%tbl%"=="" set tbl=clientes_cis
"%PY%" consola_canal.py --quick %chat% --project INVENTARIO --table %tbl%
goto DONE

:DONE
echo.
pause
goto MENU

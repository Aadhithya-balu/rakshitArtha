@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem =========================================================
rem RakshitArtha Full Startup (Backend + Frontend + Phone)
rem - Insurance backend (5000)
rem - Automation backend (3000)
rem - Frontend metro (8081)
rem - ADB reverse tunnels for device
rem =========================================================

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

set "INSURANCE_DIR=%ROOT%\Backend\insurance-module"
set "AUTOMATION_DIR=%ROOT%\automation-system"
set "FRONTEND_DIR=%ROOT%\FRONTEND"
set "LOCAL_PROPERTIES=%FRONTEND_DIR%\android\local.properties"
set "DRY_RUN=0"
if /I "%~1"=="--dry-run" set "DRY_RUN=1"

echo.
echo ========================================================
echo   RakshitArtha Full Startup
echo ========================================================
echo Root: %ROOT%
echo.

call :require_command node
if errorlevel 1 goto :fatal
call :require_command npm
if errorlevel 1 goto :fatal
call :require_command npx
if errorlevel 1 goto :fatal

call :require_dir "%INSURANCE_DIR%" "Insurance backend"
if errorlevel 1 goto :fatal
call :require_dir "%AUTOMATION_DIR%" "Automation backend"
if errorlevel 1 goto :fatal
call :require_dir "%FRONTEND_DIR%" "Frontend"
if errorlevel 1 goto :fatal

call :resolve_adb

if "%DRY_RUN%"=="1" (
    echo [DRY-RUN] Directory and command checks passed.
    echo [DRY-RUN] No service was started.
    goto :finish
)

call :start_service "Insurance Backend" "%INSURANCE_DIR%" "npm start" 5000
call :start_service "Automation Backend" "%AUTOMATION_DIR%" "npm start" 3000
call :start_service "Metro Server" "%FRONTEND_DIR%" "npx react-native start --reset-cache" 8081

if not defined ADB_EXE (
    echo [WARN] ADB not found. Skipping reverse tunnel setup.
    goto :summary
)

call :configure_adb_reverse

:summary
echo.
echo ========================================================
echo   Startup command completed
echo ========================================================
echo Services expected:
echo   - Insurance backend: http://127.0.0.1:5000/health
echo   - Automation backend: http://127.0.0.1:3000
echo   - Metro server:       http://127.0.0.1:8081/status
echo.
echo If phone is connected, reverse tunnels are configured for 5000/3000/8081.

:finish
echo.
pause
exit /b 0

:fatal
echo.
echo Startup aborted due to missing prerequisites.
echo.
pause
exit /b 1

:require_command
where %~1 >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Required command not found in PATH: %~1
    exit /b 1
)
exit /b 0

:require_dir
pushd "%~1" >nul 2>nul
if errorlevel 1 (
    echo [ERROR] %~2 directory missing: %~1
    echo [HINT] Open this script from the project root folder.
    exit /b 1
)
popd
exit /b 0

:resolve_adb
set "ADB_EXE="
set "SDK_DIR="

if exist "%LOCAL_PROPERTIES%" (
    for /f "usebackq tokens=1,* delims==" %%A in ("%LOCAL_PROPERTIES%") do (
        if /I "%%A"=="sdk.dir" set "SDK_DIR=%%B"
    )
)

if defined SDK_DIR (
    set "SDK_DIR=%SDK_DIR:\=\%"
)

if not defined SDK_DIR if defined ANDROID_SDK_ROOT set "SDK_DIR=%ANDROID_SDK_ROOT%"
if not defined SDK_DIR if defined ANDROID_HOME set "SDK_DIR=%ANDROID_HOME%"
if not defined SDK_DIR set "SDK_DIR=%LOCALAPPDATA%\Android\Sdk"

if exist "%SDK_DIR%\platform-tools\adb.exe" (
    set "ADB_EXE=%SDK_DIR%\platform-tools\adb.exe"
    set "PATH=%SDK_DIR%\platform-tools;%PATH%"
    exit /b 0
)

for /f "delims=" %%A in ('where adb 2^>nul') do (
    set "ADB_EXE=%%A"
    goto :resolve_adb_done
)

:resolve_adb_done
if defined ADB_EXE (
    echo [OK] Using ADB: %ADB_EXE%
) else (
    echo [WARN] adb.exe not found in SDK or PATH.
)
exit /b 0

:start_service
set "TITLE=%~1"
set "WORK_DIR=%~2"
set "START_CMD=%~3"
set "PORT=%~4"

call :is_listening %PORT%
if !errorlevel! EQU 0 (
    echo [OK] %TITLE% already running on port %PORT%.
    exit /b 0
)

echo [INFO] Starting %TITLE% on port %PORT%...
start "%TITLE%" cmd /k "cd /d ""%WORK_DIR%"" && %START_CMD%"
exit /b 0

:is_listening
netstat -ano | findstr /R /C:":%~1 .*LISTENING" >nul 2>nul
if errorlevel 1 (exit /b 1) else (exit /b 0)

:configure_adb_reverse
"%ADB_EXE%" start-server >nul 2>nul
set "DEVICE_ID="

for /f "skip=1 tokens=1,2" %%A in ('"%ADB_EXE%" devices') do (
    if "%%B"=="device" (
        set "DEVICE_ID=%%A"
        goto :device_found
    )
)

:device_found
if not defined DEVICE_ID (
    echo [WARN] No authorized Android device detected.
    echo [HINT] Connect phone, enable USB debugging, then run this script again.
    exit /b 0
)

echo [OK] Phone detected: %DEVICE_ID%
echo [INFO] Applying ADB reverse tunnels...
"%ADB_EXE%" -s %DEVICE_ID% reverse tcp:5000 tcp:5000 >nul 2>nul
"%ADB_EXE%" -s %DEVICE_ID% reverse tcp:3000 tcp:3000 >nul 2>nul
"%ADB_EXE%" -s %DEVICE_ID% reverse tcp:8081 tcp:8081 >nul 2>nul
echo [OK] Reverse tunnel set for ports 5000, 3000, 8081.
exit /b 0

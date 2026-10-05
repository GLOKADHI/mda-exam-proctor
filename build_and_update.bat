@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo       MdaExamBrowserr Build and Update System
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/5] Compiling MdaExamBrowserr.exe launcher...
"C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:winexe /win32icon:mda_exam_logo.ico /out:MdaExamBrowserr.exe Launcher.cs
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to compile MdaExamBrowserr.exe with csc.exe.
    exit /b %ERRORLEVEL%
)
if not exist dist mkdir dist
copy /y MdaExamBrowserr.exe dist\MdaExamBrowserr.exe >nul

REM Remove legacy main.exe if present
if exist "main.exe" del /f /q "main.exe" >nul 2>&1
if exist "dist\main.exe" del /f /q "dist\main.exe" >nul 2>&1

echo [OK] MdaExamBrowserr.exe compiled successfully.
echo.

echo [2/5] Building application package with PyInstaller...
"C:\Program Files\Python314\python.exe" -m PyInstaller ProctorIQ.spec --noconfirm
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] PyInstaller reported non-zero code. Checking build directory...
    if exist "build\ProctorIQ\ProctorIQ.exe" (
        echo Copying built executable from build directory...
        copy /y "build\ProctorIQ\ProctorIQ.exe" "dist\ProctorIQ\ProctorIQ.exe" >nul
    )
) else (
    echo [OK] PyInstaller build succeeded.
)
echo.

echo [3/5] Synchronizing latest frontend assets and scripts...
powershell -Command "$files = @('index.html','style.css','quiz.js','proctor.js','app.js','api.js','leetcode.js','sql_catalog.js','config.js','highlight.css','highlight.min.js','marked.min.js','chat.js','custom_tests.json','cookie.txt','mda_exam_logo.ico','mda_exam_logo.png'); foreach ($f in $files) { if (Test-Path $f) { if (Test-Path 'dist\ProctorIQ') { Copy-Item -Path $f -Destination 'dist\ProctorIQ\' -Force }; if (Test-Path 'dist\ProctorIQ\_internal') { Copy-Item -Path $f -Destination 'dist\ProctorIQ\_internal\' -Force } } }"
echo [OK] Static assets and scripts synchronized.
echo.

echo [4/5] Updating Desktop shortcuts...
powershell -ExecutionPolicy Bypass -File "%~dp0create_desktop_shortcuts.ps1"
echo [OK] Desktop shortcut for MdaExamBrowserr updated.
echo.

echo [5/5] Verification:
if exist "MdaExamBrowserr.exe" echo  - Root MdaExamBrowserr.exe: Present
if exist "dist\MdaExamBrowserr.exe" echo  - dist\MdaExamBrowserr.exe: Present
if exist "dist\ProctorIQ\ProctorIQ.exe" echo  - dist\ProctorIQ\ProctorIQ.exe: Present
echo.
echo ========================================================
echo       Build and update completed successfully!
echo ========================================================

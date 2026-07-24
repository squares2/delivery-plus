@echo off
REM ============================================================
REM deploy.bat — Run this before every upload to GitHub/server
REM Stamps sw.js with current timestamp so cache busts on deploy.
REM ============================================================

REM Always run relative to this script's own folder, no matter
REM where it's launched from (double-click, terminal, shortcut, etc.)
cd /d "%~dp0"

echo [Delivo Deploy] Stamping service worker with build timestamp...

REM Generate timestamp (YYYYMMDDHHMMSS format) via PowerShell (more reliable than wmic)
for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMddHHmmss"') do set BUILD_TS=%%I

REM Restore __BUILD_TS__ placeholder first (in case deploy.bat was run twice).
REM -Encoding UTF8 on BOTH Get-Content and Set-Content is required here —
REM sw.js is UTF-8 without a BOM and contains em-dashes/box-drawing characters
REM in its comments. Windows PowerShell 5.1 defaults Get-Content/Set-Content
REM to ASCII when no encoding is given, which silently mangles those
REM characters into "?" on every single deploy. Forcing UTF8 explicitly
REM avoids that corruption entirely.
powershell -NoProfile -Command "(Get-Content -Encoding UTF8 sw.js) -replace 'const BUILD_TS\s*=\s*''[^'']*''', 'const BUILD_TS    = ''__BUILD_TS__''' | Set-Content -Encoding UTF8 sw.js"

REM Now replace __BUILD_TS__ with the actual timestamp
powershell -NoProfile -Command "(Get-Content -Encoding UTF8 sw.js) -replace '__BUILD_TS__', '%BUILD_TS%' | Set-Content -Encoding UTF8 sw.js"

echo [Delivo Deploy] sw.js stamped with: %BUILD_TS%

REM Verify the stamp actually took effect before declaring success
findstr /C:"%BUILD_TS%" sw.js >nul
if %errorlevel%==0 (
    echo [Delivo Deploy] Verified: sw.js contains the new timestamp.
) else (
    echo [Delivo Deploy] WARNING: Could not verify the timestamp was written!
    echo [Delivo Deploy] Check sw.js manually before uploading.
)

echo [Delivo Deploy] Now upload all files to GitHub Pages / your server.
echo [Delivo Deploy] Done!
pause
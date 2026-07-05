@echo off
REM ============================================================
REM deploy.bat — Run this before every upload to GitHub/server
REM Stamps sw.js with current timestamp so cache busts on deploy.
REM ============================================================

echo [Delivo Deploy] Stamping service worker with build timestamp...

REM Generate timestamp (YYYYMMDDHHMMSS format) via PowerShell (more reliable than wmic)
for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMddHHmmss"') do set BUILD_TS=%%I

REM Restore __BUILD_TS__ placeholder first (in case deploy.bat was run twice)
powershell -NoProfile -Command "(Get-Content sw.js) -replace 'const BUILD_TS\s*=\s*''[^'']*''', 'const BUILD_TS    = ''__BUILD_TS__''' | Set-Content sw.js"

REM Now replace __BUILD_TS__ with the actual timestamp
powershell -NoProfile -Command "(Get-Content sw.js) -replace '__BUILD_TS__', '%BUILD_TS%' | Set-Content sw.js"

echo [Delivo Deploy] sw.js stamped with: %BUILD_TS%
echo [Delivo Deploy] Now upload all files to GitHub Pages / your server.
echo [Delivo Deploy] Done!
pause

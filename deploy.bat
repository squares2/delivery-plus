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

REM Stamp the SAME timestamp into index.html (window.APP_VERSION) and
REM version.json. pwa.js compares these two to detect a new deploy and
REM auto-refresh customers onto it, so they must always match sw.js.
REM Written as UTF-8 without BOM via .NET so the Arabic text stays intact.
powershell -NoProfile -Command "$p=(Resolve-Path 'index.html').Path; $t=[IO.File]::ReadAllText($p,[Text.Encoding]::UTF8); $t=[regex]::Replace($t,'window\.APP_VERSION\s*=\s*''[^'']*''','window.APP_VERSION = ''%BUILD_TS%'''); [IO.File]::WriteAllText($p,$t,(New-Object Text.UTF8Encoding $false))"
powershell -NoProfile -Command "$q=[char]34; $j='{ '+$q+'version'+$q+': '+$q+'%BUILD_TS%'+$q+' }'; [IO.File]::WriteAllText((Join-Path (Get-Location) 'version.json'),$j,(New-Object Text.UTF8Encoding $false))"
findstr /C:"%BUILD_TS%" index.html >nul && findstr /C:"%BUILD_TS%" version.json >nul
if %errorlevel%==0 (
    echo [Delivo Deploy] Verified: index.html and version.json stamped with %BUILD_TS%.
) else (
    echo [Delivo Deploy] WARNING: index.html / version.json not stamped - check them manually!
)

echo [Delivo Deploy] Now upload all files to GitHub Pages / your server.
echo [Delivo Deploy] Done!
pause
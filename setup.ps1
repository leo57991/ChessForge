$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw "Command failed: exit $LASTEXITCODE" } }
if (-not (Get-Command py -ErrorAction SilentlyContinue)) { throw 'Install Python 3.11+ from python.org first.' }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22 LTS or later first.' }
if (-not (Test-Path '.venv')) { py -3 -m venv .venv; Check-Exit }
& .\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt; Check-Exit
Push-Location frontend
try { npm.cmd ci; Check-Exit; npm.cmd run build; Check-Exit } finally { Pop-Location }
if (-not (Test-Path 'engine\stockfish.exe')) {
 Write-Host 'Downloading official Stockfish 19 (Windows x64)...'
 $archive = Join-Path $env:TEMP 'chessforge-stockfish-19.zip'
 Invoke-WebRequest 'https://github.com/official-stockfish/Stockfish/releases/download/sf_19/stockfish-windows-x86-64-universal.zip' -OutFile $archive
 $extract = Join-Path $env:TEMP ('chessforge-engine-' + [guid]::NewGuid())
 Expand-Archive $archive -DestinationPath $extract
 $engine = Get-ChildItem $extract -Filter '*universal.exe' -Recurse | Select-Object -First 1
 if (-not $engine) { throw 'Stockfish executable not found. Install manually in engine/stockfish.exe.' }
 Copy-Item $engine.FullName 'engine\stockfish.exe'
 Get-ChildItem $extract -Filter 'Copying.txt' -Recurse | Select-Object -First 1 | Copy-Item -Destination 'engine\COPYING.txt'
 Remove-Item $extract -Recurse -Force
 Remove-Item $archive
}
& .\.venv\Scripts\python.exe backend\seed.py; Check-Exit
Write-Host 'Ready. Double-click start-windows.bat (local) or start-lan.bat (private LAN).'

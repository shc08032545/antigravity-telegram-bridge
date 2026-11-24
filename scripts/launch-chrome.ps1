param(
  [int]$Port = 9222,
  [string]$ProfileDir = "$env:USERPROFILE\.antigravity-chrome-profile",
  [string]$StartUrl = ""
)

$candidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
)

$chromeExe = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $chromeExe) {
  Write-Error "Google Chrome not found in standard installation paths."
  exit 1
}

New-Item -ItemType Directory -Force -Path $ProfileDir | Out-Null

$argsList = @(
  "--remote-debugging-port=$Port",
  "--remote-debugging-address=127.0.0.1",
  "--user-data-dir=`"$ProfileDir`"",
  "--no-first-run",
  "--no-default-browser-check"
)

if ($StartUrl -ne "") {
  $argsList += $StartUrl
}

Write-Host "Launching Chrome with CDP on http://127.0.0.1:$Port"
Write-Host "Profile directory: $ProfileDir"
Start-Process -FilePath $chromeExe -ArgumentList $argsList

param (
    [Parameter(Mandatory=$true, Position=0)]
    [string]$ExtensionId
)

$ErrorActionPreference = "Stop"

$RootDir = (Resolve-Path "$PSScriptRoot\..").Path
$EnvFile = if ($env:BROWSER_AGENT_BRIDGE_ENV_FILE) { $env:BROWSER_AGENT_BRIDGE_ENV_FILE } else { Join-Path $env:USERPROFILE ".browser-agent-bridge.env" }

if (-not (Test-Path $EnvFile)) {
    $bytes = New-Object Byte[] 16
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $token = -join ($bytes | ForEach-Object { $_.ToString("x2") })
    [System.IO.File]::WriteAllText($EnvFile, "BROWSER_AGENT_BRIDGE_TOKEN=$token`r`n", [System.Text.Encoding]::ASCII)
    Write-Host "Security token generated and saved in $EnvFile"
}

$ManifestSrc = Join-Path $RootDir "native\com.local.browser_agent_bridge.json"
$SupportDir = Join-Path $env:LOCALAPPDATA "Chrome Control"
$SupportNativeDir = Join-Path $SupportDir "native"
$SupportSkillRuntimeDir = Join-Path $SupportDir "skills\control-chrome\runtime"
$SupportSitePatternsDir = Join-Path $SupportSkillRuntimeDir "site-patterns"
$HostPy = Join-Path $SupportNativeDir "host.py"
$BundledHostExeSrc = Join-Path $RootDir "skills\control-chrome\extension-host\windows\x64\host.exe"
if (-not (Test-Path $BundledHostExeSrc)) {
    $PluginLayoutHostExeSrc = Join-Path $RootDir "extension-host\windows\x64\host.exe"
    if (Test-Path $PluginLayoutHostExeSrc) {
        $BundledHostExeSrc = $PluginLayoutHostExeSrc
    }
}
$HostExe = Join-Path $SupportNativeDir "host.exe"
$HostWrapper = Join-Path $SupportDir "host-wrapper.win.bat"
$ManifestDstDir = Join-Path $env:LOCALAPPDATA "Google\Chrome\NativeMessagingHosts"
$ManifestDst = Join-Path $ManifestDstDir "com.local.browser_agent_bridge.json"

$HasBundledHostExe = Test-Path $BundledHostExeSrc
$HostCommand = $HostExe
if (-not $HasBundledHostExe) {
    $PythonCommand = (Get-Command python -ErrorAction SilentlyContinue)
    if (-not $PythonCommand) {
        $PythonCommand = Get-Command py -ErrorAction SilentlyContinue
    }
    if (-not $PythonCommand) {
        throw "No bundled skills\control-chrome\extension-host\windows\x64\host.exe was found, and python or py was not found on PATH. Install Python first or use a release bundle that includes skills\control-chrome\extension-host\windows\x64\host.exe."
    }

    $PythonExe = $PythonCommand.Source
    $ResolvedPythonExe = $PythonExe
    try {
        $Probe = & $PythonExe -c "import sys; print(sys.executable)" 2>$null
        if ($Probe) {
            $Candidate = $Probe | Select-Object -First 1
            if ($Candidate -and (Test-Path $Candidate)) {
                $ResolvedPythonExe = (Resolve-Path $Candidate).Path
            }
        }
    } catch {
        # Fall back to the command path found on PATH. This keeps non-pyenv
        # installations working even if probing sys.executable fails.
    }
    $HostCommand = $ResolvedPythonExe
}

New-Item -ItemType Directory -Path $SupportNativeDir -Force | Out-Null
New-Item -ItemType Directory -Path $SupportSkillRuntimeDir -Force | Out-Null
if ($HasBundledHostExe) {
    Copy-Item -Path $BundledHostExeSrc -Destination $HostExe -Force
} else {
    Copy-Item -Path (Join-Path $RootDir "native\host.py") -Destination $HostPy -Force
}
Copy-Item -Path $ManifestSrc -Destination (Join-Path $SupportNativeDir "com.local.browser_agent_bridge.json") -Force
if (Test-Path $SupportSitePatternsDir) {
    Remove-Item -Path $SupportSitePatternsDir -Recurse -Force
}
Copy-Item -Path (Join-Path $RootDir "skills\control-chrome\runtime\site-patterns") -Destination $SupportSkillRuntimeDir -Recurse -Force

$wrapperContent = @"
@echo off
setlocal

set "ENV_FILE=%BROWSER_AGENT_BRIDGE_ENV_FILE%"
if "%ENV_FILE%"=="" set "ENV_FILE=%USERPROFILE%\.browser-agent-bridge.env"
if exist "%ENV_FILE%" (
    for /f "usebackq tokens=* delims=" %%x in ("%ENV_FILE%") do (
        if not "%%x"=="" set "%%x"
    )
)

set "BROWSER_AGENT_BRIDGE_EXTENSION_ID=$ExtensionId"

"$HostCommand"$(if (-not $HasBundledHostExe) { " `"$HostPy`"" }) %*

endlocal
"@
[System.IO.File]::WriteAllText($HostWrapper, $wrapperContent, [System.Text.Encoding]::ASCII)

if (-not (Test-Path $ManifestDstDir)) {
    New-Item -ItemType Directory -Path $ManifestDstDir -Force | Out-Null
}

$ManifestTemplate = Get-Content $ManifestSrc -Raw | ConvertFrom-Json
$Manifest = [ordered]@{
    name = $ManifestTemplate.name
    description = $ManifestTemplate.description
    path = $HostWrapper
    type = $ManifestTemplate.type
    allowed_origins = @("chrome-extension://$ExtensionId/")
}
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($ManifestDst, ($Manifest | ConvertTo-Json -Depth 5) + "`n", $Utf8NoBom)

$RegistryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.local.browser_agent_bridge"
if (-not (Test-Path $RegistryPath)) {
    New-Item -Path $RegistryPath -Force | Out-Null
}
Set-Item -Path $RegistryPath -Value $ManifestDst

Write-Host "Installed Windows Native Messaging Host:"
Write-Host "Registry key: $RegistryPath"
Write-Host "Manifest path: $ManifestDst"
Write-Host "Host launcher: $HostWrapper"

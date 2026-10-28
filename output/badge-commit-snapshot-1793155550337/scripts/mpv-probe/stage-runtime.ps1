param(
  [Parameter(Mandatory = $true)][string]$MpvExecutable,
  [Parameter(Mandatory = $true)][string]$FfmpegExecutable
)
$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$destination = Join-Path $repoRoot 'resources/audio'
$mpvSource = (Resolve-Path -LiteralPath $MpvExecutable).Path
$ffmpegSource = (Resolve-Path -LiteralPath $FfmpegExecutable).Path
foreach ($source in @($mpvSource, $ffmpegSource)) {
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing runtime: $source" }
}
New-Item -ItemType Directory -Path $destination -Force | Out-Null
Copy-Item -LiteralPath $mpvSource -Destination (Join-Path $destination 'mpv.exe')
Copy-Item -LiteralPath $ffmpegSource -Destination (Join-Path $destination 'ffmpeg.exe')
Get-FileHash -LiteralPath (Join-Path $destination 'mpv.exe'), (Join-Path $destination 'ffmpeg.exe') -Algorithm SHA256

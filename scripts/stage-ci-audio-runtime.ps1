param(
    [Parameter(Mandatory = $true)][string]$DownloadDirectory,
    [string]$Destination = (Join-Path $PSScriptRoot '../resources/audio')
)

$ErrorActionPreference = 'Stop'
$archives = @(
    @{
        Name = 'mpv'
        Url = 'https://github.com/mpv-player/mpv/releases/download/v0.41.0/mpv-v0.41.0-x86_64-pc-windows-msvc.zip'
        Sha256 = '4e197f729f5071c6772f35fffd96e0f36e3e8a044bd9479b136bb09b7c6a80ff'
    },
    @{
        Name = 'ffmpeg'
        Url = 'https://github.com/GyanD/codexffmpeg/releases/download/8.0.1/ffmpeg-8.0.1-full_build.zip'
        Sha256 = '467cde100a47ed4b03a897988aeb4a296890c1e2b2d2864204657d002bc5fb90'
    }
)

New-Item -ItemType Directory -Path $DownloadDirectory, $Destination -Force | Out-Null
foreach ($archive in $archives) {
    $zip = Join-Path $DownloadDirectory "$($archive.Name).zip"
    $extracted = Join-Path $DownloadDirectory $archive.Name
    Invoke-WebRequest -Uri $archive.Url -OutFile $zip -MaximumRetryCount 3 -RetryIntervalSec 5
    if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ne $archive.Sha256) {
        throw "Unexpected SHA-256 for $($archive.Name)"
    }
    Expand-Archive -LiteralPath $zip -DestinationPath $extracted -Force
    $files = @(Get-ChildItem -LiteralPath $extracted -Filter "$($archive.Name).exe" -Recurse -File)
    if ($files.Count -ne 1) { throw "Expected one $($archive.Name).exe in the release archive" }
    Copy-Item -LiteralPath $files[0].FullName -Destination $Destination
}

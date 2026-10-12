param(
    [Parameter(Mandatory = $true)][string]$MSBuild,
    [string]$SevenZip = 'C:\Program Files\7-Zip\7z.exe'
)
$ErrorActionPreference = 'Stop'
$probeRoot = Join-Path $env:TEMP ('auralis-fb2k-sdk-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $probeRoot | Out-Null
Write-Output "Isolated output: $probeRoot"
Invoke-WebRequest 'https://www.foobar2000.org/downloads/SDK-2026-10-01.7z' -OutFile (Join-Path $probeRoot 'SDK.7z')
Invoke-WebRequest 'https://www.foobar2000.org/downloads/foobar2000-x64_v2.26.1.exe' -OutFile (Join-Path $probeRoot 'foobar-installer.exe')
& $SevenZip x (Join-Path $probeRoot 'SDK.7z') ('-o' + (Join-Path $probeRoot 'sdk')) -y > (Join-Path $probeRoot 'extract-sdk.log')
if ($LASTEXITCODE) { throw 'SDK extraction failed' }
& $SevenZip x (Join-Path $probeRoot 'foobar-installer.exe') ('-o' + (Join-Path $probeRoot 'host')) -y > (Join-Path $probeRoot 'extract-host.log')
if ($LASTEXITCODE) { throw 'Host extraction failed' }
New-Item -ItemType File -Path (Join-Path $probeRoot 'host\portable_mode_enabled') | Out-Null
& $MSBuild (Join-Path $PSScriptRoot 'probe.vcxproj') /p:Configuration=Release /p:Platform=x64 ("/p:ProbeRoot=" + $probeRoot) /m:4 /v:minimal /nologo *> (Join-Path $probeRoot 'build.log')
if ($LASTEXITCODE) { throw "Build failed: $probeRoot\build.log" }
$ffmpeg = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\resources\audio\ffmpeg.exe'))
python (Join-Path $PSScriptRoot 'generate.py') $probeRoot $ffmpeg
if ($LASTEXITCODE) { throw 'Synthetic fixture generation failed' }
Copy-Item -LiteralPath (Join-Path $probeRoot 'build\foo_auralis_probe.dll') -Destination (Join-Path $probeRoot 'host\components\foo_auralis_probe.dll')

# Dismiss only this fresh portable host's initial appearance chooser.
# Do not interact with any other foobar2000 process or dismiss errors.
Add-Type @'
using System; using System.Text; using System.Runtime.InteropServices;
public class AuralisProbeFirstRun {
    public delegate bool CB(IntPtr h, IntPtr p);
    [DllImport("user32.dll")] static extern bool EnumWindows(CB cb, IntPtr p);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
    public static void Check(uint pid) {
        EnumWindows((h,p)=>{
            uint owner; GetWindowThreadProcessId(h,out owner);
            if(owner==pid) { var s=new StringBuilder(256); GetWindowText(h,s,256);
                if(s.ToString()=="Quick Appearance Setup") PostMessage(h,273,(IntPtr)1,IntPtr.Zero);
            } return true;
        },IntPtr.Zero);
    }
}
'@
$previousRoot = $env:AURALIS_FB2K_PROBE_ROOT
try {
    $env:AURALIS_FB2K_PROBE_ROOT = $probeRoot
    $hostProcess = Start-Process -FilePath (Join-Path $probeRoot 'host\foobar2000.exe') -ArgumentList '/hide' -WorkingDirectory (Join-Path $probeRoot 'host') -WindowStyle Hidden -PassThru
} finally {
    $env:AURALIS_FB2K_PROBE_ROOT = $previousRoot
}
$deadline = [DateTime]::UtcNow.AddMinutes(6)
while (-not $hostProcess.WaitForExit(1000)) {
    [AuralisProbeFirstRun]::Check([uint32]$hostProcess.Id)
    if ([DateTime]::UtcNow -gt $deadline) {
        # Only the child created above, whose data and profile are disposable.
        $hostProcess.Kill()
        throw "Probe timed out; retained evidence: $probeRoot"
    }
}
python (Join-Path $PSScriptRoot 'analyze.py') $probeRoot
if ($LASTEXITCODE) { throw "Analysis failed; retained evidence: $probeRoot" }
Write-Output "Finished. Evidence: $probeRoot\results"

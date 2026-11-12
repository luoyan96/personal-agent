param(
  [string]$Dotnet = $(if ($env:ACCEPTCAT_DOTNET) { $env:ACCEPTCAT_DOTNET } else { 'dotnet' }),
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '../.windows-share'),
  [string]$CertificateThumbprint = $env:ACCEPTCAT_SHARE_CERT_THUMBPRINT
)
$ErrorActionPreference = 'Stop'
$output = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force $output | Out-Null
$publisher = 'CN=AcceptCat'
if ($CertificateThumbprint) {
  # Node-launched Windows PowerShell can inherit PowerShell 7's module path.
  # Read the exact personal certificate directly, without relying on Cert: drive auto-loading.
  $store = [Security.Cryptography.X509Certificates.X509Store]::new('My', 'CurrentUser')
  try {
    $store.Open([Security.Cryptography.X509Certificates.OpenFlags]::ReadOnly)
    $matches = $store.Certificates.Find([Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint, $CertificateThumbprint, $false)
    if ($matches.Count -ne 1 -or !$matches[0].HasPrivateKey) { throw 'Signing certificate with private key not found in CurrentUser/My.' }
    $publisher = $matches[0].Subject
  } finally { $store.Close() }
}
$native = [xml](Get-Content -LiteralPath (Join-Path $PSScriptRoot 'app.manifest') -Raw -Encoding UTF8)
$native.assembly.msix.SetAttribute('publisher', $publisher)
$native.Save((Join-Path $output 'app.manifest'))
Push-Location $PSScriptRoot
try {
  & $Dotnet publish AcceptCat.ShareTarget.csproj -c Release -r win-x64 --self-contained true -o $output `
    '-p:RestoreLockedMode=true' "-p:ApplicationManifest=$(Join-Path $output 'app.manifest')"
  if ($LASTEXITCODE -ne 0) { throw 'Share receiver build failed.' }
} finally { Pop-Location }
$probe = Start-Process -FilePath (Join-Path $output 'AcceptCat.ShareTarget.exe') -ArgumentList '--self-test' -WindowStyle Hidden -Wait -PassThru
if ($probe.ExitCode -ne 0) { throw 'Share receiver staging self-test failed.' }

$cache = Join-Path $output '.buildtools'
$makeappx = Join-Path $cache 'bin/10.0.26100.0/x64/makeappx.exe'
if (!(Test-Path -LiteralPath $makeappx)) {
  $zip = Join-Path $output 'buildtools.zip'
  Invoke-WebRequest 'https://api.nuget.org/v3-flatcontainer/microsoft.windows.sdk.buildtools/10.0.26100.9457/microsoft.windows.sdk.buildtools.10.0.26100.9457.nupkg' -OutFile $zip
  if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ne '4C2E0D85F3490E7F7C065C35B4C47FE913B1BC9627E9711AE349B2CDC7EDC791') { throw 'Windows SDK tools checksum mismatch.' }
  Expand-Archive -LiteralPath $zip -DestinationPath $cache -Force
}
$package = Join-Path $output '.package'
New-Item -ItemType Directory -Force (Join-Path $package 'resources/windows-share/Assets') | Out-Null
New-Item -ItemType Directory -Force (Join-Path $output 'Assets') | Out-Null
Add-Type -AssemblyName System.Drawing
$image = [Drawing.Image]::FromFile([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../public/icons/icon.png')))
try {
  foreach ($size in @(44,150)) {
    $bitmap = [Drawing.Bitmap]::new($image, [Drawing.Size]::new($size,$size))
    try { $bitmap.Save((Join-Path $output "Assets/Square${size}x${size}Logo.png"),[Drawing.Imaging.ImageFormat]::Png) } finally { $bitmap.Dispose() }
  }
} finally { $image.Dispose() }
Copy-Item -LiteralPath (Join-Path $output 'Assets/Square44x44Logo.png') -Destination (Join-Path $package 'resources/windows-share/Assets')
Copy-Item -LiteralPath (Join-Path $output 'Assets/Square150x150Logo.png') -Destination (Join-Path $package 'resources/windows-share/Assets')
$manifest = [xml](Get-Content -LiteralPath (Join-Path $PSScriptRoot 'AppxManifest.xml') -Raw -Encoding UTF8)
$version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot '../package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version.Split('.')
$manifest.Package.Identity.SetAttribute('Version', "1.$($version[1]).$($version[2]).0")
$manifest.Package.Identity.SetAttribute('Publisher', $publisher)
foreach ($attribute in @('Logo','Square44x44Logo','Square150x150Logo')) {
  if ($attribute -eq 'Logo') { $manifest.Package.Properties.Logo = 'resources\windows-share\Assets\Square150x150Logo.png' }
  else { $manifest.Package.Applications.Application.VisualElements.SetAttribute($attribute, "resources\windows-share\Assets\${attribute}.png") }
}
$manifest.Save((Join-Path $package 'AppxManifest.xml'))
$msix = Join-Path $output 'AcceptCat.ShareTarget.msix'
& $makeappx pack /d $package /p $msix /nv /o
if ($LASTEXITCODE -ne 0) { throw 'Share identity package build failed.' }
if ($CertificateThumbprint) {
  & (Join-Path $cache 'bin/10.0.26100.0/x64/signtool.exe') sign /fd SHA256 /sha1 $CertificateThumbprint $msix
  if ($LASTEXITCODE -ne 0) { throw 'Share identity signature failed.' }
}
@{ signed = [bool]$CertificateThumbprint; publisher = $publisher } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output 'build-status.json') -Encoding utf8
Write-Output "Share receiver and MSIX built at $output. Signed=$([bool]$CertificateThumbprint)"

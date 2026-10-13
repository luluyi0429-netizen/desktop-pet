param([Parameter(Mandatory=$true)][string]$Source,[Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\release')).TrimEnd('\')
$sourcePath=(Resolve-Path -LiteralPath $Source).Path.TrimEnd('\')
$destinationPath=[IO.Path]::GetFullPath($Destination)
if (-not $sourcePath.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase) -or
    -not $destinationPath.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Archive paths must stay within release' }
if (Test-Path -LiteralPath $destinationPath) { throw 'Refusing to overwrite an existing archive' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($sourcePath,$destinationPath,[IO.Compression.CompressionLevel]::Optimal,$true)

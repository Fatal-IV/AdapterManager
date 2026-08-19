param(
  [string]$InnoSetupCompiler = "C:\Program Files\Inno Setup 7\ISCC.exe"
)

Write-Host "1/2 Packaging Electron app..."
npm run pack
if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }

Write-Host "2/2 Compiling installer..."
& $InnoSetupCompiler "installer\installer.iss"
if ($LASTEXITCODE -ne 0) { throw "Inno Setup compile failed" }

Write-Host "Done: installer\Output\AdapterManagerSetup.exe"

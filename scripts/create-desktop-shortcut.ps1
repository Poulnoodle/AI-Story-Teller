# Create a desktop shortcut to start-mythhunter.bat (renamed to Chinese by caller if needed)
$ws = New-Object -ComObject WScript.Shell
$shortcut = $ws.CreateShortcut("$env:USERPROFILE\Desktop\MythHunter.lnk")
$shortcut.TargetPath = "E:\CS\Projects\AI-Story-Teller\start-mythhunter.bat"
$shortcut.WorkingDirectory = "E:\CS\Projects\AI-Story-Teller"
$shortcut.Description = "Start MythHunter"
$shortcut.Save()
Write-Output "Shortcut created: $env:USERPROFILE\Desktop\MythHunter.lnk"

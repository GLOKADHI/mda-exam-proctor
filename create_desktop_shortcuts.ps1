$desktopPath = [Environment]::GetFolderPath('Desktop')
$wsh = New-Object -ComObject WScript.Shell

$mdaTarget = "C:\Users\lokad\Music\quiz\MdaExamBrowserr.exe"
$workingDir = "C:\Users\lokad\Music\quiz"
$iconPath = "C:\Users\lokad\Music\quiz\mda_exam_logo.ico,0"

# Clean up any old/temporary shortcuts
$oldShortcuts = @(
    "$desktopPath\main.exe.lnk",
    "$desktopPath\ProctorIQ Exam Browser.lnk",
    "$desktopPath\ProctorIQ.lnk"
)
foreach ($old in $oldShortcuts) {
    if (Test-Path $old) {
        Remove-Item $old -Force -ErrorAction SilentlyContinue
    }
}

# Create Official MdaExamBrowserr shortcut
$shortcut = $wsh.CreateShortcut("$desktopPath\MdaExamBrowserr.lnk")
$shortcut.TargetPath = $mdaTarget
$shortcut.WorkingDirectory = $workingDir
$shortcut.IconLocation = $iconPath
$shortcut.Description = "MdaExamBrowser Secure Proctored Examination Suite"
$shortcut.Save()

Write-Host "Created MdaExamBrowserr shortcut successfully on Desktop: $desktopPath\MdaExamBrowserr.lnk"

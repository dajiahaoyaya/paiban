# PowerShell script to take screenshot of localhost:3000
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Write-Host "正在启动浏览器并访问 http://localhost:3000 ..."

# Create a simple web browser form
$form = New-Object System.Windows.Forms.Form
$form.Text = "排班系统检查"
$form.Size = New-Object System.Drawing.Size(1400, 900)
$form.StartPosition = "CenterScreen"

$webBrowser = New-Object System.Windows.Forms.WebBrowser
$webBrowser.Size = $form.ClientSize
$webBrowser.Anchor = "Top, Bottom, Left, Right"
$webBrowser.ScriptErrorsSuppressed = $false

$consoleErrors = @()
$consoleWarnings = @()
$consoleLogs = @()

$webBrowser.DocumentCompleted += {
    Write-Host "`n===== 页面已加载 =====" -ForegroundColor Green
    Write-Host "标题: $($webBrowser.DocumentTitle)"

    # Wait a bit for JavaScript to execute
    Start-Sleep -Seconds 3

    # Take screenshot
    $bitmap = New-Object System.Drawing.Bitmap($form.Width, $form.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($form.PointToScreen([System.Drawing.Point]::Empty), [System.Drawing.Point]::Empty, $form.Size)

    $screenshotPath = Join-Path $PSScriptRoot "screenshot.png"
    $bitmap.Save($screenshotPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bitmap.Dispose()

    Write-Host "`n✓ 截图已保存: $screenshotPath" -ForegroundColor Green

    # Close the form after screenshot
    $form.Close()
}

$form.Controls.Add($webBrowser)
$form.Show()

# Navigate to localhost
$webBrowser.Navigate("http://localhost:3000")

# Run the application
[System.Windows.Forms.Application]::Run($form)

Write-Host "`n===== 检查完成 ====="
Write-Host "提示: 在浏览器中按 F12 打开开发者工具查看详细的控制台错误和警告"

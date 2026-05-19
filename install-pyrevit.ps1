# install-pyrevit.ps1
# 自動抓最新 pyRevit release 並安裝到 Revit (2023/2024/2025)，同時安裝 pyRevit CLI
# 執行方式（以系統管理員開啟 PowerShell）:
#   Set-ExecutionPolicy Bypass -Scope Process -Force
#   .\install-pyrevit.ps1

$ErrorActionPreference = 'Stop'

$validVersions = @('2023','2024','2025')
do {
    $revitVersion = Read-Host "請問您的 Revit 版本？(2023 / 2024 / 2025)"
} while ($revitVersion -notin $validVersions)
Write-Host "已選擇 Revit $revitVersion" -ForegroundColor Green

Write-Host "=== pyRevit Auto Installer ===" -ForegroundColor Cyan
Write-Host "查詢 GitHub 最新 release..."

$apiUrl = "https://api.github.com/repos/pyrevitlabs/pyRevit/releases/latest"
$headers = @{ 'User-Agent' = 'pyRevit-Installer' }

try {
    $release = Invoke-RestMethod -Uri $apiUrl -Headers $headers
} catch {
    Write-Host "ERROR: 無法連線 GitHub API。請確認網路連線。" -ForegroundColor Red
    exit 1
}

$tag = $release.tag_name
Write-Host "最新版本: $tag" -ForegroundColor Green
Write-Host "可用的 assets:"
$release.assets | ForEach-Object { Write-Host "  - $($_.name)" }

# ── 安裝 pyRevit (GUI) ──────────────────────────────────────────────────────
function Install-Asset {
    param(
        [string]$Label,
        [object]$Asset
    )
    if (-not $Asset) {
        Write-Host "ERROR: 找不到 $Label 安裝檔。" -ForegroundColor Red
        return $false
    }
    $path = Join-Path $env:TEMP $Asset.name
    Write-Host ""
    Write-Host "--- $Label ---" -ForegroundColor Cyan
    Write-Host "下載: $($Asset.name)"
    try {
        $wc = New-Object System.Net.WebClient
        $wc.DownloadFile($Asset.browser_download_url, $path)
        Write-Host "下載完成" -ForegroundColor Green
    } catch {
        Write-Host "ERROR: 下載失敗 - $_" -ForegroundColor Red
        return $false
    }
    Write-Host "安裝中... (若出現 UAC 提示，請點選「是」)"
    try {
        $proc = Start-Process -FilePath $path -ArgumentList '/SILENT' -Wait -PassThru
        if ($proc.ExitCode -eq 0) {
            Write-Host "安裝成功！ExitCode: 0" -ForegroundColor Green
        } else {
            Write-Host "安裝結束，ExitCode: $($proc.ExitCode)（3010=需重開機）" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "ERROR: 無法執行安裝檔 - $_" -ForegroundColor Red
        return $false
    }
    Remove-Item $path -Force -ErrorAction SilentlyContinue
    return $true
}

# 確認 Revit 是否已安裝
$revitKey = "HKLM:\SOFTWARE\Autodesk\Revit\$revitVersion"
if (Test-Path $revitKey) {
    Write-Host "Revit $revitVersion 已偵測到。" -ForegroundColor Green
} else {
    Write-Host "WARNING: 在 registry 中找不到 Revit $revitVersion，安裝繼續但請確認 Revit 已安裝。" -ForegroundColor Yellow
}

# pyRevit GUI installer: 名稱含 pyRevit 但不含 CLI
$guiAsset = $release.assets |
    Where-Object { $_.name -match '\.exe$' -and $_.name -notmatch 'CLI' } |
    Select-Object -First 1

# pyRevit CLI installer: 名稱含 CLI
$cliAsset = $release.assets |
    Where-Object { $_.name -match '\.exe$' -and $_.name -match 'CLI' } |
    Select-Object -First 1

Install-Asset -Label "pyRevit (GUI)" -Asset $guiAsset
Install-Asset -Label "pyRevit CLI"   -Asset $cliAsset

Write-Host ""
Write-Host "=== 完成 ===" -ForegroundColor Cyan
Write-Host "後續步驟："
Write-Host "  1. 開啟 Revit $revitVersion"
Write-Host "  2. 確認 ribbon 上出現 pyRevit 頁籤"
Write-Host "  3. 將本專案 pyrevit-scripts/ 加入 pyRevit Extension paths:"
Write-Host "     pyRevit ribbon → Settings → Custom Extension Directories"
Write-Host "     加入路徑: $(Resolve-Path (Join-Path $PSScriptRoot 'pyrevit-scripts'))"
Write-Host ""
Write-Host "  若要執行結構生成腳本，確保 output/design.json 存在後執行:"
Write-Host "     pyRevit Console → run 02_generate_structure.py"
Write-Host "     或 CLI: pyrevit run 02_generate_structure.py"

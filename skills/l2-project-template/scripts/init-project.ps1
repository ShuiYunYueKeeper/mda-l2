# 将 L2 工程模板复制到目标路径，初始化新项目脚手架。
# 用法: .\init-project.ps1 -TargetPath "D:\projects\my-app" [-ProjectName "my-app"]

param(
    [Parameter(Mandatory = $true)]
    [string]$TargetPath,

    [string]$ProjectName = ""
)

$ErrorActionPreference = "Stop"

$SkillRoot = Split-Path -Parent $PSScriptRoot
$TemplateDir = Join-Path $SkillRoot "template"

if (-not (Test-Path $TemplateDir)) {
    throw "Template directory not found: $TemplateDir"
}

$TargetPath = [System.IO.Path]::GetFullPath($TargetPath)

if (Test-Path $TargetPath) {
    $items = Get-ChildItem -Force $TargetPath
    if ($items.Count -gt 0) {
        throw "Target directory is not empty: $TargetPath"
    }
} else {
    New-Item -ItemType Directory -Force -Path $TargetPath | Out-Null
}

Copy-Item -Recurse -Force (Join-Path $TemplateDir "*") $TargetPath

# 删除模板自带的「模板说明」README，避免与新项目 README 混淆
$templateReadme = Join-Path $TargetPath "README.md"
if (Test-Path $templateReadme) {
    Remove-Item -Force $templateReadme
}

# 将 README.md.template 提升为默认 README 占位
$readmeTemplate = Join-Path $TargetPath "README.md.template"
if (Test-Path $readmeTemplate) {
    Copy-Item -Force $readmeTemplate (Join-Path $TargetPath "README.md")
}

if ($ProjectName) {
    $replacements = @{
        "{project_name}"  = $ProjectName
        "{package_name}"  = $ProjectName
    }
    $textFiles = Get-ChildItem -Recurse -File $TargetPath -Include "*.md", "*.template", "*.json.template", "*.js.template"
    foreach ($file in $textFiles) {
        $content = Get-Content -Raw -Encoding UTF8 $file.FullName
        $changed = $false
        foreach ($key in $replacements.Keys) {
            if ($content -like "*$key*") {
                $content = $content.Replace($key, $replacements[$key])
                $changed = $true
            }
        }
        if ($changed) {
            Set-Content -Path $file.FullName -Value $content -Encoding UTF8 -NoNewline
        }
    }
}

Write-Host "L2 project scaffold initialized at: $TargetPath"
Write-Host "Next: fill *.template files, run git init, start P0 per .cursor/workflow.md"

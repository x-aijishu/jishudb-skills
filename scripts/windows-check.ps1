$ErrorActionPreference = "Stop"

function Invoke-JsonCompatibilityCheck {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command,
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [Parameter(Mandatory = $true)]
        [string]$Label
    )

    $Output = @(& $Command @Arguments)
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE"
    }
    if ($Output.Count -ne 1) {
        throw "$Label must return exactly one JSON line, received $($Output.Count)"
    }
    $Result = $Output[0] | ConvertFrom-Json
    if ($Result.status -cne "compatible") {
        throw "$Label returned unexpected status $($Result.status)"
    }
    return $Result
}

function Invoke-LiveSkillPlanCheck {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Helper
    )

    $ConfigTarget = Join-Path ([System.IO.Path]::GetTempPath()) ("jishudb-skill-ci-" + [guid]::NewGuid().ToString("N") + "/mcp.json")
    $Result = $null
    try {
        $Output = @(& node $Helper plan -Client "Windows CI" -ConfigTarget $ConfigTarget -ConnectionName jishudb)
        if ($LASTEXITCODE -ne 0 -or $Output.Count -ne 1) {
            throw "pure JavaScript Windows Skill live plan failed"
        }
        $Result = $Output[0] | ConvertFrom-Json
        if ($Result.status -cne "approval_required" -or
            [string]$Result.planSha256 -cnotmatch '^[0-9a-f]{64}$' -or
            -not (Test-Path -LiteralPath $Result.planPath -PathType Leaf)) {
            throw "pure JavaScript Windows Skill live plan returned an invalid result"
        }
    }
    finally {
        if ($null -ne $Result -and -not [string]::IsNullOrWhiteSpace([string]$Result.planPath)) {
            $PlanParent = Split-Path -Parent ([System.IO.Path]::GetFullPath([string]$Result.planPath))
            $TempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
            if ($PlanParent.StartsWith($TempRoot, [System.StringComparison]::OrdinalIgnoreCase) -and
                (Split-Path -Leaf $PlanParent) -match '^JishuDBAgentInstall-[0-9a-f]{32}$') {
                Remove-Item -LiteralPath $PlanParent -Recurse -Force
            }
        }
    }
}

$RepositoryRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepositoryRoot
$Python312 = "python"

$SkillHelper = Join-Path $RepositoryRoot "skills/jishudb/scripts/install-windows.js"
$SkillTempRoot = Join-Path $env:LOCALAPPDATA "Temp"
if (-not (Test-Path -LiteralPath $SkillTempRoot -PathType Container)) {
    throw "Windows Skill compatibility check requires the local application-data temp directory"
}
$OriginalTemp = $env:TEMP
$OriginalTmp = $env:TMP
try {
    # Hosted runners map RUNNER_TEMP through an infrastructure reparse path.
    # Keep the production helper strict and give this CI harness a local,
    # non-reparse temporary root instead of weakening path validation.
    $env:TEMP = $SkillTempRoot
    $env:TMP = $SkillTempRoot
    Invoke-JsonCompatibilityCheck "node" @($SkillHelper, "check") "pure JavaScript Windows Skill helper check" | Out-Null

    $SkillHubOutput = Join-Path $RepositoryRoot ".tmp-test-dist/skillhub"
    if (Test-Path -LiteralPath $SkillHubOutput) {
        Remove-Item -LiteralPath $SkillHubOutput -Recurse -Force
    }
    $PackageResultText = @(& $Python312 "scripts/package-jishudb-skillhub.py" "--output-dir" $SkillHubOutput "--allow-dirty")
    if ($LASTEXITCODE -ne 0 -or $PackageResultText.Count -ne 1) {
        throw "SkillHub package generation failed"
    }
    $PackageResult = $PackageResultText[0] | ConvertFrom-Json
    $ExtractedSkillHub = Join-Path $SkillHubOutput "extracted"
    Expand-Archive -LiteralPath $PackageResult.artifactPath -DestinationPath $ExtractedSkillHub
    $SkillHubLauncher = Join-Path $ExtractedSkillHub "jishudb/scripts/install-windows.js"
    Invoke-JsonCompatibilityCheck "node" @($SkillHubLauncher, "check") "SkillHub pure JavaScript Windows helper check" | Out-Null
    if ($env:JISHUDB_RUN_LIVE_SKILL_PLAN -ceq "true") {
        Invoke-LiveSkillPlanCheck $SkillHelper
    }
}
finally {
    $env:TEMP = $OriginalTemp
    $env:TMP = $OriginalTmp
}

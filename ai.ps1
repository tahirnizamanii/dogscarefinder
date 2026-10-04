# ai.ps1 — PowerShell wrapper for the AI agent
# Usage:
#   .\ai.ps1 "Create a contact page"
#   .\ai.ps1 -DryRun "Add schema to blog post"
#   .\ai.ps1 -Yes "Fix the state page"
#   .\ai.ps1 -ShowRaw "Explain the category page"

param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$PromptParts,

    [Alias("d")]
    [switch]$DryRun,

    [Alias("y")]
    [switch]$Yes,

    [Alias("r")]
    [switch]$ShowRaw
)

$prompt = $PromptParts -join " "

if (-not $prompt) {
    Write-Host ""
    Write-Host "DogCareFinder AI Agent" -ForegroundColor Cyan
    Write-Host "======================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host '  .\ai.ps1 "Create a new about page"'
    Write-Host '  .\ai.ps1 -DryRun "Add blog filters"'
    Write-Host '  .\ai.ps1 -Yes "Fix the navigation"'
    Write-Host '  .\ai.ps1 -ShowRaw "Explain the category page"'
    Write-Host ""
    Write-Host "Options:" -ForegroundColor Yellow
    Write-Host "  -DryRun  / -d   Show what would change, don't write"
    Write-Host "  -Yes     / -y   Skip confirmation prompt"
    Write-Host "  -ShowRaw / -r   Show full AI response"
    Write-Host ""
    exit 1
}

# Build arguments
$nodeArgs = @()

if ($DryRun) { $nodeArgs += "--dry-run" }
if ($Yes) { $nodeArgs += "--yes" }
if ($ShowRaw) { $nodeArgs += "--verbose" }

$nodeArgs += $prompt

# Run the Node.js agent
node scripts/ai-agent.mjs @nodeArgs
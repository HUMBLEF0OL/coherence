# Coherence statusline (DD-070, M3) — PowerShell.
# Cancellation-safe single-read. No multi-step computation.
# Mode indicator: A=author, N=annotate, G=graduated, O=observe (default).
$snap = ".claude/coherence/state-snapshot.json"
if (-not (Test-Path -LiteralPath $snap)) { return }
try {
  $j = Get-Content -LiteralPath $snap -Raw -Encoding UTF8 | ConvertFrom-Json
} catch { return }
if ($j.degraded -eq $true) { Write-Output "[🧭 ⚠]"; return }
$mode = "O"
if ($j.mode -eq "author")        { $mode = "A" }
elseif ($j.mode -eq "annotate")  { $mode = "N" }
elseif ($j.mode -eq "graduated") { $mode = "G" }
$surfaced = [int]($j.proposal_counts.surfaced)
$queued   = [int]($j.proposal_counts.queued)
$buffer   = [int]($j.buffer_count)
if ($surfaced -gt 0)  { Write-Output ("[🧭 {0}{1} → /coherence:propose-list]" -f $surfaced, $mode); return }
elseif ($queued -gt 0) { Write-Output ("[🧭 {0}q{1}]" -f $queued, $mode); return }
elseif ($buffer -gt 0) { Write-Output ("[🧭 {0}{1}]" -f $buffer, $mode); return }

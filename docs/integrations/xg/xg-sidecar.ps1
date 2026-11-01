<#
.SYNOPSIS
  HTTP sidecar that asks a running eXtreme Gammon 2 window for its analysis.

.DESCRIPTION
  See docs/domain/xg.md and docs/decisions/0025-xg-gui-sidecar.md.

  This drives XG the way a user does, through its own menu commands:
    File > Import > Position from Clipboard, Analyze > Position or Analyze > Double Action,
    File > Export > XGID to Clipboard, File > Export > Position to Clipboard.
  Commands are posted to the XG window (WM_COMMAND), so it does not take focus or send keys.
  It does not read XG's memory, files, settings, or registry, and it changes nothing in XG.
  The "Save Game" prompt that appears when a new position replaces the last one is answered "No".
  Any other XG dialog (for example "Invalid position") is closed and fails the query.

  Endpoints (one query at a time):
    GET  /health                       -> {"ok":true,"version":"eXtreme Gammon 2.10",...}
    POST /v1/query {"xgid","kind"}     -> {"ok":true,"text":"<XG position text with analysis>"}
         kind = "checker" (Analyze > Position) or "cube" (Analyze > Double Action)

  The clipboard is used to talk to XG. Your clipboard text is restored after each query.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File docs\integrations\xg\xg-sidecar.ps1
#>
param(
  [int]$Port = 8091,
  [string]$BindAddress = "127.0.0.1",
  [int]$AnalysisTimeoutSec = 120,
  # Menu command ids of eXtreme Gammon 2.10. Another XG build may number its menu differently.
  [int]$CmdImportClipboard = 123,
  [int]$CmdExportText = 130,
  [int]$CmdExportXgid = 132,
  [int]$CmdAnalyzeCube = 265,
  [int]$CmdAnalyzePosition = 266,
  [switch]$DebugLog
)

function Write-DebugLog([string]$msg) { if ($DebugLog) { Write-Host "  [debug] $msg" } }

$ErrorActionPreference = "Stop"
if ([Threading.Thread]::CurrentThread.ApartmentState -ne "STA") {
  throw "Run in an STA PowerShell (Windows PowerShell 5.1 default, or: powershell -STA -File ...)."
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
if (-not ('XgSidecarWin' -as [type])) {
  Add-Type @"
using System;
using System.Collections.Generic;
using System.Text;
using System.Runtime.InteropServices;
public static class XgSidecarWin {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr h, uint m, IntPtr w, IntPtr l, uint f, uint t, out IntPtr r);
  // True once the window's thread has handled everything posted before this call.
  public static bool Idle(IntPtr h, uint ms) { IntPtr r; return SendMessageTimeout(h, 0, IntPtr.Zero, IntPtr.Zero, 2, ms, out r) != IntPtr.Zero; }
  // WM_COMMAND that returns once XG's handler returns, or false after ms (e.g. a modal prompt is up).
  public static bool Command(IntPtr h, int id, uint ms) { IntPtr r; return SendMessageTimeout(h, 0x0111, (IntPtr)id, IntPtr.Zero, 0, ms, out r) != IntPtr.Zero; }
  public static string ClassOf(IntPtr h) { var s = new StringBuilder(256); GetClassName(h, s, 256); return s.ToString(); }
  public static string TitleOf(IntPtr h) { var s = new StringBuilder(512); GetWindowText(h, s, 512); return s.ToString(); }
  public static IntPtr[] Windows(uint pid) {
    var list = new List<IntPtr>();
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); if (p == pid && IsWindowVisible(h)) list.Add(h); return true; }, IntPtr.Zero);
    return list.ToArray();
  }
}
"@
}

$WM_COMMAND = 0x0111
$WM_CLOSE = 0x0010
$TDM_CLICK_BUTTON = 0x0466
$IDNO = 7

function Get-Xg {
  $proc = Get-Process -Name eXtremeGammon2 -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $proc) { throw "eXtreme Gammon 2 is not running" }
  $main = [XgSidecarWin]::Windows([uint32]$proc.Id) | Where-Object { [XgSidecarWin]::ClassOf($_) -eq "TMainX" } | Select-Object -First 1
  if (-not $main) { throw "eXtreme Gammon 2 main window not found" }
  [pscustomobject]@{ Pid = [uint32]$proc.Id; Main = $main; Title = [XgSidecarWin]::TitleOf($main) }
}

function Send-XgCommand($xg, [int]$id) {
  if (-not [XgSidecarWin]::PostMessage($xg.Main, $WM_COMMAND, [IntPtr]$id, [IntPtr]::Zero)) {
    throw "could not post command $id to XG"
  }
}

function Get-DialogText([IntPtr]$h) {
  $el = [System.Windows.Automation.AutomationElement]::FromHandle($h)
  $texts = foreach ($e in $el.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) {
    if ($e.Current.ControlType -eq [System.Windows.Automation.ControlType]::Text -and $e.Current.Name) { $e.Current.Name }
  }
  (@([XgSidecarWin]::TitleOf($h)) + $texts) -join ": "
}

# A task dialog with only a Close button ignores WM_CLOSE, so press its own button.
function Close-Dialog([IntPtr]$h) {
  $el = [System.Windows.Automation.AutomationElement]::FromHandle($h)
  foreach ($e in $el.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) {
    if ($e.Current.AutomationId -match '^CommandButton_(\d+)$') {
      [XgSidecarWin]::PostMessage($h, $TDM_CLICK_BUTTON, [IntPtr][int]$Matches[1], [IntPtr]::Zero) | Out-Null
      return
    }
  }
  [XgSidecarWin]::PostMessage($h, $WM_CLOSE, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
}

# Answers "Save Game" with No. Closes any other XG dialog and returns its text.
function Get-Dialogs($xg) {
  [XgSidecarWin]::Windows($xg.Pid) | Where-Object { @("#32770", "TMessageForm") -contains [XgSidecarWin]::ClassOf($_) }
}

function Resolve-Dialogs($xg) {
  $errors = @()
  foreach ($h in Get-Dialogs $xg) {
    $title = [XgSidecarWin]::TitleOf($h)
    if ($title -eq "Save Game") {
      [XgSidecarWin]::PostMessage($h, $TDM_CLICK_BUTTON, [IntPtr]$IDNO, [IntPtr]::Zero) | Out-Null
      continue
    }
    $errors += (Get-DialogText $h)
    Close-Dialog $h
  }
  if ($errors.Count -gt 0) { Start-Sleep -Milliseconds 300 }
  return $errors
}

function Invoke-Clipboard([scriptblock]$action) {
  for ($i = 0; ; $i++) {
    try { return & $action } catch { if ($i -ge 20) { throw }; Start-Sleep -Milliseconds 50 }
  }
}

# Posts an export command and waits for XG to replace a sentinel on the clipboard.
function Read-Export($xg, [int]$cmd) {
  $sentinel = "xg-sidecar-" + [guid]::NewGuid()
  Invoke-Clipboard { [System.Windows.Forms.Clipboard]::SetText($sentinel) } | Out-Null
  Send-XgCommand $xg $cmd
  $deadline = (Get-Date).AddSeconds(5)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 50
    $text = Invoke-Clipboard { [System.Windows.Forms.Clipboard]::GetText() }
    if ($text -ne $sentinel) { return ($text -replace "`r", "") }
  }
  throw "XG did not answer export command $cmd (is a dialog open, or is this not XG 2.10?)"
}

function First-Xgid([string]$text) {
  ($text -split "`n" | ForEach-Object { $_.Trim([char]0xFEFF).Trim() } | Where-Object { $_.StartsWith("XGID=") } | Select-Object -First 1)
}

function Invoke-XgQuery([string]$xgid, [string]$kind) {
  if ($xgid -notmatch '^XGID=[-a-pA-P]{26}(:-?\d+){3}:(\d\d|00)(:\d+){5}$') { throw "not an XGID: $xgid" }
  switch ($kind) {
    "checker" { $analyze = $CmdAnalyzePosition; $marker = '(?m)^\s+1\.\s' }
    "cube" { $analyze = $CmdAnalyzeCube; $marker = '(?m)^Best Cube action:' }
    default { throw "kind must be checker or cube (got $kind)" }
  }
  $xg = Get-Xg
  $stray = Resolve-Dialogs $xg
  if ($stray.Count -gt 0) { Write-Host "closed stray XG dialog: $($stray -join ' | ')" }

  # Import, then confirm XG shows exactly this position. XG reads the clipboard only after
  # the "Save Game" prompt is answered, so the clipboard must hold the XGID until the import
  # handler has returned. The import is sent (not posted): it returns when the handler does,
  # or times out while the prompt is up. After that, no dialog plus an idle UI thread means
  # the handler has finished.
  # For a few seconds after an analysis (while XG draws the hint on the board) XG ignores the
  # import without a word. An ignored import changes nothing, so retry until it lands.
  $echo = $null
  $importDeadline = (Get-Date).AddSeconds(30)
  for ($attempt = 1; $echo -ne $xgid -and ($attempt -eq 1 -or (Get-Date) -lt $importDeadline); $attempt++) {
    if ($attempt -gt 1) { Start-Sleep -Milliseconds 250 }
    Invoke-Clipboard { [System.Windows.Forms.Clipboard]::SetText($xgid) } | Out-Null
    $done = [XgSidecarWin]::Command($xg.Main, $CmdImportClipboard, 500)
    for ($i = 0; $i -lt 100 -and -not $done; $i++) {
      $open = @(Get-Dialogs $xg).Count
      $errors = Resolve-Dialogs $xg
      if ($errors.Count -gt 0) { throw ($errors -join " | ") }
      Start-Sleep -Milliseconds 150
      if ($open -eq 0 -and @(Get-Dialogs $xg).Count -eq 0) { $done = [XgSidecarWin]::Idle($xg.Main, 5000) }
    }
    $errors = Resolve-Dialogs $xg
    if ($errors.Count -gt 0) { throw ($errors -join " | ") }
    try {
      $echo = First-Xgid (Read-Export $xg $CmdExportXgid)
    } catch {
      # XG's UI thread is busy. Let it drain everything queued, then import again.
      $echo = $null
      $idle = [XgSidecarWin]::Idle($xg.Main, 30000)
      Write-DebugLog "import attempt ${attempt}: export timed out; idle afterwards=$idle"
      continue
    }
    Write-DebugLog "import attempt $attempt shows $echo"
  }
  if ($echo -ne $xgid) { throw "XG did not load $xgid (it shows $echo)" }

  # Analyze and wait until the exported text is the same three times in a row.
  Send-XgCommand $xg $analyze
  $deadline = (Get-Date).AddSeconds($AnalysisTimeoutSec)
  $last = $null; $same = 0
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 200
    $errors = Resolve-Dialogs $xg
    if ($errors.Count -gt 0) { throw ($errors -join " | ") }
    # A long analysis keeps XG's UI thread busy; the export then waits. Keep polling.
    try { $text = Read-Export $xg $CmdExportText } catch { Write-DebugLog "analysis still running: $_"; continue }
    if ((First-Xgid $text) -ne $xgid) { throw "XG text is for $(First-Xgid $text), not $xgid" }
    if ($text -notmatch $marker) { $last = $null; $same = 0; continue }
    if ($text -eq $last) { $same++ } else { $last = $text; $same = 0 }
    if ($same -ge 2) { return $text }
  }
  throw "XG analysis did not finish in $AnalysisTimeoutSec s"
}

# Minimal HTTP/1.1 over TcpListener: no URL ACL and no Host-header check
# (the arena calls in as host.docker.internal).
function Read-Request($client) {
  $stream = $client.GetStream()
  $stream.ReadTimeout = 10000
  $buf = New-Object byte[] 65536
  $ms = New-Object IO.MemoryStream
  $headerEnd = -1
  while ($headerEnd -lt 0) {
    $n = $stream.Read($buf, 0, $buf.Length)
    if ($n -le 0) { return $null }
    $ms.Write($buf, 0, $n)
    $headerEnd = [Text.Encoding]::ASCII.GetString($ms.ToArray()).IndexOf("`r`n`r`n")
  }
  $all = $ms.ToArray()
  $head = [Text.Encoding]::ASCII.GetString($all, 0, $headerEnd)
  $lines = $head -split "`r`n"
  $parts = $lines[0] -split " "
  $length = 0
  foreach ($l in ($lines | Select-Object -Skip 1)) { if ($l -match '^Content-Length:\s*(\d+)') { $length = [int]$Matches[1] } }
  $body = New-Object IO.MemoryStream
  $body.Write($all, $headerEnd + 4, $all.Length - $headerEnd - 4)
  while ($body.Length -lt $length) {
    $n = $stream.Read($buf, 0, $buf.Length)
    if ($n -le 0) { break }
    $body.Write($buf, 0, $n)
  }
  [pscustomobject]@{ Method = $parts[0]; Path = $parts[1]; Body = [Text.Encoding]::UTF8.GetString($body.ToArray()) }
}

function Write-Json($client, [int]$status, $obj) {
  $reason = @{ 200 = "OK"; 400 = "Bad Request"; 404 = "Not Found"; 422 = "Unprocessable Entity"; 503 = "Service Unavailable" }[$status]
  $json = [Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Compress))
  $head = [Text.Encoding]::ASCII.GetBytes("HTTP/1.1 $status $reason`r`nContent-Type: application/json; charset=utf-8`r`nContent-Length: $($json.Length)`r`nConnection: close`r`n`r`n")
  $stream = $client.GetStream()
  $stream.Write($head, 0, $head.Length)
  $stream.Write($json, 0, $json.Length)
  $stream.Flush()
}

$listener = New-Object Net.Sockets.TcpListener ([Net.IPAddress]::Parse($BindAddress)), $Port
$listener.Start()
try {
  $xg = Get-Xg
  Write-Host "XG sidecar on http://${BindAddress}:$Port for '$($xg.Title)' (pid $($xg.Pid))"
  if ($xg.Title -notmatch '2\.10') { Write-Warning "menu command ids are for XG 2.10; check them for this build" }
} catch {
  Write-Warning "$_ (start XG before the first query)"
}
Write-Host "Ctrl+C to stop. Keep XG open; you can keep using other windows."

while ($true) {
  if (-not $listener.Pending()) { Start-Sleep -Milliseconds 50; continue }
  $client = $listener.AcceptTcpClient()
  try {
    $req = Read-Request $client
    if (-not $req) { continue }
    if ($req.Method -eq "GET" -and $req.Path -eq "/health") {
      try {
        $xg = Get-Xg
        Write-Json $client 200 @{ ok = $true; version = $xg.Title; pid = $xg.Pid }
      } catch {
        Write-Json $client 503 @{ ok = $false; error = "$_" }
      }
    } elseif ($req.Method -eq "POST" -and $req.Path -eq "/v1/query") {
      $saved = Invoke-Clipboard { if ([System.Windows.Forms.Clipboard]::ContainsText()) { [System.Windows.Forms.Clipboard]::GetText() } else { $null } }
      $sw = [Diagnostics.Stopwatch]::StartNew()
      try {
        $q = $req.Body | ConvertFrom-Json
        $text = Invoke-XgQuery ([string]$q.xgid) ([string]$q.kind)
        Write-Host ("{0} {1} {2}ms" -f $q.kind, $q.xgid, $sw.ElapsedMilliseconds)
        Write-Json $client 200 @{ ok = $true; text = $text }
      } catch {
        Write-Host ("FAIL {0}: {1}" -f $req.Body, $_)
        Write-Json $client 422 @{ ok = $false; error = "$_" }
      } finally {
        if ($null -ne $saved) { Invoke-Clipboard { [System.Windows.Forms.Clipboard]::SetText($saved) } | Out-Null }
      }
    } else {
      Write-Json $client 404 @{ ok = $false; error = "not found" }
    }
  } catch {
    Write-Host "request error: $_"
  } finally {
    $client.Close()
  }
}

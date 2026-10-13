param([uint32]$ExpectedProcessId = 0)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
# Read only the active control's selected text. Never copy or read the full document.
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class SelectedTextWindow {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
}
'@
function Send-Result($result) { [Console]::WriteLine((ConvertTo-Json -InputObject $result -Compress -Depth 3)) }
try {
  $foreground = [SelectedTextWindow]::GetForegroundWindow()
  [uint32]$sourcePid = 0
  [void][SelectedTextWindow]::GetWindowThreadProcessId($foreground, [ref]$sourcePid)
  if ($ExpectedProcessId -ne 0 -and $sourcePid -ne $ExpectedProcessId) { Send-Result @{ok=$false; reason='changed'}; exit }
  $element = [System.Windows.Automation.AutomationElement]::FocusedElement
  $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  $text = ''
  for ($i = 0; $i -lt 12 -and $null -ne $element; $i++) {
    if ($element.Current.ProcessId -ne $sourcePid) { break }
    if ($element.Current.IsPassword) { Send-Result @{ok=$false; reason='password'}; exit }
    $pattern = $null
    if ($element.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$pattern)) {
      foreach ($range in $pattern.GetSelection()) {
        $part = $range.GetText(8001)
        if (-not [string]::IsNullOrWhiteSpace($part)) { $text += $part + [Environment]::NewLine }
        if ($text.Trim().Length -gt 8000) { Send-Result @{ok=$false; reason='tooLong'}; exit }
      }
      if (-not [string]::IsNullOrWhiteSpace($text)) { break }
    }
    $element = $walker.GetParent($element)
  }
  if ([SelectedTextWindow]::GetForegroundWindow() -ne $foreground) { Send-Result @{ok=$false; reason='changed'}; exit }
  if ([string]::IsNullOrWhiteSpace($text)) { Send-Result @{ok=$false; reason='unsupported'}; exit }
  Send-Result @{ok=$true; text=$text.Trim()}
} catch { Send-Result @{ok=$false; reason='unsupported'} }

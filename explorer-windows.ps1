param([int]$PetProcessId = 0, [switch]$Once)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class ExplorerFrames {
  public delegate bool EnumProc(IntPtr window, IntPtr data);
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumProc callback, IntPtr data);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  public static bool CopyPressed() {
    return (GetAsyncKeyState(0x11) & 0x8000)!=0 && (GetAsyncKeyState(0x43) & 0x8000)!=0 &&
      (GetAsyncKeyState(0x12) & 0x8000)==0;
  }
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr window, StringBuilder name, int count);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr window, ref Point point);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out Rect value, int size);
  [DllImport("dwmapi.dll", EntryPoint="DwmGetWindowAttribute")] static extern int GetCloaked(IntPtr window, int attribute, out int value, int size);
  public class Box { public int x, y, width, height; public Box(int x0,int y0,int w,int h) { x=x0; y=y0; width=w; height=h; } }
  public class Frame { public string id; public Box bounds, client; public bool browser; public List<Box> viewports; }
  public static List<Frame> Read() {
    var frames = new List<Frame>();
    var previous = SetThreadDpiAwarenessContext(new IntPtr(-4));
    try {
      EnumWindows(delegate(IntPtr window, IntPtr data) {
        if (!IsWindowVisible(window) || IsIconic(window)) return true;
        var name = new StringBuilder(256); GetClassName(window, name, name.Capacity);
        bool browser = name.ToString() == "Chrome_WidgetWin_1" && window == GetForegroundWindow();
        if (!browser && name.ToString() != "CabinetWClass" && name.ToString() != "ExploreWClass") return true;
        int cloaked; if (GetCloaked(window,14,out cloaked,4)==0 && cloaked!=0) return true;
        Rect rect, client;
        if (DwmGetWindowAttribute(window,9,out rect,16)!=0 && !GetWindowRect(window,out rect)) return true;
        if (!GetClientRect(window,out client)) return true;
        var origin = new Point(); if (!ClientToScreen(window,ref origin)) return true;
        if (rect.Right <= rect.Left || rect.Bottom <= rect.Top) return true;
        var viewports = new List<Box>();
        if (browser) EnumChildWindows(window, delegate(IntPtr child, IntPtr unused) {
          var childName = new StringBuilder(256); GetClassName(child,childName,childName.Capacity);
          Rect box;
          if (IsWindowVisible(child) && childName.ToString()=="Chrome_RenderWidgetHostHWND" && GetWindowRect(child,out box))
            viewports.Add(new Box(box.Left,box.Top,box.Right-box.Left,box.Bottom-box.Top));
          return true;
        },IntPtr.Zero);
        frames.Add(new Frame { id=window.ToInt64().ToString(), bounds=new Box(rect.Left,rect.Top,rect.Right-rect.Left,rect.Bottom-rect.Top), client=new Box(origin.X,origin.Y,client.Right-client.Left,client.Bottom-client.Top), browser=browser, viewports=viewports });
        return true;
      },IntPtr.Zero);
    } finally { if (previous!=IntPtr.Zero) SetThreadDpiAwarenessContext(previous); }
    return frames;
  }
}
'@
$nextFrames = [DateTime]::MinValue
$copyHeld = $false
while ($true) {
  if ($PetProcessId -ne 0 -and -not (Get-Process -Id $PetProcessId -ErrorAction SilentlyContinue)) { break }
  $copy = [ExplorerFrames]::CopyPressed()
  if ($copy -and -not $copyHeld -and -not $Once) { [Console]::WriteLine('{"copy":true}'); [Console]::Out.Flush() }
  $copyHeld = $copy
  if ([DateTime]::UtcNow -ge $nextFrames) {
    $frames = @([ExplorerFrames]::Read())
    [Console]::WriteLine((ConvertTo-Json -InputObject $frames -Depth 5 -Compress))
    [Console]::Out.Flush()
    $nextFrames = [DateTime]::UtcNow.AddMilliseconds(180)
  }
  if ($Once) { break }
  Start-Sleep -Milliseconds 15
}

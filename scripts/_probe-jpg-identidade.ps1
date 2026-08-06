$ErrorActionPreference = 'Stop'
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$out = 'c:\Users\trind\Desktop\Dashboards\relatorios\jpg-movimento\identidade-por-arquivo.txt'
$sb = New-Object System.Text.StringBuilder

function Cell($ws, $r, $c) {
  $t = $ws.Cells.Item($r, $c).Text
  if ($null -eq $t) { return '' }
  return ([string]$t).Trim()
}

function Probe-File($path) {
  $wb = $excel.Workbooks.Open($path)
  $ws = $wb.Worksheets.Item(1)
  $used = $ws.UsedRange
  $folder = Split-Path (Split-Path $path -Parent) -Leaf
  $name = [IO.Path]::GetFileName($path)
  [void]$sb.AppendLine("==== $folder / $name ====")
  [void]$sb.AppendLine("sheet=$($ws.Name) rows=$($used.Rows.Count) cols=$($used.Columns.Count)")
  for ($r = 1; $r -le 5; $r++) {
    $parts = @()
    for ($c = 1; $c -le [Math]::Min(6, $used.Columns.Count); $c++) {
      $t = Cell $ws $r $c
      if ($t) { $parts += "C${c}:$t" }
    }
    [void]$sb.AppendLine("L$r $($parts -join ' | ')")
  }
  $wb.Close($false)
}

try {
  foreach ($d in @('mg', 'ind', 'curitiba', 'matriz e filial')) {
    $dir = Join-Path 'c:\Users\trind\Desktop' $d
    Get-ChildItem -LiteralPath $dir -File | Where-Object { $_.Extension -match 'xls' } | ForEach-Object {
      Write-Host "PROBE $($_.Name)"
      Probe-File $_.FullName
    }
  }
}
finally {
  $excel.Quit()
  [Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}

[IO.File]::WriteAllText($out, $sb.ToString(), [Text.UTF8Encoding]::new($false))
Write-Host "WROTE $out"
Get-Content -Encoding UTF8 $out

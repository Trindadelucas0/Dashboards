# Export JPG Filial PR Jul/2026 raw JSON
$ErrorActionPreference = "Stop"
$fonteDir = "d:\Nova pasta\Nova pasta\06-08"
$outDir = Join-Path $PSScriptRoot "..\relatorios\2026-07\raw"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$map = [ordered]@{
  "jpg-pr-entradas" = "Relatorio de entrada por fornecedor JPG filial PR 072026.xls"
  "jpg-pr-saidas" = "Relatorio de saida por cliente JPG filial PR 072026.xls"
}

function Get-CellText($ws, $r, $c) {
  $t = $ws.Cells.Item($r, $c).Text
  if ($null -eq $t) { return "" }
  return ([string]$t).Trim()
}

function Get-CellNum($ws, $r, $c) {
  $v = $ws.Cells.Item($r, $c).Value2
  if ($null -eq $v) { return $null }
  if ($v -is [double] -or $v -is [decimal] -or $v -is [int] -or $v -is [long]) { return [double]$v }
  $s = ([string]$v).Trim()
  if (-not $s) { return $null }
  if ($s -match '^\d{1,3}(\.\d{3})*,\d+$') {
    $s = $s.Replace('.', '').Replace(',', '.')
    return [double]$s
  }
  $parsed = 0.0
  if ([double]::TryParse($s, [ref]$parsed)) { return $parsed }
  return $null
}

function Format-Cfop($rawText, $rawVal) {
  $t = if ($rawText) { $rawText.Trim() } else { "" }
  if ($t -match '^(\d)-(\d{3})$') { return $t }
  if ($t -match '^(\d)\.(\d{3})$') { return "$($Matches[1])-$($Matches[2])" }
  if ($t -match '^(\d)(\d{3})$') { return "$($Matches[1])-$($Matches[2])" }
  if ($null -ne $rawVal) {
    $n = [int][Math]::Round([double]$rawVal)
    $s = $n.ToString()
    if ($s.Length -eq 4) { return "$($s.Substring(0,1))-$($s.Substring(1))" }
  }
  return $t
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$excel.ScreenUpdating = $false

try {
  foreach ($key in $map.Keys) {
    $fileName = $map[$key]
    $path = Join-Path $fonteDir $fileName
    Write-Host "Exportando $key"
    $wb = $excel.Workbooks.Open($path)
    $ws = $wb.Worksheets.Item(1)
    $used = $ws.UsedRange
    $rows = $used.Rows.Count

    $company = Get-CellText $ws 1 1
    $cnpj = Get-CellText $ws 2 4
    if (-not $cnpj) { $cnpj = Get-CellText $ws 2 3 }
    $period = Get-CellText $ws 4 4
    if (-not $period) { $period = Get-CellText $ws 4 3 }
    $isEntradas = $key -like "*-entradas"

    $lines = New-Object System.Collections.Generic.List[object]
    $totalGeral = $null
    $totalIcms = 0.0
    $totalIpi = 0.0
    $last = $null

    for ($r = 7; $r -le $rows; $r++) {
      $c1 = Get-CellText $ws $r 1
      if ($c1 -match '^Total Geral') {
        for ($tr = $r; $tr -le [Math]::Min($r + 4, $rows); $tr++) {
          if ($isEntradas) {
            $n = Get-CellNum $ws $tr 20
            if ($null -ne $n -and $n -gt 0 -and $null -eq $totalGeral) { $totalGeral = $n }
            $tax = Get-CellText $ws $tr 21
            $tv = Get-CellNum $ws $tr 24
            if ($tax -match 'ICMS' -and $null -ne $tv) { $totalIcms = $tv }
            if ($tax -match 'IPI' -and $null -ne $tv) { $totalIpi = $tv }
          } else {
            $n = Get-CellNum $ws $tr 23
            if ($null -eq $n) { $n = Get-CellNum $ws $tr 24 }
            if ($null -ne $n -and $n -gt 0 -and $null -eq $totalGeral) { $totalGeral = $n }
          }
        }
        break
      }
      if ($c1 -match '^Total Fornecedor' -or $c1 -match '^Total Cliente') { continue }
      if ($c1 -match '^ACOMPANHAMENTO' -or $c1 -match '^C.?digo' -or $c1 -match '^Sistema') { continue }

      # tax continuation row (IPI) without codigo
      if (-not $c1 -or $c1 -notmatch '^\d+$') {
        $tax = if ($isEntradas) { Get-CellText $ws $r 21 } else { Get-CellText $ws $r 26 }
        if ($last -and $tax -match 'IPI') {
          $ipiCol = if ($isEntradas) { 24 } else { 29 }
          $ipi = Get-CellNum $ws $r $ipiCol
          if ($null -ne $ipi) { $last.ipi = [Math]::Round($ipi, 2) }
        }
        continue
      }

      if ($isEntradas) {
        $nota = Get-CellText $ws $r 6
        $serie = Get-CellText $ws $r 8
        $nome = Get-CellText $ws $r 11
        $doc = Get-CellText $ws $r 13
        $cfopText = Get-CellText $ws $r 17
        $cfopVal = $ws.Cells.Item($r, 17).Value2
        $uf = Get-CellText $ws $r 19
        $valor = Get-CellNum $ws $r 20
        $tax = Get-CellText $ws $r 21
        $base = Get-CellNum $ws $r 22
        $imposto = Get-CellNum $ws $r 24
        $data = Get-CellText $ws $r 5
      } else {
        $nota = Get-CellText $ws $r 5
        $serie = Get-CellText $ws $r 6
        $nome = Get-CellText $ws $r 12
        $doc = Get-CellText $ws $r 16
        $cfopText = Get-CellText $ws $r 18
        $cfopVal = $ws.Cells.Item($r, 18).Value2
        $uf = Get-CellText $ws $r 22
        $valor = Get-CellNum $ws $r 23
        if ($null -eq $valor) { $valor = Get-CellNum $ws $r 24 }
        $tax = Get-CellText $ws $r 26
        $base = Get-CellNum $ws $r 27
        $imposto = Get-CellNum $ws $r 29
        $data = Get-CellText $ws $r 4
      }

      if ($null -eq $valor) { continue }
      $cfop = Format-Cfop $cfopText $cfopVal
      if (-not $cfop) { continue }

      $icms = 0.0
      $ipi = 0.0
      if ($tax -match 'ICMS' -and $null -ne $imposto) { $icms = [Math]::Round($imposto, 2) }
      if ($tax -match 'IPI' -and $null -ne $imposto) { $ipi = [Math]::Round($imposto, 2) }

      $obj = [ordered]@{
        codigo = $c1
        data = $data
        nota = $nota
        serie = $serie
        nome = $nome
        doc = $doc
        uf = $uf
        cfop = $cfop
        valor = [Math]::Round($valor, 2)
        base = if ($null -ne $base) { [Math]::Round($base, 2) } else { 0 }
        icms = $icms
        ipi = $ipi
      }
      $lines.Add($obj) | Out-Null
      $last = $obj
    }

    $payload = [ordered]@{
      key = $key
      file = $fileName
      sheet = $ws.Name
      tipo = $(if ($isEntradas) { "entradas" } else { "saidas" })
      company = $company
      cnpj = $cnpj
      period = $period
      totalGeral = $totalGeral
      totalIcms = $totalIcms
      totalIpi = $totalIpi
      lineCount = $lines.Count
      lines = $lines
    }
    $outPath = Join-Path $outDir "$key.json"
    $json = $payload | ConvertTo-Json -Depth 6 -Compress
    [System.IO.File]::WriteAllText($outPath, $json, [System.Text.UTF8Encoding]::new($false))
    Write-Host ("  lines={0} total={1} icms={2} ipi={3}" -f $lines.Count, $totalGeral, $totalIcms, $totalIpi)
    $wb.Close($false)
  }
}
finally {
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
Write-Host "DONE"

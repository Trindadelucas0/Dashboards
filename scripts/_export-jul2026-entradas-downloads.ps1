# Exporta apenas entradas Loja + Baifer Jul/2026 a partir de Downloads.
$ErrorActionPreference = "Stop"
$outDir = Join-Path $PSScriptRoot "..\relatorios\jul2026\raw"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$map = [ordered]@{
  "loja-entradas" = "c:\Users\trind\Downloads\Entrada por fornecedor loja das maquinas 072026 (1).xls"
  "baifer-entradas" = "c:\Users\trind\Downloads\Entradas por fornecedor 072026.xls"
}

function Get-CellText($ws, $r, $c) {
  $t = $ws.Cells.Item($r, $c).Text
  if ($null -eq $t) { return "" }
  return ([string]$t).Trim()
}

function Get-CellNum($ws, $r, $c) {
  $v = $ws.Cells.Item($r, $c).Value2
  if ($null -eq $v) { return $null }
  if ($v -is [double] -or $v -is [decimal] -or $v -is [int] -or $v -is [long]) {
    return [double]$v
  }
  $s = [string]$v
  $s = $s.Trim()
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
    $path = $map[$key]
    if (-not (Test-Path -LiteralPath $path)) {
      throw "Arquivo ausente: $path"
    }
    $fileName = [System.IO.Path]::GetFileName($path)
    Write-Host "Exportando $key <- $fileName"
    $wb = $excel.Workbooks.Open($path)
    $ws = $wb.Worksheets.Item(1)
    $used = $ws.UsedRange
    $rows = $used.Rows.Count

    $company = Get-CellText $ws 1 1
    $cnpj = Get-CellText $ws 2 4
    if (-not $cnpj) { $cnpj = Get-CellText $ws 2 3 }
    if (-not $cnpj) { $cnpj = Get-CellText $ws 2 2 }
    $period = Get-CellText $ws 4 4
    if (-not $period) { $period = Get-CellText $ws 4 3 }
    if (-not $period) { $period = Get-CellText $ws 4 2 }

    $sheetName = $ws.Name
    $isEntradas = $true
    if ($sheetName -match 'Sa') { $isEntradas = $false }
    if ($sheetName -match 'Entr') { $isEntradas = $true }
    if (-not $isEntradas) { throw "Esperava aba Entradas em $key, veio: $sheetName" }

    $lines = New-Object System.Collections.Generic.List[object]
    $totalGeral = $null
    $totalGeralRow = $null

    for ($r = 7; $r -le $rows; $r++) {
      $c1 = Get-CellText $ws $r 1
      if ($c1 -match '^Total Geral') {
        $totalGeralRow = $r
        for ($tr = $r; $tr -le [Math]::Min($r + 3, $rows); $tr++) {
          $n = Get-CellNum $ws $tr 20
          if ($null -ne $n -and $n -gt 0) { $totalGeral = $n; break }
        }
        break
      }
      if ($c1 -match '^Total Fornecedor' -or $c1 -match '^Total Cliente') { continue }
      if ($c1 -match '^ACOMPANHAMENTO') { continue }
      if ($c1 -match '^C.?digo' -or $c1 -match '^Codigo') { continue }
      if ($c1 -match '^Sistema licenciado') { continue }
      if (-not $c1) { continue }
      if ($c1 -notmatch '^\d+$') { continue }

      $nota = Get-CellText $ws $r 6
      $serie = Get-CellText $ws $r 8
      $nome = Get-CellText $ws $r 11
      $doc = Get-CellText $ws $r 13
      $cfopText = Get-CellText $ws $r 17
      $cfopVal = $ws.Cells.Item($r, 17).Value2
      $uf = Get-CellText $ws $r 19
      $valor = Get-CellNum $ws $r 20

      if ($null -eq $valor) { continue }
      $cfop = Format-Cfop $cfopText $cfopVal
      if (-not $cfop) { continue }

      $lines.Add([ordered]@{
        codigo = $c1
        nota = $nota
        serie = $serie
        nome = $nome
        doc = $doc
        uf = $uf
        cfop = $cfop
        valor = [Math]::Round($valor, 2)
      }) | Out-Null
    }

    $payload = [ordered]@{
      key = $key
      file = $fileName
      sourcePath = $path
      sheet = $sheetName
      tipo = "entradas"
      company = $company
      cnpj = $cnpj
      period = $period
      totalGeral = $totalGeral
      totalGeralRow = $totalGeralRow
      lineCount = $lines.Count
      lines = $lines
    }

    $outPath = Join-Path $outDir "$key.json"
    $json = $payload | ConvertTo-Json -Depth 6 -Compress
    [System.IO.File]::WriteAllText($outPath, $json, [System.Text.UTF8Encoding]::new($false))
    Write-Host ("  lines={0} totalGeral={1} cnpj={2}" -f $lines.Count, $totalGeral, $cnpj)

    $wb.Close($false)
  }
}
finally {
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

Write-Host "DONE export entradas downloads"

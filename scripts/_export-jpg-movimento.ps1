# Discover-and-export JPG XLS (avoids UTF-8 path issues in JSON)
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$outDir = Join-Path $root "relatorios\jpg-movimento\raw"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# Match by folder + fileNameContains + size when ambiguous
$jobs = @(
  @{ key='mg-jun-entradas'; dir='mg'; match='Entradas (1).xls'; tipo='entradas'; unidade='MG'; modo='mensal'; competencia='2026-06' },
  @{ key='mg-jun-saidas'; dir='mg'; match='Sa*das (2).xls'; tipo='saidas'; unidade='MG'; modo='mensal'; competencia='2026-06' },
  @{ key='mg-janmai-entradas'; dir='mg'; match='entradas a jan a jun.xls'; tipo='entradas'; unidade='MG'; modo='acumulado' },
  @{ key='mg-janmai-saidas'; dir='mg'; match='Sa*das.xls jan a junho (2).xls'; tipo='saidas'; unidade='MG'; modo='acumulado' },

  @{ key='sp-jun-entradas'; dir='mg'; match='Entradas.xls'; tipo='entradas'; unidade='SP'; modo='mensal'; competencia='2026-06'; exact=$true },
  @{ key='sp-jun-saidas'; dir='mg'; match='Sa*das (1).xls'; tipo='saidas'; unidade='SP'; modo='mensal'; competencia='2026-06' },
  @{ key='sp-janmai-saidas'; dir='mg'; match='Sa*das.xls jan a junho (1).xls'; tipo='saidas'; unidade='SP'; modo='acumulado' },

  @{ key='matriz-jun-entradas'; dir='ind'; match='Entradas.xls'; tipo='entradas'; unidade='MATRIZ'; modo='mensal'; competencia='2026-06'; exact=$true },
  @{ key='matriz-jun-saidas'; dir='ind'; match='Sa*das (1).xls'; tipo='saidas'; unidade='MATRIZ'; modo='mensal'; competencia='2026-06' },
  @{ key='matriz-janmai-entradas'; dir='ind'; match='Entradas.xls jan a junho.xls'; tipo='entradas'; unidade='MATRIZ'; modo='acumulado' },
  @{ key='matriz-janmai-saidas'; dir='ind'; match='Sa*das.xls jan a maio.xls'; tipo='saidas'; unidade='MATRIZ'; modo='acumulado' },

  @{ key='pr-jun-entradas'; dir='curitiba'; match='Entradas.xls'; tipo='entradas'; unidade='PR'; modo='mensal'; competencia='2026-06'; exact=$true },
  @{ key='pr-jun-saidas'; dir='curitiba'; match='Sa*das (1).xls'; tipo='saidas'; unidade='PR'; modo='mensal'; competencia='2026-06' },
  @{ key='pr-janmai-entradas'; dir='curitiba'; match='Entradas.xls jan  maio.xls'; tipo='entradas'; unidade='PR'; modo='acumulado' },
  @{ key='pr-mai-saidas'; dir='curitiba'; match='Sa*das.xls jan a maio.xls'; tipo='saidas'; unidade='PR'; modo='mensal'; competencia='2026-05' },

  @{ key='raiz-jun-entradas'; dir='matriz e filial'; match='Entradas.xls'; tipo='entradas'; unidade='RAIZ'; modo='mensal'; competencia='2026-06'; exact=$true },
  @{ key='raiz-janmai-entradas'; dir='matriz e filial'; match='Entradas.xls jan a maio.xls'; tipo='entradas'; unidade='RAIZ'; modo='acumulado' },
  @{ key='raiz-janmai-saidas'; dir='matriz e filial'; match='Sa*das.xls jan amaio.xls'; tipo='saidas'; unidade='RAIZ'; modo='acumulado' }
)

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

function Resolve-File($dirName, $pattern, $exact) {
  $dir = Join-Path "c:\Users\trind\Desktop" $dirName
  $files = Get-ChildItem -LiteralPath $dir -File
  if ($exact) {
    $hit = $files | Where-Object { $_.Name -eq $pattern }
  } else {
    $hit = $files | Where-Object { $_.Name -like $pattern }
  }
  if (-not $hit) { return $null }
  if ($hit -is [array]) { return $hit[0] }
  return $hit
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$excel.ScreenUpdating = $false

try {
  foreach ($job in $jobs) {
    $fi = Resolve-File $job.dir $job.match $job.exact
    if (-not $fi) { Write-Host "MISS $($job.key) pattern=$($job.match)"; continue }
    Write-Host "Export $($job.key) ← $($fi.FullName)"
    $wb = $excel.Workbooks.Open($fi.FullName)
    $ws = $wb.Worksheets.Item(1)
    $used = $ws.UsedRange
    $rows = $used.Rows.Count
    $cols = $used.Columns.Count

    $company = Get-CellText $ws 1 1
    $cnpj = Get-CellText $ws 2 4
    if (-not $cnpj) { $cnpj = Get-CellText $ws 2 3 }
    $period = Get-CellText $ws 4 4
    if (-not $period) { $period = Get-CellText $ws 4 3 }
    $isEntradas = ($job.tipo -eq 'entradas')

    $lines = New-Object System.Collections.Generic.List[object]
    $totalGeral = $null
    $totalIcms = 0.0
    $totalIpi = 0.0
    $last = $null

    for ($r = 6; $r -le $rows; $r++) {
      $c1 = Get-CellText $ws $r 1
      if ($c1 -match '^Total Geral') {
        for ($tr = $r; $tr -le [Math]::Min($r + 4, $rows); $tr++) {
          if ($isEntradas) {
            $n = Get-CellNum $ws $tr 20
            if ($null -eq $n -or $n -eq 0) {
              for ($c = $cols; $c -ge 1; $c--) {
                $cand = Get-CellNum $ws $tr $c
                if ($null -ne $cand -and $cand -gt 0) { $n = $cand; break }
              }
            }
            if ($null -ne $n -and $n -gt 0 -and $null -eq $totalGeral) { $totalGeral = $n }
            $tax = Get-CellText $ws $tr 21
            $tv = Get-CellNum $ws $tr 24
            if ($tax -match 'ICMS' -and $null -ne $tv) { $totalIcms = $tv }
            if ($tax -match 'IPI' -and $null -ne $tv) { $totalIpi = $tv }
          } else {
            $n = Get-CellNum $ws $tr 23
            if ($null -eq $n) { $n = Get-CellNum $ws $tr 24 }
            if ($null -eq $n -or $n -eq 0) {
              for ($c = $cols; $c -ge 1; $c--) {
                $cand = Get-CellNum $ws $tr $c
                if ($null -ne $cand -and $cand -gt 0) { $n = $cand; break }
              }
            }
            if ($null -ne $n -and $n -gt 0 -and $null -eq $totalGeral) { $totalGeral = $n }
          }
        }
        break
      }
      if ($c1 -match '^Total Fornecedor' -or $c1 -match '^Total Cliente') { continue }
      if ($c1 -match '^ACOMPANHAMENTO' -or $c1 -match '^C.?digo' -or $c1 -match '^Sistema') { continue }

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
        if (-not $nota) { $nota = Get-CellText $ws $r 5 }
        $serie = Get-CellText $ws $r 8
        $nome = Get-CellText $ws $r 11
        if (-not $nome) { $nome = Get-CellText $ws $r 10 }
        $doc = Get-CellText $ws $r 13
        if (-not $doc) { $doc = Get-CellText $ws $r 12 }
        $cfopText = Get-CellText $ws $r 17
        $cfopVal = $ws.Cells.Item($r, 17).Value2
        if (-not $cfopText -and $cols -ge 15) {
          # alternate layout (raiz): scan row for 4-digit cfop-like
          for ($c = 1; $c -le [Math]::Min($cols, 30); $c++) {
            $t = Get-CellText $ws $r $c
            if ($t -match '^\d[-\.]?\d{3}$') { $cfopText = $t; $cfopVal = $ws.Cells.Item($r, $c).Value2; break }
          }
        }
        $uf = Get-CellText $ws $r 19
        $valor = Get-CellNum $ws $r 20
        if ($null -eq $valor) {
          for ($c = $cols; $c -ge 1; $c--) {
            $cand = Get-CellNum $ws $r $c
            if ($null -ne $cand -and $cand -gt 1) { $valor = $cand; break }
          }
        }
        $tax = Get-CellText $ws $r 21
        $base = Get-CellNum $ws $r 22
        $imposto = Get-CellNum $ws $r 24
        $data = Get-CellText $ws $r 5
        if (-not $data) { $data = Get-CellText $ws $r 3 }
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

      $icms = 0.0; $ipi = 0.0
      if ($tax -match 'ICMS' -and $null -ne $imposto) { $icms = [Math]::Round($imposto, 2) }
      if ($tax -match 'IPI' -and $null -ne $imposto) { $ipi = [Math]::Round($imposto, 2) }

      $obj = [ordered]@{
        codigo=$c1; data=$data; nota=$nota; serie=$serie; nome=$nome; doc=$doc; uf=$uf;
        cfop=$cfop; valor=[Math]::Round($valor,2);
        base=$(if ($null -ne $base) { [Math]::Round($base,2) } else { 0 });
        icms=$icms; ipi=$ipi
      }
      $lines.Add($obj) | Out-Null
      $last = $obj
    }

    $payload = [ordered]@{
      key=$job.key; file=$fi.Name; path=$fi.FullName; sheet=$ws.Name; tipo=$job.tipo;
      unidade=$job.unidade; modo=$job.modo; competencia=$job.competencia;
      company=$company; cnpj=$cnpj; period=$period;
      totalGeral=$totalGeral; totalIcms=$totalIcms; totalIpi=$totalIpi;
      lineCount=$lines.Count; lines=$lines
    }
    $outPath = Join-Path $outDir ($job.key + '.json')
    [System.IO.File]::WriteAllText($outPath, ($payload | ConvertTo-Json -Depth 6 -Compress), [System.Text.UTF8Encoding]::new($false))
    Write-Host ("  lines={0} total={1} period={2}" -f $lines.Count, $totalGeral, $period)
    $wb.Close($false)
  }
}
finally {
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
Write-Host "DONE"

# Export SEDE (Documents\MATRIZ), Filial DF Jul, and impostos grupo XLSX
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$outDir = Join-Path $root "relatorios\jpg-sede-df-2026\raw"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

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
function Parse-MoneyText([string]$t) {
  if (-not $t) { return 0.0 }
  $s = $t.Trim()
  $neg = $false
  if ($s -match '^-' -or $s -match '^\(' -or $s -match '^-R') { $neg = $true }
  $s = $s -replace '[^\d,.\-]', ''
  $s = $s.Trim()
  if (-not $s -or $s -eq '-' -or $s -eq '.') { return 0.0 }
  if ($s -match '^\d{1,3}(\.\d{3})*,\d+$') {
    $s = $s.Replace('.', '').Replace(',', '.')
  } elseif ($s -match ',\d{1,2}$' -and $s -notmatch '\.') {
    $s = $s.Replace(',', '.')
  }
  $n = 0.0
  if (-not [double]::TryParse($s, [System.Globalization.NumberStyles]::Any, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$n)) {
    return 0.0
  }
  if ($neg) { $n = -[Math]::Abs($n) }
  return [Math]::Round($n, 2)
}

function Export-Movimento($excel, $path, $key, $tipo, $unidade, $modo, $competencia) {
  Write-Host "Export $key ← $path"
  $wb = $excel.Workbooks.Open($path)
  $ws = $wb.Worksheets.Item(1)
  $used = $ws.UsedRange
  $rows = $used.Rows.Count
  $cols = $used.Columns.Count
  $company = Get-CellText $ws 1 1
  $cnpj = Get-CellText $ws 2 4
  if (-not $cnpj) { $cnpj = Get-CellText $ws 2 3 }
  $ie = Get-CellText $ws 3 4
  if (-not $ie) { $ie = Get-CellText $ws 3 3 }
  $period = Get-CellText $ws 4 4
  if (-not $period) { $period = Get-CellText $ws 4 3 }
  $isEntradas = ($tipo -eq 'entradas')
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
      if (-not $data) { $data = Get-CellText $ws $r 2 }
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
      if (-not $data) { $data = Get-CellText $ws $r 2 }
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
    key=$key; file=(Split-Path $path -Leaf); path=$path; sheet=$ws.Name; tipo=$tipo;
    unidade=$unidade; modo=$modo; competencia=$competencia;
    company=$company; cnpj=$cnpj; ie=$ie; period=$period;
    totalGeral=$totalGeral; totalIcms=$totalIcms; totalIpi=$totalIpi;
    lineCount=$lines.Count; lines=$lines
  }
  $outPath = Join-Path $outDir ($key + '.json')
  [System.IO.File]::WriteAllText($outPath, ($payload | ConvertTo-Json -Depth 6 -Compress), [System.Text.UTF8Encoding]::new($false))
  Write-Host ("  lines={0} total={1} period={2}" -f $lines.Count, $totalGeral, $period)
  $wb.Close($false)
}

function Export-Impostos($excel, $path) {
  Write-Host "Export impostos ← $path"
  $wb = $excel.Workbooks.Open($path)
  $ws = $wb.Worksheets.Item(1)
  $rows = $ws.UsedRange.Rows.Count
  function Resolve-MesKey([string]$mesNome) {
    $n = ($mesNome -replace '\s', '').ToLowerInvariant()
    $n = $n.Normalize([Text.NormalizationForm]::FormD)
    $n = [regex]::Replace($n, '\p{M}', '')
    switch -Regex ($n) {
      '^janeiro' { return '2026-01' }
      '^fevereiro' { return '2026-02' }
      '^marco' { return '2026-03' }
      '^abril' { return '2026-04' }
      '^maio' { return '2026-05' }
      '^junho' { return '2026-06' }
      '^julho' { return '2026-07' }
      default { return $null }
    }
  }
  $filialMap = @{
    'Matriz'='SEDE'; 'Filial DF'='MATRIZ'; 'Filial PR'='PR'; 'Filial SP'='SP'; 'Filial MG'='MG'
  }
  $rowsOut = New-Object System.Collections.Generic.List[object]
  for ($r = 2; $r -le $rows; $r++) {
    $empresa = Get-CellText $ws $r 1
    $filial = Get-CellText $ws $r 2
    $mesNome = Get-CellText $ws $r 3
    if (-not $filial -or -not $mesNome) { continue }
    $mesKey = Resolve-MesKey $mesNome
    if (-not $mesKey) { Write-Host "  skip mes '$mesNome'"; continue }
    if (-not $filialMap.ContainsKey($filial)) { continue }
    $icmsCred = Parse-MoneyText (Get-CellText $ws $r 4)
    $icmsDeb = Parse-MoneyText (Get-CellText $ws $r 5)
    $icmsRec = Parse-MoneyText (Get-CellText $ws $r 6)
    $ipiCred = Parse-MoneyText (Get-CellText $ws $r 7)
    $ipiDeb = Parse-MoneyText (Get-CellText $ws $r 8)
    $ipiRec = Parse-MoneyText (Get-CellText $ws $r 9)
    $rowsOut.Add([ordered]@{
      empresa=$empresa; filial=$filial; unit=$filialMap[$filial]; mesNome=$mesNome;
      mes=$mesKey;
      icms_credito=$icmsCred; icms_debito=$icmsDeb; icms_a_recolher=$icmsRec;
      ipi_ent=$ipiCred; ipi_sai=$ipiDeb; ipi_a_recolher=$ipiRec;
      saldo_icms=[Math]::Round(($icmsDeb - $icmsCred), 2)
    }) | Out-Null
  }
  $payload = [ordered]@{
    key='impostos-grupo-jpg'; file=(Split-Path $path -Leaf); path=$path;
    rowCount=$rowsOut.Count; rows=$rowsOut
  }
  $outPath = Join-Path $outDir 'impostos-grupo-jpg.json'
  [System.IO.File]::WriteAllText($outPath, ($payload | ConvertTo-Json -Depth 6 -Compress), [System.Text.UTF8Encoding]::new($false))
  Write-Host ("  impostos rows={0}" -f $rowsOut.Count)
  $wb.Close($false)
}

$jobs = @(
  @{ key='sede-janago-entradas'; path='c:\Users\trind\Documents\MATRIZ\ENTRADA MATRIZ.xls'; tipo='entradas'; unidade='SEDE'; modo='acumulado'; competencia=$null },
  @{ key='sede-janago-saidas'; path='c:\Users\trind\Documents\MATRIZ\SAIDA MATRIZ.xls'; tipo='saidas'; unidade='SEDE'; modo='acumulado'; competencia=$null },
  @{ key='matriz-df-jul-entradas'; path='c:\Users\trind\Desktop\JPG\MATRIZ DF\IMPOSTOS\Relatorio de entrada por forncedor filial df 072026.xls'; tipo='entradas'; unidade='MATRIZ'; modo='mensal'; competencia='2026-07' },
  @{ key='matriz-df-jul-saidas'; path='c:\Users\trind\Desktop\JPG\MATRIZ DF\IMPOSTOS\Relatorio de saida por cliente filial df 072026.xls'; tipo='saidas'; unidade='MATRIZ'; modo='mensal'; competencia='2026-07' }
)

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$excel.ScreenUpdating = $false
try {
  foreach ($job in $jobs) {
    if (-not (Test-Path -LiteralPath $job.path)) { throw "Missing $($job.path)" }
    Export-Movimento $excel $job.path $job.key $job.tipo $job.unidade $job.modo $job.competencia
  }
  $taxPath = 'c:\Users\trind\Desktop\JPG\MATRIZ DF\IMPOSTOS\IMPOSTOS ICMS E IPI GRUPO JPG.xlsx'
  if (-not (Test-Path -LiteralPath $taxPath)) { throw "Missing $taxPath" }
  Export-Impostos $excel $taxPath
}
finally {
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
Write-Host "DONE"

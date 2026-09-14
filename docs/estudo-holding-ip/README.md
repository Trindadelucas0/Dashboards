# Estudo — Holding IP e Distribuidor Oficial

Briefing educacional para reunião com cliente (genérico, sem CNPJ/marca de um caso). **Não é parecer jurídico nem tributário.** Não faz parte da documentação do dashboard fiscal.

| Arquivo | Função |
|---------|--------|
| [estudo.html](estudo.html) | Texto-fonte (capa, sumário, 12 capítulos) |
| [print.css](print.css) | Layout A4 para tela e impressão |
| [estudo-holding-ip-distribuidor-oficial.pdf](estudo-holding-ip-distribuidor-oficial.pdf) | PDF para imprimir e levar |

## Como usar / imprimir

1. Abra `estudo.html` no Microsoft Edge (ou Chrome).
2. `Ctrl+P` → destino **Microsoft Print to PDF** ou **Salvar como PDF**.
3. Papel **A4**, margens **padrão** (o CSS já define 16 mm). Desligue cabeçalho/rodapé do navegador (data e URL).
4. Ative **Gráficos de segundo plano** para os boxes e a tabela manterem cor.

## Como regenerar o PDF (Windows / Edge)

No PowerShell, a partir desta pasta:

```powershell
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe" }
$html = (Resolve-Path .\estudo.html).Path
$pdf  = Join-Path (Get-Location) "estudo-holding-ip-distribuidor-oficial.pdf"
$url  = "file:///" + ($html -replace '\\','/')
& $edge --headless --disable-gpu --no-first-run --no-pdf-header-footer --print-to-pdf="$pdf" $url
```

## Conteúdo

1. O modelo em uma página  
2. O que é Holding IP  
3. O que é distribuidor oficial  
4. O que precisa existir para isso acontecer  
5. Normas da licença de uso de marca  
6. O que a lei diz sobre distribuidor oficial  
7. Markup (comercial × preço de transferência)  
8. Tributação no Brasil  
9. Tributação na Espanha  
10. Brasil × Espanha no mesmo grupo  
11. Riscos clássicos e exemplos públicos  
12. O que levar ao advogado e ao contador  

Versão da capa: setembro de 2026.

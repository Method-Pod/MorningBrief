# Testa a manutenção diária (/api/cron) em produção.
#
# Pede o CRON_SECRET na hora, usa só na chamada e não grava em lugar nenhum.
# A resposta vai para a tela e para resultado-cron.txt, que não contém segredo.
#
# Como rodar: abra o PowerShell e cole a linha que está no chat.

$url = "https://morningbrief-app.vercel.app/api/cron"

Write-Host ""
Write-Host "=== Testar a manutencao diaria do Morning Brief ===" -ForegroundColor Cyan
Write-Host ""
$segredo = Read-Host "Cole aqui o CRON_SECRET (o mesmo que voce colou no Vercel) e aperte Enter"

if ([string]::IsNullOrWhiteSpace($segredo)) {
  Write-Host "Nada foi colado. Rode de novo." -ForegroundColor Yellow
  exit 1
}

Write-Host ""
Write-Host "Chamando..." -ForegroundColor DarkGray

# Windows PowerShell 5.1 lanca excecao em status 4xx/5xx, entao o corpo da
# resposta de erro tem de ser lido do stream dentro do catch.
try {
  $resp = Invoke-WebRequest -Uri $url `
    -Headers @{ Authorization = "Bearer $segredo" } `
    -UseBasicParsing
  $status = [int]$resp.StatusCode
  $corpo = $resp.Content
} catch {
  $status = 0
  $corpo = ""
  if ($_.Exception.Response) {
    $status = [int]$_.Exception.Response.StatusCode
    $leitor = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $corpo = $leitor.ReadToEnd()
    $leitor.Close()
  } else {
    $corpo = $_.Exception.Message
  }
}

Write-Host ""
Write-Host "status HTTP: $status" -ForegroundColor Cyan
Write-Host ""
Write-Host $corpo
Write-Host ""

if ($status -eq 200) {
  Write-Host "DEU CERTO. A manutencao rodou." -ForegroundColor Green
  Write-Host "Zeros no relatorio sao normais hoje: nao havia nada pendente." -ForegroundColor DarkGray
} elseif ($status -eq 401) {
  Write-Host "SEGREDO NAO CONFERE. O valor colado aqui e o do Vercel sao diferentes," -ForegroundColor Yellow
  Write-Host "ou o CRON_SECRET nao foi salvo no Vercel / o Redeploy nao foi feito." -ForegroundColor Yellow
} else {
  Write-Host "DEU ERRO. Me mostre o resultado-cron.txt (nao tem segredo dentro)." -ForegroundColor Red
}

# Salva para eu poder ler sem voce copiar nada.
$saida = "status=$status`r`n$corpo"
$destino = Join-Path $PSScriptRoot "resultado-cron.txt"
$saida | Out-File -FilePath $destino -Encoding utf8
Write-Host ""
Write-Host "Resposta salva em resultado-cron.txt" -ForegroundColor DarkGray
Write-Host ""

$ErrorActionPreference = 'Stop'
$outputDir = Join-Path $PSScriptRoot 'screens'
New-Item -ItemType Directory -Force $outputDir | Out-Null

$target = Invoke-RestMethod 'http://127.0.0.1:9222/json/list' | Select-Object -First 1
$socket = [System.Net.WebSockets.ClientWebSocket]::new()
$socket.ConnectAsync([Uri]$target.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
$nextId = 0

function Invoke-Cdp([string]$method, [hashtable]$params = @{}) {
  $script:nextId++
  $requestId = $script:nextId
  $payload = @{ id = $requestId; method = $method; params = $params } | ConvertTo-Json -Compress -Depth 10
  $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
  $segment = [ArraySegment[byte]]::new($bytes)
  $socket.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  do {
    $buffer = [byte[]]::new(4MB)
    $result = $socket.ReceiveAsync([ArraySegment[byte]]::new($buffer), [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    $text = [Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count)
    $response = $text | ConvertFrom-Json
  } while ($response.id -ne $requestId)
  if ($response.error) { throw "$method failed: $($response.error.message)" }
  return $response.result
}

function Run-JavaScript([string]$expression) {
  Invoke-Cdp 'Runtime.evaluate' @{ expression = $expression; awaitPromise = $true; returnByValue = $true } | Out-Null
  Start-Sleep -Milliseconds 500
}

function Capture([string]$fileName, [string]$title) {
  $shot = Invoke-Cdp 'Page.captureScreenshot' @{ format = 'png'; fromSurface = $true }
  [IO.File]::WriteAllBytes((Join-Path $outputDir $fileName), [Convert]::FromBase64String($shot.data))
  [PSCustomObject]@{ file = $fileName; title = $title }
}

Invoke-Cdp 'Page.enable' | Out-Null
Invoke-Cdp 'Emulation.setDeviceMetricsOverride' @{ width = 1600; height = 1000; deviceScaleFactor = 1; mobile = $false } | Out-Null
Invoke-Cdp 'Page.navigate' @{ url = 'http://127.0.0.1:4173/' } | Out-Null
Start-Sleep -Seconds 2
$manifest = @()
$manifest += Capture '01-login.png' 'Login'
Run-JavaScript "[...document.querySelectorAll('button')].find(button => button.textContent.includes('Enter workspace')).click()"
Run-JavaScript "document.querySelector('.tour-close')?.click()"
$manifest += Capture '02-dashboard.png' 'Command centre dashboard'

$views = @(
  @('Case register', '03-case-register.png'),
  @('Site surveys', '04-site-surveys.png'),
  @('Notices & orders', '05-notices-orders.png'),
  @('Hearings', '06-hearings.png'),
  @('Legal tracking', '07-legal-tracking.png'),
  @('Demolition', '08-demolition.png'),
  @('Documents', '09-documents.png'),
  @('Intelligence', '10-intelligence.png'),
  @('People & access', '11-people-access.png'),
  @('Configuration', '12-configuration.png')
)
foreach ($view in $views) {
  Run-JavaScript "[...document.querySelectorAll('nav button')].find(button => button.title === '$($view[0])').click()"
  $manifest += Capture $view[1] $view[0]
}

Run-JavaScript "[...document.querySelectorAll('nav button')].find(button => button.title === 'Command centre').click()"
Run-JavaScript "document.querySelector('.exception-board > button')?.click()"
$manifest += Capture '13-case-detail.png' 'Case detail'
Run-JavaScript "[...document.querySelectorAll('.rail-footer button')].find(button => button.textContent.includes('Public disclosure')).click()"
$manifest += Capture '14-public-disclosure.png' 'Public disclosure'
$manifest | ConvertTo-Json | Set-Content (Join-Path $PSScriptRoot 'screens-manifest.json')
$socket.Dispose()

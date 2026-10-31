# Скачивает готовый dist bpmn-js в tests/bpmn-io/vendor/.
#
# В репозиторий НЕ коммитится: vendor/ и out/ в .gitignore. Скрипт — да,
# коммитится: он описывает, что именно и какой версии мы проверяем.
#
# Запуск (из корня репозитория):
#   powershell -ExecutionPolicy Bypass -File tests/bpmn-io/fetch-vendor.ps1

$ErrorActionPreference = 'Stop'

$version = '17.11.1'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$vendor = Join-Path $root 'vendor'

New-Item -ItemType Directory -Force -Path $vendor | Out-Null

$files = @(
  @{ url = "https://unpkg.com/bpmn-js@$version/dist/bpmn-navigated-viewer.production.min.js"; name = 'bpmn-viewer.js' },
  @{ url = "https://unpkg.com/bpmn-js@$version/dist/assets/bpmn-js.css"; name = 'bpmn-js.css' }
)

Write-Host "bpmn-js $version -> $vendor"

foreach ($file in $files) {
  $target = Join-Path $vendor $file.name
  Invoke-WebRequest -UseBasicParsing -Uri $file.url -OutFile $target
  Write-Host ("  {0} ({1} байт)" -f $file.name, (Get-Item $target).Length)
}

Write-Host 'Готово. Дальше: python tests/bpmn-io/render.py'

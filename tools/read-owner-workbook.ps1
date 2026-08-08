param(
  [Parameter(Mandatory = $true)]
  [string]$WorkbookPath
)

$excel = $null
$workbook = $null

try {
  $resolvedPath = (Resolve-Path -LiteralPath $WorkbookPath).Path
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $workbook = $excel.Workbooks.Open($resolvedPath, 0, $true)
  $sheets = [ordered]@{}

  foreach ($worksheet in $workbook.Worksheets) {
    if (-not ($worksheet.Name.StartsWith('01_') -or $worksheet.Name.StartsWith('02_') -or $worksheet.Name.StartsWith('03_') -or $worksheet.Name.StartsWith('04_') -or $worksheet.Name.StartsWith('05_') -or $worksheet.Name.StartsWith('06_') -or $worksheet.Name.StartsWith('08_'))) {
      continue
    }

    $used = $worksheet.UsedRange
    $rowCount = $used.Rows.Count
    $columnCount = $used.Columns.Count
    $headers = @()
    for ($column = 1; $column -le $columnCount; $column++) {
      $header = [string]$used.Cells.Item(1, $column).Text
      if ([string]::IsNullOrWhiteSpace($header)) { $header = "column_$column" }
      $headers += $header
    }

    $rows = @()
    for ($row = 2; $row -le $rowCount; $row++) {
      $record = [ordered]@{}
      $hasValue = $false
      for ($column = 1; $column -le $columnCount; $column++) {
        $value = $used.Cells.Item($row, $column).Value2
        if ($null -ne $value -and -not [string]::IsNullOrWhiteSpace([string]$value)) { $hasValue = $true }
        $record[$headers[$column - 1]] = $value
      }
      if ($hasValue) { $rows += [pscustomobject]$record }
    }

    $sheets[$worksheet.Name] = @{ rows = $rows }
  }

  @{ name = [System.IO.Path]::GetFileName($resolvedPath); sheets = $sheets } | ConvertTo-Json -Depth 12 -Compress
}
finally {
  if ($null -ne $workbook) { $workbook.Close($false) }
  if ($null -ne $excel) { $excel.Quit() }
  if ($null -ne $workbook) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) }
  if ($null -ne $excel) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

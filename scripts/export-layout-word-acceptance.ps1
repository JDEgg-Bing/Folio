param([Parameter(Mandatory=$true)][string]$Folder)
$ErrorActionPreference = 'Stop'
$Folder = (Resolve-Path -LiteralPath $Folder).Path
$word = $null
$document = $null
$records = @()
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  foreach ($preset in @('manuscript', 'academic', 'reading')) {
    $document = $word.Documents.Open((Join-Path $Folder "$preset.docx"), $false, $false)
    $document.Repaginate()
    [void]$document.Sections.Item(1).Footers.Item(1).Range.Fields.Update()
    $body = $document.Paragraphs.Item(2)
    $latin = $document.Paragraphs.Item(3).Range.Duplicate
    [void]$latin.Find.Execute('This')
    $record = [ordered]@{
      preset = $preset; wordVersion = $word.Version; opened = $true
      pages = $document.ComputeStatistics(2)
      titleSize = $document.Paragraphs.Item(1).Range.Font.Size
      titleAlignment = $document.Paragraphs.Item(1).Alignment
      bodySize = $body.Range.Font.Size
      bodyChineseFont = $body.Range.Font.NameFarEast
      bodyLatinFont = $latin.Font.NameAscii
      firstLineIndent = $body.FirstLineIndent
      lineSpacing = $body.LineSpacing
      paragraphAfter = $body.SpaceAfter
      englishIndent = $document.Paragraphs.Item(3).FirstLineIndent
      header = $document.Sections.Item(1).Headers.Item(1).Range.Text.Trim()
      footerFieldType = $document.Sections.Item(1).Footers.Item(1).Range.Fields.Item(1).Type
      tables = $document.Tables.Count
      longTableRows = $document.Tables.Item(2).Rows.Count
      repeatedHeader = $document.Tables.Item(2).Rows.Item(1).HeadingFormat
      preventSplit = !$document.Tables.Item(2).Rows.Item(2).AllowBreakAcrossPages
      tablePadding = $document.Tables.Item(1).TopPadding
      columnWidths = @(1..4 | ForEach-Object { $document.Tables.Item(1).Columns.Item($_).Width })
      nativeEquations = $document.OMaths.Count
      embeddedImages = $document.InlineShapes.Count
      ending = $document.Content.Text.Contains('END OF MANUSCRIPT')
    }
    if (!$record.ending -or $record.tables -ne 2 -or $record.nativeEquations -lt 5 -or $record.longTableRows -ne 57 -or !$record.repeatedHeader -or !$record.preventSplit) { throw "Word structure check failed: $preset" }
    if ($record.titleAlignment -ne 1 -or $record.footerFieldType -ne 33 -or $record.englishIndent -ne 0 -or $record.tablePadding -ne 4) { throw "Word layout check failed: $preset" }
    $expectedSize = if ($preset -eq 'reading') { 11.5 } else { 12 }
    $expectedLine = switch ($preset) { 'academic' { 19.8 } 'reading' { 17.825 } default { 18 } }
    if ($record.bodySize -ne $expectedSize -or [Math]::Abs($record.lineSpacing - $expectedLine) -gt 0.05) { throw "Word typography check failed: $preset" }
    $document.ExportAsFixedFormat((Join-Path $Folder "$preset-word.pdf"), 17)
    if ($preset -eq 'manuscript') {
      $range = $body.Range.Duplicate; $range.Collapse(1); $range.InsertBefore('Word正文编辑验证')
      $cell = $document.Tables.Item(1).Cell(2,2).Range; $cell.InsertBefore('表格编辑验证')
      $edited = Join-Path $Folder 'editable-copy.docx'
      $document.SaveAs2($edited, 16); $document.Close(0)
      $document = $word.Documents.Open($edited, $false, $true)
      $record.editRoundtrip = $document.Content.Text.Contains('Word正文编辑验证') -and $document.Tables.Item(1).Cell(2,2).Range.Text.Contains('表格编辑验证')
      if (!$record.editRoundtrip) { throw 'Word editing roundtrip failed' }
    }
    $records += $record
    $document.Close(0); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document); $document = $null
  }
  $records | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $Folder 'word-results.json') -Encoding utf8
  $records | ConvertTo-Json -Depth 5
} finally {
  if ($document) { $document.Close(0); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document) }
  if ($word) { $word.Quit(0); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word) }
}

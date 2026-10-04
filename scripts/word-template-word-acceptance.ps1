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
  foreach ($kind in @('formal', 'technical', 'direct')) {
    $reference = $word.Documents.Open((Join-Path $Folder "$kind-template.docx"), $false, $true)
    $reference.Repaginate()
    $reference.ExportAsFixedFormat((Join-Path $Folder "$kind-template.pdf"), 17)
    $referenceHeader = $reference.Sections.Item(1).Headers.Item(1).Range.Text.Trim()
    $reference.Close(0)
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($reference)
    $document = $word.Documents.Open((Join-Path $Folder "$kind.docx"), $false, $false)
    $document.Repaginate()
    [void]$document.Fields.Update()
    [void]$document.Sections.Item(1).Footers.Item(1).Range.Fields.Update()
    $body = $document.Paragraphs.Item(2)
    $latin = $body.Range.Duplicate
    [void]$latin.Find.Execute('Compression')
    $firstHeading = $null
    for ($i=1; $i -le $document.Paragraphs.Count; $i++) {
      $candidate = $document.Paragraphs.Item($i)
      if ($candidate.OutlineLevel -eq 1) { $firstHeading = $candidate; break }
    }
    $record = [ordered]@{
      kind = $kind; opened = $true; wordVersion = $word.Version
      pages = $document.ComputeStatistics(2)
      bodySize = $body.Range.Font.Size
      bodyChineseFont = $body.Range.Font.NameFarEast
      bodyLatinFont = $latin.Font.NameAscii
      firstLineIndent = $body.FirstLineIndent
      lineRule = $body.LineSpacingRule
      lineSpacing = $body.LineSpacing
      paragraphAfter = $body.SpaceAfter
      titleSize = $document.Paragraphs.Item(1).Range.Font.Size
      titleAlignment = $document.Paragraphs.Item(1).Alignment
      leftMargin = $document.PageSetup.LeftMargin
      headingLevel = $firstHeading.OutlineLevel
      headingSize = $firstHeading.Range.Font.Size
      headingPageBreakBefore = $firstHeading.PageBreakBefore
      header = $document.Sections.Item(1).Headers.Item(1).Range.Text.Trim()
      footerFieldType = $document.Sections.Item(1).Footers.Item(1).Range.Fields.Item(1).Type
      tables = $document.Tables.Count
      equations = $document.OMaths.Count
      images = $document.InlineShapes.Count
      hyperlinks = $document.Hyperlinks.Count
      ending = $document.Content.Text.Contains('END OF TEMPLATE EXPORT')
    }
    $expectedSize = if ($kind -eq 'technical') {12} else {11}
    if ($record.bodySize -ne $expectedSize -or $record.titleSize -ne 20 -or $record.titleAlignment -ne 1) { throw "Word type size mismatch: $kind" }
    if ([Math]::Abs($record.firstLineIndent - 24) -gt 0.05 -or $record.lineRule -ne 1 -or $record.paragraphAfter -ne 6) { throw "Word paragraph mismatch: $kind" }
    if ($record.header -ne $referenceHeader -or $record.footerFieldType -ne 33 -or $record.headingLevel -ne 1 -or $record.headingSize -ne 16) { throw "Word header or heading mismatch: $kind" }
    if (!$record.ending -or $record.tables -ne 2 -or $record.equations -lt 5 -or $record.images -lt 1 -or $record.hyperlinks -lt 3) { throw "Word editable content missing: $kind" }
    if ($kind -eq 'technical' -and !$record.headingPageBreakBefore) { throw 'Template heading pagination missing' }
    $document.ExportAsFixedFormat((Join-Path $Folder "$kind-word.pdf"), 17)
    $range = $body.Range.Duplicate
    $range.Collapse(1)
    $range.InsertBefore('Word正文编辑验收')
    $document.Tables.Item(1).Cell(2,2).Range.InsertBefore('Word表格编辑验收')
    $edited = Join-Path $Folder "$kind-editable.docx"
    $document.SaveAs2($edited, 16)
    $document.Close(0)
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document)
    $document = $word.Documents.Open($edited, $false, $true)
    $record.editRoundtrip = $document.Content.Text.Contains('Word正文编辑验收') -and $document.Tables.Item(1).Cell(2,2).Range.Text.Contains('Word表格编辑验收')
    if (!$record.editRoundtrip) { throw "Word edit roundtrip failed: $kind" }
    $records += $record
    $document.Close(0)
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document)
    $document = $null
  }
  $records | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $Folder 'word-results.json') -Encoding utf8
  $records | ConvertTo-Json -Depth 5
} finally {
  if ($document) { $document.Close(0); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document) }
  if ($word) { $word.Quit(0); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word) }
}

param([Parameter(Mandatory=$true)][string]$Folder)
$ErrorActionPreference = 'Stop'
$Folder = (Resolve-Path -LiteralPath $Folder).Path
$word = $null
$document = $null
try {
  # This is a separate automation instance; no user document is changed.
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $document = $word.Documents.Open((Join-Path $Folder '正式文稿.docx'), $false, $false)
  $document.Repaginate()
  $header = $document.Sections.Item(1).Headers.Item(1)
  $footer = $document.Sections.Item(1).Footers.Item(1)
  [void]$footer.Range.Fields.Update()
  $body = $document.Paragraphs.Item(2)
  $latin = $body.Range.Duplicate
  [void]$latin.Find.Execute('Compression')
  $listNumbers = @()
  foreach ($paragraph in $document.Paragraphs) {
    if ($paragraph.Range.Text -match '首先记录|再检查实验|最后比较') { $listNumbers += $paragraph.Range.ListFormat.ListString }
  }
  $observed = [ordered]@{
    wordVersion = $word.Version
    opened = $true
    pages = $document.ComputeStatistics(2)
    chineseText = $document.Content.Text.Contains('长文档科研报告')
    titleAlignment = $document.Paragraphs.Item(1).Alignment
    titleSize = $document.Paragraphs.Item(1).Range.Font.Size
    titleStyle = $document.Paragraphs.Item(1).Style.NameLocal
    headerText = $header.Range.Text.Trim()
    footerText = $footer.Range.Text.Trim()
    footerFieldType = $footer.Range.Fields.Item(1).Type
    headerDistancePoints = $document.PageSetup.HeaderDistance
    footerDistancePoints = $document.PageSetup.FooterDistance
    tableWidthPoints = $document.Tables.Item(1).Columns.Item(1).Width + $document.Tables.Item(1).Columns.Item(2).Width + $document.Tables.Item(1).Columns.Item(3).Width
    tableColumnWidths = @(1..3 | ForEach-Object { $document.Tables.Item(1).Columns.Item($_).Width })
    tablePaddingPoints = $document.Tables.Item(1).TopPadding
    tableLineSpacing = $document.Tables.Item(1).Cell(2,1).Range.ParagraphFormat.LineSpacing
    headingOutlineLevel = $document.Paragraphs.Item(1).OutlineLevel
    chineseFont = $body.Range.Font.NameFarEast
    latinFont = $latin.Font.NameAscii
    orderedListNumbers = $listNumbers
    firstLineIndentPoints = $body.FirstLineIndent
    paragraphAlignment = $body.Alignment
    lineSpacingRule = $body.LineSpacingRule
    lineSpacingPoints = $body.LineSpacing
    paragraphSpaceAfterPoints = $body.SpaceAfter
    tables = $document.Tables.Count
    tableRows = $document.Tables.Item(1).Rows.Count
    tableColumns = $document.Tables.Item(1).Columns.Count
    inlineShapes = $document.InlineShapes.Count
    nativeEquations = $document.OMaths.Count
    tableEquationJustification = $document.Tables.Item(1).Cell(3,2).Range.OMaths.Item(1).Justification
    referenceText = $document.Content.Text.Contains('图 1') -and $document.Content.Text.Contains('表 1') -and $document.Content.Text.Contains('(1)')
    captionText = $document.Content.Text.Contains('图 1　实验装置示意')
    quoteText = $document.Content.Text.Contains('引用说明采用轻微缩进和细线')
  }
  if (!$observed.chineseText -or $observed.tables -ne 1 -or $observed.nativeEquations -lt 5 -or $observed.inlineShapes -lt 1) { throw 'Word 原生对象检查未通过' }
  if ($observed.paragraphAlignment -ne 3 -or $observed.firstLineIndentPoints -ne 24) { throw 'Word 正文排版检查未通过' }
  if ($observed.titleAlignment -ne 1 -or $observed.titleSize -ne 18 -or $observed.footerFieldType -ne 33 -or $observed.headerText -ne '长文档科研报告') { throw 'Word 主标题和页眉页脚检查未通过' }
  if ([Math]::Abs($observed.tableWidthPoints - 481.9) -gt 1) { throw 'Word 表格版心宽度检查未通过' }
  if (($listNumbers -join ',') -ne '1.,2.,3.') { throw 'Word 有序列表检查未通过' }
  if ($observed.tableEquationJustification -ne 4) { throw 'Word 表格内公式右对齐检查未通过' }
  $document.ExportAsFixedFormat((Join-Path $Folder 'Word-rendered.pdf'), 17)
  $range = $document.Paragraphs.Item(2).Range.Duplicate
  $range.Collapse(1)
  $range.InsertBefore('Word可编辑验收')
  $cell = $document.Tables.Item(1).Cell(2, 1).Range
  $cell.InsertBefore('表格可编辑验收')
  $observed.bodyEditable = $document.Content.Text.Contains('Word可编辑验收')
  $observed.tableEditable = $document.Tables.Item(1).Cell(2, 1).Range.Text.Contains('表格可编辑验收')
  $edited = Join-Path $Folder 'Word编辑验证副本.docx'
  $document.SaveAs2($edited, 16)
  $document.Close(0)
  $document = $word.Documents.Open($edited, $false, $true)
  $observed.editRoundtrip = $document.Content.Text.Contains('Word可编辑验收') -and $document.Content.Text.Contains('表格可编辑验收')
  $document.Close(0)
  $document = $word.Documents.Open((Join-Path $Folder '公式降级.docx'), $false, $true)
  $observed.fallbackOpened = $true
  $observed.fallbackImages = $document.InlineShapes.Count
  $document.ExportAsFixedFormat((Join-Path $Folder 'Word-fallback.pdf'), 17)
  $document.Close(0)
  $document = $word.Documents.Open((Join-Path $Folder '多页排版验收.docx'), $false, $false)
  $document.Repaginate()
  [void]$document.Sections.Item(1).Footers.Item(1).Range.Fields.Update()
  $observed.stressPages = $document.ComputeStatistics(2)
  $observed.stressColumnWidths = @(1..4 | ForEach-Object { $document.Tables.Item(2).Columns.Item($_).Width })
  $observed.stressNumericAlignment = $document.Tables.Item(2).Cell(2,3).Range.ParagraphFormat.Alignment
  $observed.stressFormulaAlignment = $document.Tables.Item(2).Cell(2,4).Range.ParagraphFormat.Alignment
  $observed.stressEquationJustification = $document.Tables.Item(2).Cell(2,4).Range.OMaths.Item(1).Justification
  if ($observed.stressPages -lt 3 -or $observed.stressNumericAlignment -ne 2 -or $observed.stressFormulaAlignment -ne 1 -or $observed.stressEquationJustification -ne 2) { throw '多页表格排版检查未通过' }
  $document.ExportAsFixedFormat((Join-Path $Folder 'Word-multipage.pdf'), 17)
  $observed | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Folder 'word-results.json') -Encoding utf8
  $observed | ConvertTo-Json
} finally {
  if ($document) { $document.Close(0); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document) }
  if ($word) { $word.Quit(0); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word) }
}

param([string]$Folder = 'out/word-template-stress', [string]$Only = '')
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'Run with pwsh (PowerShell 7). Windows PowerShell 5 native Word PDF calls stalled on this test machine.' }
$Folder = (Resolve-Path -LiteralPath $Folder).Path
$word = $null
$document = $null
$records = @()
if ($Only -and (Test-Path -LiteralPath (Join-Path $Folder 'word-results.json'))) {
    $records = @(Get-Content -LiteralPath (Join-Path $Folder 'word-results.json') -Raw | ConvertFrom-Json | Where-Object { !$_.file.StartsWith($Only) })
}
try {
    Write-Output 'Starting Word verification in PowerShell 7'
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $names = @('02-rich-rules', '05-visual-only', '11-unused-heading', '21-instructions-dominate', '22-sections-columns', '23-multiple-tables', '12-conflicting-heading', '35-dynamic-header')
    if ($Only) { $names = @($names | Where-Object { $_.StartsWith($Only) }) }
    foreach ($name in $names) {
        $files = @("$name.docx", "$name-auto.docx")
        if (Test-Path -LiteralPath (Join-Path $Folder "$name-corrected.docx")) { $files += "$name-corrected.docx" }
        foreach ($file in $files) {
            $isExport = $file -like '*-auto.docx' -or $file -like '*-corrected.docx'
            $document = $word.Documents.Open((Join-Path $Folder $file), $false, $true)
            $document.Repaginate()
            if ($name -eq '35-dynamic-header') { [void]$document.Sections.Item(1).Headers.Item(1).Range.Fields.Update() }
            # Render before querying many COM ranges. These controlled fixtures
            # have known paragraph positions; avoid a full paragraph COM scan.
            $pdf = Join-Path $Folder ($file.Replace('.docx', '-word.pdf'))
            $document.ExportAsFixedFormat($pdf, 17)
            $headingIndex = if ($isExport -or $name -eq '22-sections-columns') { 3 } else { 2 }
            $heading = $document.Paragraphs.Item($headingIndex)
            $body = if ($isExport) { $document.Paragraphs.Item(2) } else { $null }
            $record = [ordered]@{
                file = $file; opened = $true; wordVersion = $word.Version
                pages = $document.ComputeStatistics(2)
                sections = $document.Sections.Count
                columns = $document.Sections.Item(1).PageSetup.TextColumns.Count
                headingSize = if ($heading) { $heading.Range.Font.Size } else { $null }
                headingOutline = if ($heading) { $heading.OutlineLevel } else { $null }
                bodySize = if ($body) { $body.Range.Font.Size } else { $null }
                bodyChineseFont = if ($body) { $body.Range.Font.NameFarEast } else { $null }
                tables = $document.Tables.Count
                equations = $document.OMaths.Count
                images = $document.InlineShapes.Count
                hyperlinks = $document.Hyperlinks.Count
                header = $document.Sections.Item($document.Sections.Count).Headers.Item(1).Range.Text.Trim()
                footerFields = $document.Sections.Item($document.Sections.Count).Footers.Item(1).Range.Fields.Count
                pdf = 'Exported'
            }
            if ($isExport) {
                if ($name -in @('05-visual-only','11-unused-heading','35-dynamic-header') -and $record.headingSize -ne 16) { throw "Heading format mismatch in $file" }
                if ($name -eq '21-instructions-dominate' -and ($record.bodySize -ne 11 -or $record.bodyChineseFont -ne '宋体')) { throw "Body format mismatch in $file" }
                if ($name -eq '35-dynamic-header' -and !$record.header.Contains('研究背景')) { throw "STYLEREF field failed in $file : $($record.header)" }
                if (!$body -or $record.tables -ne 1 -or $record.equations -lt 2 -or $record.images -ne 1 -or $record.hyperlinks -lt 4) { throw "Editable content missing in $file" }
                $document.Close(0)
                [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document)
                $document = $word.Documents.Open((Join-Path $Folder $file), $false, $false)
                $body = $document.Paragraphs.Item(2)
                $body.Range.InsertBefore('WORD BODY EDIT ')
                # Edit the text cell. Cell(2,2) contains native math, where Word
                # renders ASCII letters as mathematical italic Unicode in Text.
                $document.Tables.Item(1).Cell(2,1).Range.InsertBefore('WORD CELL EDIT ')
                $edited = Join-Path $Folder ($file.Replace('.docx', '-edited.docx'))
                $document.SaveAs2($edited,16)
                $document.Close(0)
                [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document)
                $document = $word.Documents.Open($edited,$false,$true)
                $record.editRoundtrip = $document.Content.Text.Contains('WORD BODY EDIT') -and $document.Tables.Item(1).Cell(2,1).Range.Text.Contains('WORD CELL EDIT')
                if (!$record.editRoundtrip) { throw "Edit roundtrip failed in $file" }
            }
            $document.Close(0)
            [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document)
            $document = $null
            $records += $record
            $records | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $Folder 'word-results.json') -Encoding utf8
            Write-Output "$file : opened; heading=$($record.headingSize); body=$($record.bodySize); pages=$($record.pages)"
        }
    }
    $records | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $Folder 'word-results.json') -Encoding utf8
} finally {
    if ($document) { $document.Close(0); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document) }
    if ($word) { $word.Quit(0); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word) }
}

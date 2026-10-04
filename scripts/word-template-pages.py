"""Render native Word acceptance PDFs and collect page geometry/font evidence."""
import json
import sys
from pathlib import Path
import pypdfium2 as pdfium
import pdfplumber

folder = Path(sys.argv[1])
records = []
for kind in ('formal', 'technical', 'direct'):
    for suffix in ('-template', '-word'):
        name = kind + suffix
        path = folder / (name + '.pdf')
        output = folder / (name + '-pages')
        output.mkdir(exist_ok=True)
        pdf = pdfium.PdfDocument(path)
        for index in range(len(pdf)):
            pdf[index].render(scale=1.5).to_pil().save(output / f'page-{index + 1}.png')
        with pdfplumber.open(path) as document:
            texts = [page.extract_text() or '' for page in document.pages]
            if suffix == '-word':
                assert 'END OF TEMPLATE EXPORT' in texts[-1]
                assert all(('正式报告' if kind != 'technical' else '工程研究中心') in text for text in texts)
            for page in document.pages:
                assert abs(page.width - 595.28) < 1 and abs(page.height - 841.89) < 1
                assert all(c['x0'] >= 0 and c['x1'] <= page.width + 1 and c['top'] >= 0 and c['bottom'] <= page.height + 1 for c in page.chars)
            records.append({'name': name, 'pages': len(pdf), 'fonts': sorted({c['fontname'] for page in document.pages for c in page.chars})})
(folder / 'page-results.json').write_text(json.dumps({'result': 'PASS', 'records': records}, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'result': 'PASS', 'records': records}, ensure_ascii=False, indent=2))

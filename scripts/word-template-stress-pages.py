"""Render native Word PDFs, keeping every page and a first-page comparison."""
import json
import sys
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image, ImageDraw, ImageFont

folder = Path(sys.argv[1] if len(sys.argv) > 1 else 'out/word-template-stress')
records = []
for path in sorted(folder.glob('*-word.pdf')):
    pdf = pdfium.PdfDocument(path)
    pages = folder / (path.stem + '-pages')
    pages.mkdir(exist_ok=True)
    for index in range(len(pdf)):
        pdf[index].render(scale=1.4).to_pil().save(pages / f'page-{index + 1}.png')
    records.append({'name': path.stem, 'pages': len(pdf)})
    pdf.close()

font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 18)
for name in ('05-visual-only', '11-unused-heading', '21-instructions-dominate'):
    sheet = Image.new('RGB', (1500, 740), '#dedede')
    draw = ImageDraw.Draw(sheet)
    for column, (suffix, label) in enumerate((('', 'TEMPLATE'), ('-auto', 'AUTOMATIC MAPPING'), ('-corrected', 'CORRECTED MAPPING'))):
        page = Image.open(folder / f'{name}{suffix}-word-pages' / 'page-1.png').convert('RGB')
        page.thumbnail((480, 690))
        x = column * 500 + 10
        draw.text((x, 10), label, font=font, fill='black')
        sheet.paste(page, (x, 40))
    sheet.save(folder / f'{name}-comparison.png')
(folder / 'page-results.json').write_text(json.dumps(records, indent=2), encoding='utf-8')
print(json.dumps(records, indent=2))

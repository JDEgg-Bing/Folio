"""Rasterize both engines' pages and check bounds/content before visual review."""
import argparse
import json
import re
from pathlib import Path
from PIL import Image, ImageDraw
from pdf2image import convert_from_path
import pdfplumber

parser = argparse.ArgumentParser()
parser.add_argument('folder', type=Path)
args = parser.parse_args()
records = []
for preset in ['manuscript', 'academic', 'reading']:
    for engine in ['', '-word']:
        name = preset + engine
        path = args.folder / (name + '.pdf')
        with pdfplumber.open(path) as pdf:
            texts = [page.extract_text() or '' for page in pdf.pages]
            assert all('正式文稿排版验证' in text for text in texts), (name, 'running title missing')
            assert all(re.search(r'\n' + str(i + 1) + r'\s*$', text) for i, text in enumerate(texts)), (name, 'page number missing')
            assert 'END OF MANUSCRIPT' in texts[-1], (name, 'ending missing')
            table_pages = [i + 1 for i, text in enumerate(texts) if re.search(r'连续测量记录\s*\d+', text)]
            assert len(table_pages) >= 2, (name, 'long table not split')
            assert all('记录编号' in texts[i-1] and '测量说明' in texts[i-1] for i in table_pages), (name, 'repeated table header missing')
            for page in pdf.pages:
                assert abs(page.width - 595.28) < 1 and abs(page.height - 841.89) < 1, (name, 'not A4')
                # Margin matter is included, so only printable page boundaries
                # are checked here. Padded blocks are checked in page images.
                assert all(c['x0'] >= 0 and c['x1'] <= page.width + 1 and c['top'] >= 0 and c['bottom'] <= page.height + 1 for c in page.chars), (name, 'glyph outside page')
            records.append({'file': path.name, 'pages': len(pdf.pages), 'repeatedTablePages': table_pages,
                            'fonts': sorted({c['fontname'] for page in pdf.pages for c in page.chars})})
        pages = convert_from_path(str(path), dpi=100)
        dest = args.folder / (name + '-pages')
        dest.mkdir(exist_ok=True)
        for i, page in enumerate(pages):
            page.save(dest / f'page-{i+1}.png')
        for start in range(0, len(pages), 4):
            sheet = Image.new('RGB', (pages[0].width*2, (pages[0].height+30)*2), '#dddddd')
            draw = ImageDraw.Draw(sheet)
            for j, page in enumerate(pages[start:start+4]):
                x = (j % 2) * pages[0].width
                y = (j // 2) * (pages[0].height + 30)
                sheet.paste(page, (x, y+30))
                draw.text((x+10, y+8), f'{name} / page {start+j+1}', fill='black')
            sheet.save(dest / f'sheet-{start//4+1}.png')
(args.folder / 'page-results.json').write_text(json.dumps({'result': 'PASS', 'records': records}, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'result': 'PASS', 'records': records}, ensure_ascii=False, indent=2))

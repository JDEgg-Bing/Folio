import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useModal } from './useModal';
import { normalizeCropRect, type CropRect } from '../editor/imageCrop';

export function ImageCropDialog({ load, onApply, onClose }: {
  load(): Promise<string>; onApply(dataUrl: string): Promise<boolean>; onClose(): void;
}) {
  const dialog = useModal(), image = useRef<HTMLImageElement>(null);
  const [source, setSource] = useState<string | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [rect, setRect] = useState<CropRect>({ x: 0, y: 0, width: 1, height: 1 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; previous: CropRect } | null>(null);
  useEffect(() => {
    let alive = true;
    void load().then(value => { if (alive) setSource(value); }).catch(cause => { if (alive) setError(cause instanceof Error ? cause.message : '图片无法读取。'); });
    return () => { alive = false; };
  }, [load]);
  const close = () => { if (!busy) onClose(); };
  const point = (event: PointerEvent) => {
    const bounds = image.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(size!.width, Math.round((event.clientX - bounds.left) / bounds.width * size!.width))),
      y: Math.max(0, Math.min(size!.height, Math.round((event.clientY - bounds.top) / bounds.height * size!.height))) };
  };
  const move = (event: PointerEvent) => {
    if (!drag.current || !size) return;
    const end = point(event), start = drag.current;
    setRect(normalizeCropRect({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) }, size));
  };
  const apply = async () => {
    if (!size || !image.current || busy) return;
    setBusy(true); setError(null);
    try {
      const canvas = document.createElement('canvas'); canvas.width = rect.width; canvas.height = rect.height;
      const context = canvas.getContext('2d'); if (!context) throw new Error('无法处理图片，请重试。');
      context.drawImage(image.current, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
      if (await onApply(canvas.toDataURL('image/png'))) onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '裁剪失败，请重试。'); }
    finally { setBusy(false); }
  };
  return <dialog ref={dialog} className="appearance-dialog image-crop-dialog" aria-labelledby="image-crop-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header className="appearance-header"><h1 id="image-crop-title">裁剪图片</h1><p>在图片上拖出保留区域，也可以调整像素范围。结果另存为 PNG，原图保留；动图会保存为静态图片。</p></header>
    <div className="appearance-body image-crop-body" aria-busy={busy}>
      {!source && !error && <p role="status">正在读取图片…</p>}
      {source && <div className="image-crop-preview"><div className="image-crop-stage" onPointerDown={event => {
        if (busy || !size || event.button !== 0 || !event.isPrimary) return;
        event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { ...point(event), previous: rect };
      }} onPointerMove={move} onPointerUp={event => { move(event); drag.current = null; }} onPointerCancel={() => { if (drag.current) setRect(drag.current.previous); drag.current = null; }}>
        <img ref={image} src={source} alt="待裁剪图片" draggable={false} onLoad={() => {
          const { naturalWidth: width, naturalHeight: height } = image.current!;
          if (!width || !height || width * height > 32_000_000) { setError('图片尺寸过大，暂不支持裁剪。'); return; }
          setSize({ width, height }); setRect({ x: 0, y: 0, width, height });
        }} onError={() => setError('图片无法解码，请检查文件是否有效。')} />
        {size && <span className="image-crop-rectangle" style={{ left: `${rect.x / size.width * 100}%`, top: `${rect.y / size.height * 100}%`, width: `${rect.width / size.width * 100}%`, height: `${rect.height / size.height * 100}%` }} />}
      </div></div>}
      {size && <div className="image-crop-fields">
        {(['x', 'y', 'width', 'height'] as const).map((key, index) => <label className="appearance-field" key={key}>{['左侧', '顶部', '宽度', '高度'][index]}<input aria-label={['左侧像素', '顶部像素', '裁剪宽度', '裁剪高度'][index]} type="number" min={key === 'x' || key === 'y' ? 0 : 1} max={key === 'x' ? size.width - 1 : key === 'y' ? size.height - 1 : key === 'width' ? size.width - rect.x : size.height - rect.y} step={1} value={rect[key]} disabled={busy} onChange={event => setRect(normalizeCropRect({ ...rect, [key]: event.currentTarget.valueAsNumber }, size))} /></label>)}
      </div>}
      {error && <p className="appearance-error" role="alert">{error}</p>}
    </div>
    <footer className="dialog-actions"><button className="folio-button" disabled={busy || !size} onClick={() => { setRect({ x: 0, y: 0, ...size! }); }}>重置</button><button className="folio-button" data-initial-focus disabled={busy} onClick={close}>取消</button><button className="folio-button primary" disabled={busy || !size} onClick={() => void apply()}>{busy ? '正在保存…' : '应用裁剪'}</button></footer>
  </dialog>;
}

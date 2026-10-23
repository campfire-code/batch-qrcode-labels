// 在应用里用画布把标签文字渲染成 PNG（300 dpi），用系统自带的中文字体，PDF 里不需要嵌入字体。
import { lineHeightMm, wrapLines } from './core';
import type { TextRenderer } from './pdf';

const DPI = 300;
const FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif';

export const canvasText: TextRenderer = async (lines, box, o) => {
  const px = (mm: number) => Math.max(1, Math.round((mm / 25.4) * DPI));
  const W = px(box.wMm), H = px(box.hMm);
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const g = c.getContext('2d')!;
  const fontPx = (o.fontPt / 72) * DPI;
  const lh = px(lineHeightMm(o.fontPt));
  g.font = `${fontPx}px ${FONT}`;
  const maxLines = Math.max(1, Math.floor(H / lh));
  const shown = wrapLines(lines, W, maxLines, (s) => g.measureText(s).width);
  if (!shown.length) return null;
  g.fillStyle = '#000000';
  g.textBaseline = 'middle';
  g.textAlign = o.align;
  const x = o.align === 'center' ? W / 2 : 0;
  // 文字块在区域里垂直居中
  const y0 = (H - shown.length * lh) / 2 + lh / 2;
  shown.forEach((t, i) => g.fillText(t, x, y0 + i * lh));
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'));
  if (!blob) throw new Error('文字渲染失败');
  return new Uint8Array(await blob.arrayBuffer());
};

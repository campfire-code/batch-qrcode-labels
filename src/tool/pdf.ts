// 生成可打印 PDF：二维码用 pdf-lib 画成矢量（放大不糊），文字由外部渲染成 PNG 再贴上（这样中文不需要嵌入字体）。
import { PDFDocument, rgb } from 'pdf-lib';
import * as QRCode from 'qrcode';
import { MM, innerLayout, pageCount, qrPath, slot, type Label, type Sheet } from './core';

export type Ecc = 'L' | 'M' | 'Q' | 'H';

export interface PdfOptions {
  layout: 'left' | 'top';
  padding: number;
  fontPt: number;
  ecc: Ecc;
  /** 画出标签边框，方便裁切或对位 */
  border: boolean;
  /** 二维码四周留白格数 */
  quiet: number;
}

/** 把几行文字渲染成 PNG，图片铺满 wMm × hMm 的区域；返回 null 表示不画 */
export type TextRenderer = (lines: string[], box: { wMm: number; hMm: number }, o: { fontPt: number; align: 'left' | 'center' }) => Promise<Uint8Array | null>;

/** 二维码矩阵：内容太长时给出看得懂的错误 */
export function qrMatrix(text: string, ecc: Ecc) {
  try {
    const m = QRCode.create(text, { errorCorrectionLevel: ecc }).modules;
    return { size: m.size, dark: (r: number, c: number) => Boolean(m.get(r, c)) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/too big|amount of data/i.test(msg)) throw new Error(`内容太长，二维码装不下（${[...text].length} 个字符）。可以把纠错等级调低，或缩短内容`);
    throw new Error(`二维码生成失败：${msg}`);
  }
}

export async function buildPdf(labels: Label[], sheet: Sheet, opt: PdfOptions, render: TextRenderer, progress: (r: number) => void = () => {}, signal?: AbortSignal) {
  if (!labels.length) throw new Error('没有要生成的标签');
  const doc = await PDFDocument.create();
  doc.setTitle('二维码标签');
  doc.setCreator('篝火 · 批量二维码标签');
  doc.setProducer('pdf-lib');
  const pages = Array.from({ length: pageCount(sheet, labels.length) }, () => doc.addPage([sheet.pageW * MM, sheet.pageH * MM]));
  const pt = (mm: number) => mm * MM;
  // 同样的文字只渲染、嵌入一次
  const images = new Map<string, Awaited<ReturnType<typeof doc.embedPng>> | null>();

  for (let i = 0; i < labels.length; i++) {
    if (signal?.aborted) throw new Error('已暂停');
    const L = labels[i];
    const s = slot(sheet, i);
    const page = pages[s.page];
    const lay = innerLayout(sheet.labelW, sheet.labelH, { layout: opt.layout, padding: opt.padding, lines: L.lines.length, fontPt: opt.fontPt });
    // PDF 坐标原点在左下角，这里统一换算
    const X = (mm: number) => pt(s.x + mm);
    const Ytop = (mm: number) => pt(sheet.pageH - s.y - mm);

    if (opt.border) {
      page.drawRectangle({ x: X(0), y: Ytop(sheet.labelH), width: pt(sheet.labelW), height: pt(sheet.labelH), borderColor: rgb(0.75, 0.75, 0.75), borderWidth: 0.4 });
    }
    let m: ReturnType<typeof qrMatrix>;
    try {
      m = qrMatrix(L.content, opt.ecc);
    } catch (e) {
      throw new Error(`第 ${i + 1} 个标签（${L.content.slice(0, 20)}）：${e instanceof Error ? e.message : e}`);
    }
    const q = qrPath(m.size, m.dark, opt.quiet);
    page.drawSvgPath(q.path, { x: X(lay.qr.x), y: Ytop(lay.qr.y), scale: pt(lay.qr.w) / q.total, color: rgb(0, 0, 0), borderWidth: 0 });

    if (lay.text) {
      const key = `${L.lines.join('\n')}|${lay.text.w}|${lay.text.h}`;
      if (!images.has(key)) {
        const png = await render(L.lines, { wMm: lay.text.w, hMm: lay.text.h }, { fontPt: opt.fontPt, align: opt.layout === 'top' ? 'center' : 'left' });
        images.set(key, png ? await doc.embedPng(png) : null);
      }
      const img = images.get(key);
      if (img) page.drawImage(img, { x: X(lay.text.x), y: Ytop(lay.text.y + lay.text.h), width: pt(lay.text.w), height: pt(lay.text.h) });
    }
    if (i % 20 === 19) {
      progress((i + 1) / labels.length * 0.9);
      await new Promise((r) => setTimeout(r, 0)); // 让界面有机会刷新进度
    }
  }
  const bytes = await doc.save();
  progress(1);
  return { bytes, pages: pages.length };
}

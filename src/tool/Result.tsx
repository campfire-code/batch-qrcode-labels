// 单次生成的结果：左边是第一页纸的缩略排版（真实二维码按行列摆好），右边是三个大数字和前几个标签的内容
import { useMemo } from 'react';
import { FileText, Ruler, Rows3 } from 'lucide-react';
import type { InputItem, ItemResult } from '../kit/types';
import { fmt, innerLayout, qrPath, slot, type Label, type Sheet } from './core';
import { qrMatrix, type Ecc } from './pdf';
import './tool.css';

export interface Stat {
  sheet: Sheet;
  count: number;
  pages: number;
  paper: string;
  layout: 'left' | 'top';
  padding: number;
  fontPt: number;
  ecc: Ecc;
  /** 第一页上的标签（最多 48 个），用来画缩略图 */
  firstPage: Label[];
  /** 列表里展示的前几个标签 */
  samples: Label[];
}

export function statOf(labels: Label[], sheet: Sheet, o: { paper: string; layout: 'left' | 'top'; padding: number; fontPt: number; ecc: Ecc; pages: number; count: number }): Stat {
  const per = sheet.cols * sheet.rows;
  return { sheet, count: o.count, pages: o.pages, paper: o.paper, layout: o.layout, padding: o.padding, fontPt: o.fontPt, ecc: o.ecc, firstPage: labels.slice(0, Math.min(per, 48)), samples: labels.slice(0, 5) };
}

function Cell({ st, label, i }: { st: Stat; label: Label; i: number }) {
  const s = slot(st.sheet, i);
  const { sheet } = st;
  const m = qrMatrix(label.content, st.ecc);
  const q = qrPath(m.size, m.dark, 2);
  let lay;
  try { lay = innerLayout(sheet.labelW, sheet.labelH, { layout: st.layout, padding: st.padding, lines: label.lines.length, fontPt: st.fontPt }); } catch { return null; }
  const lh = (st.fontPt * 1.3) / (72 / 25.4);
  return (
    <g transform={`translate(${s.x} ${s.y})`}>
      <rect width={sheet.labelW} height={sheet.labelH} rx="1.2" className="qr-cell" />
      <g transform={`translate(${lay.qr.x} ${lay.qr.y}) scale(${lay.qr.w / q.total})`}><path d={q.path} className="qr-ink" /></g>
      {lay.text && label.lines.slice(0, Math.max(1, Math.floor(lay.text.h / lh))).map((l, k) => (
        <rect key={k} x={lay.text!.x} y={lay.text!.y + (lay.text!.h - Math.min(label.lines.length, Math.floor(lay.text!.h / lh)) * lh) / 2 + k * lh + lh * 0.2} width={Math.min(lay.text!.w, [...l].length * lh * 0.5)} height={lh * 0.45} rx={lh * 0.2} className="qr-line" />
      ))}
    </g>
  );
}

export function ResultBody({ result }: { item: InputItem; result: ItemResult }) {
  const st = result.data as Stat | undefined;
  const cells = useMemo(() => (st ? st.firstPage.map((l, i) => <Cell key={i} st={st} label={l} i={i} />) : null), [st]);
  if (!st) return <p className="qr-plain">{result.summary}</p>;
  const { sheet } = st;
  return (
    <div className="qr-res">
      <figure className="qr-sheet">
        <svg viewBox={`0 0 ${sheet.pageW} ${sheet.pageH}`} role="img" aria-label={`第 1 页：${sheet.cols} 列 × ${sheet.rows} 行，共 ${st.firstPage.length} 个标签`}>
          <rect width={sheet.pageW} height={sheet.pageH} className="qr-page" />
          {cells}
        </svg>
        <figcaption>第 1 页缩略图</figcaption>
      </figure>
      <div className="qr-info">
        <div className="qr-big">
          <div><b className="k-num">{st.count}</b><span>个标签</span></div>
          <div><b className="k-num">{st.pages}</b><span>页 PDF</span></div>
          <div><b className="k-num">{fmt(sheet.labelW)}<small> × {fmt(sheet.labelH)}</small></b><span>单个标签（mm）</span></div>
        </div>
        <p className="qr-meta"><Rows3 size={14} />{st.paper}<Ruler size={14} />纠错等级 {st.ecc}</p>
        <ol className="qr-list">
          {st.samples.map((l, i) => (
            <li key={i}><span className="k-num">{i + 1}</span><b>{l.content}</b>{l.lines.length > 0 && <em>{l.lines.join(' / ')}</em>}</li>
          ))}
          {st.count > st.samples.length && <li className="qr-more"><FileText size={13} />其余 {st.count - st.samples.length} 个见 PDF</li>}
        </ol>
      </div>
    </div>
  );
}

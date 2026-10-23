// 纯函数：编号生成、表格取列、文字模板、纸张与标签排版计算。不依赖界面和本机能力，便于单元测试。

export type Cell = string | number | boolean | Date | null;

/** A4 纸 210 × 297 mm（ISO 216 规定的 A 系列幅面） */
export const A4 = { w: 210, h: 297 };
/** 1 mm 等于多少 PDF 点（1 英寸 = 25.4 mm = 72 点） */
export const MM = 72 / 25.4;
/** 一次最多生成的标签数，防止误填过大的范围卡住 */
export const MAX_LABELS = 10000;

// ---------- 编号规则 ----------

export interface SerialRule {
  prefix: string;
  suffix: string;
  start: number;
  count: number;
  step: number;
  /** 数字部分补零到几位，0 表示不补 */
  pad: number;
}

export function serials(r: SerialRule): string[] {
  if (!Number.isInteger(r.start) || r.start < 0) throw new Error('起始号要填 0 或正整数');
  if (!Number.isInteger(r.step) || r.step < 1) throw new Error('步长要填正整数');
  if (!Number.isInteger(r.count) || r.count < 1) throw new Error('数量至少为 1');
  if (r.count > MAX_LABELS) throw new Error(`一次最多生成 ${MAX_LABELS} 个，请分批生成`);
  const pad = Math.max(0, Math.min(20, Math.floor(r.pad)));
  return Array.from({ length: r.count }, (_, i) => `${r.prefix}${String(r.start + i * r.step).padStart(pad, '0')}${r.suffix}`);
}

// ---------- 表格 ----------

/** 文本解码：优先 UTF-8（去掉 BOM），不是合法 UTF-8 时按 GBK 解（Excel 中文版导出的 CSV 常见） */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('gbk').decode(bytes);
  }
}

/** 解析 CSV：支持引号、引号内换行与逗号、两个引号转义，自动识别逗号 / 制表符 / 分号分隔 */
export function parseCsv(text: string): string[][] {
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
  const sep = [',', '\t', ';'].map((s) => [s, firstLine.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
/** 单元格转文字：整数不带小数点，日期写成 2026-10-23（有时间时带时分） */
export function cellText(v: Cell): string {
  if (v == null) return '';
  if (v instanceof Date) {
    const d = `${v.getUTCFullYear()}-${pad2(v.getUTCMonth() + 1)}-${pad2(v.getUTCDate())}`;
    return v.getUTCHours() || v.getUTCMinutes() ? `${d} ${pad2(v.getUTCHours())}:${pad2(v.getUTCMinutes())}` : d;
  }
  return String(v).trim();
}

/** 列字母转序号：A→0，AB→27 */
export function letterIndex(s: string): number {
  return [...s.toUpperCase()].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

/** 按表头名或列字母找列；找不到返回 -1。表头名优先，避免表头恰好叫「A」时误判 */
export function findColumn(header: string[], key: string): number {
  const k = key.trim();
  if (!k) return -1;
  const byName = header.findIndex((h) => h.trim() === k);
  if (byName >= 0) return byName;
  return /^[A-Za-z]{1,2}$/.test(k) ? letterIndex(k) : -1;
}

export interface TableRow {
  /** 表头 → 值 */
  values: Record<string, string>;
  /** 在表格里的行号（从 1 起，含表头行），用于报错 */
  line: number;
}

/** 二维数组转成带表头的行：headerRow 从 1 起；跳过整行为空的行 */
export function toRows(grid: Cell[][], headerRow: number): { header: string[]; rows: TableRow[] } {
  const hi = Math.max(1, Math.floor(headerRow)) - 1;
  if (grid.length <= hi) throw new Error(`表格只有 ${grid.length} 行，找不到第 ${hi + 1} 行的表头`);
  const header = (grid[hi] ?? []).map((c, i) => cellText(c) || `第${i + 1}列`);
  const rows: TableRow[] = [];
  for (let r = hi + 1; r < grid.length; r++) {
    const cells = (grid[r] ?? []).map(cellText);
    if (!cells.some(Boolean)) continue;
    rows.push({ line: r + 1, values: Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ''])) });
  }
  return { header, rows };
}

// ---------- 标签内容 ----------

export interface Label {
  /** 二维码里的内容 */
  content: string;
  /** 印在二维码旁边的文字，一项一行 */
  lines: string[];
}

/** 模板里用到的占位符名称（去重） */
export const placeholders = (tpl: string) => [...new Set([...tpl.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1].trim()))];

/** 填模板：{内容} {序号} 以及表格的列名；空行去掉 */
export function fillTemplate(tpl: string, vars: Record<string, string>): string[] {
  return tpl
    .replace(/\{([^{}]+)\}/g, (all, k: string) => vars[k.trim()] ?? all)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** 编号规则 → 标签 */
export function labelsFromSerials(codes: string[], tpl: string): Label[] {
  const bad = placeholders(tpl).filter((k) => k !== '内容' && k !== '序号');
  if (bad.length) throw new Error(`文字模板里的 {${bad[0]}} 认不出来，编号模式只能用 {内容} 和 {序号}`);
  return codes.map((content, i) => ({ content, lines: fillTemplate(tpl, { 内容: content, 序号: String(i + 1) }) }));
}

/** 表格 → 标签：contentCol 是二维码内容所在列（表头名或列字母） */
export function labelsFromTable(table: { header: string[]; rows: TableRow[] }, contentCol: string, tpl: string): { labels: Label[]; skipped: number[] } {
  const ci = findColumn(table.header, contentCol);
  if (ci < 0 || ci >= table.header.length) throw new Error(`找不到列「${contentCol}」，表头是：${table.header.join('、')}`);
  const col = table.header[ci];
  const known = new Set([...table.header, '内容', '序号']);
  const bad = placeholders(tpl).filter((k) => !known.has(k));
  if (bad.length) throw new Error(`文字模板里的 {${bad[0]}} 在表头里找不到，表头是：${table.header.join('、')}`);
  const labels: Label[] = [];
  const skipped: number[] = [];
  for (const r of table.rows) {
    const content = r.values[col];
    if (!content) { skipped.push(r.line); continue; }
    labels.push({ content, lines: fillTemplate(tpl, { ...r.values, 内容: content, 序号: String(labels.length + 1) }) });
  }
  if (labels.length > MAX_LABELS) throw new Error(`表格里有 ${labels.length} 行，一次最多生成 ${MAX_LABELS} 个，请分批生成`);
  return { labels, skipped };
}

// ---------- 纸张与排版（单位全部是 mm，原点在纸张左上角） ----------

export interface Sheet {
  pageW: number;
  pageH: number;
  cols: number;
  rows: number;
  labelW: number;
  labelH: number;
  /** 第一个标签左上角离纸边的距离 */
  left: number;
  top: number;
  gapX: number;
  gapY: number;
}

export interface GridInput {
  pageW: number;
  pageH: number;
  cols: number;
  rows: number;
  /** 上下边距、左右边距 */
  marginY: number;
  marginX: number;
  gapX: number;
  gapY: number;
}

/** 整张纸排成 cols × rows 的网格，标签尺寸由纸张、边距、间距算出 */
export function gridSheet(g: GridInput): Sheet {
  const cols = Math.floor(g.cols), rows = Math.floor(g.rows);
  if (cols < 1 || rows < 1) throw new Error('每页的行数和列数至少为 1');
  if ([g.marginX, g.marginY, g.gapX, g.gapY].some((v) => !(v >= 0))) throw new Error('边距和间距不能是负数');
  const labelW = (g.pageW - 2 * g.marginX - (cols - 1) * g.gapX) / cols;
  const labelH = (g.pageH - 2 * g.marginY - (rows - 1) * g.gapY) / rows;
  if (labelW < 8 || labelH < 8) throw new Error(`按现在的行列和边距，每个标签只有 ${fmt(labelW)} × ${fmt(labelH)} mm，太小了。请减少行列数或边距`);
  return { pageW: g.pageW, pageH: g.pageH, cols, rows, labelW, labelH, left: g.marginX, top: g.marginY, gapX: g.gapX, gapY: g.gapY };
}

/** 标签纸（热敏打印机等）：每页就是一张标签 */
export function rollSheet(w: number, h: number): Sheet {
  if (!(w >= 10 && h >= 10)) throw new Error('标签宽和高至少 10 mm');
  if (w > 500 || h > 500) throw new Error('标签宽和高不能超过 500 mm');
  return { pageW: w, pageH: h, cols: 1, rows: 1, labelW: w, labelH: h, left: 0, top: 0, gapX: 0, gapY: 0 };
}

export const perPage = (s: Sheet) => s.cols * s.rows;
export const pageCount = (s: Sheet, n: number) => Math.ceil(n / perPage(s));

/** 第 i 个标签（从 0 起）在第几页、左上角坐标：先从左到右，再从上到下 */
export function slot(s: Sheet, i: number) {
  const per = perPage(s);
  const k = i % per;
  const col = k % s.cols;
  const row = Math.floor(k / s.cols);
  return { page: Math.floor(i / per), col, row, x: s.left + col * (s.labelW + s.gapX), y: s.top + row * (s.labelH + s.gapY) };
}

export interface Box { x: number; y: number; w: number; h: number }

export interface InnerOptions {
  /** 二维码在左、文字在右；或二维码在上、文字在下 */
  layout: 'left' | 'top';
  /** 标签内边距 mm */
  padding: number;
  /** 文字行数（0 表示只有二维码） */
  lines: number;
  /** 字号（点） */
  fontPt: number;
}

/** 行高（mm）：字号的 1.3 倍 */
export const lineHeightMm = (fontPt: number) => (fontPt * 1.3) / MM;

/** 标签内部：二维码与文字区域（相对标签左上角） */
export function innerLayout(labelW: number, labelH: number, o: InnerOptions): { qr: Box; text: Box | null } {
  const p = Math.max(0, o.padding);
  const bw = labelW - 2 * p, bh = labelH - 2 * p;
  if (bw < 5 || bh < 5) throw new Error('内边距太大，标签里放不下二维码');
  if (!o.lines) {
    const q = Math.min(bw, bh);
    return { qr: { x: p + (bw - q) / 2, y: p + (bh - q) / 2, w: q, h: q }, text: null };
  }
  const gap = 1.5;
  if (o.layout === 'left') {
    const q = Math.min(bh, bw * 0.55);
    return { qr: { x: p, y: p + (bh - q) / 2, w: q, h: q }, text: { x: p + q + gap, y: p, w: bw - q - gap, h: bh } };
  }
  const th = Math.min(bh * 0.45, o.lines * lineHeightMm(o.fontPt));
  const q = Math.min(bw, bh - th - gap);
  if (q < 5) throw new Error('标签太矮，放不下二维码和文字。请减少文字行数、调小字号，或改成「二维码在左」');
  const total = q + gap + th;
  const y0 = p + (bh - total) / 2;
  return { qr: { x: p + (bw - q) / 2, y: y0, w: q, h: q }, text: { x: p, y: y0 + q + gap, w: bw, h: th } };
}

/** 二维码矩阵 → SVG 路径：每行连续的深色格子合成一段，quiet 为四周留白格数 */
export function qrPath(size: number, dark: (r: number, c: number) => boolean, quiet: number): { path: string; total: number } {
  const parts: string[] = [];
  for (let r = 0; r < size; r++) {
    let c = 0;
    while (c < size) {
      if (!dark(r, c)) { c++; continue; }
      const c0 = c;
      while (c < size && dark(r, c)) c++;
      parts.push(`M${c0 + quiet} ${r + quiet}h${c - c0}v1h${c0 - c}z`);
    }
  }
  return { path: parts.join(''), total: size + 2 * quiet };
}

/** 文字按宽度折行：measure 返回文字宽度；超过 maxLines 时最后一行末尾加省略号 */
export function wrapLines(lines: string[], maxWidth: number, maxLines: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  for (const line of lines) {
    let cur = '';
    // 连续的字母数字（编号、网址）尽量不从中间断开；单个就超宽时再按字断
    for (const tok of line.match(/[\x21-\x7E]+|\s+|./gu) ?? []) {
      if (measure(cur + tok) <= maxWidth) { cur += tok; continue; }
      if (cur.trim()) out.push(cur.trimEnd());
      cur = '';
      if (/^\s+$/.test(tok)) continue;
      for (const ch of [...tok]) {
        if (cur && measure(cur + ch) > maxWidth) { out.push(cur); cur = ch; } else cur += ch;
      }
    }
    if (cur.trim()) out.push(cur.trimEnd());
  }
  if (out.length <= maxLines) return out;
  const kept = out.slice(0, Math.max(1, maxLines));
  let last = kept[kept.length - 1];
  while (last && measure(last + '…') > maxWidth) last = [...last].slice(0, -1).join('');
  kept[kept.length - 1] = last + '…';
  return kept;
}

export const fmt = (v: number) => String(Math.round(v * 10) / 10);

/** 文件名里不能用的字符换成下划线 */
export const safeName = (s: string) => s.replace(/[\\/:*?"<>|\r\n]/g, '_').trim() || '二维码标签';

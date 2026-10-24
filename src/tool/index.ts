// 工具声明：批量二维码标签。按编号规则或表格批量生成二维码，排成可打印的 PDF。全部在本机完成。
import { QrCode as QrCodeAsIcon } from 'lucide-react';
import type { GenerateTool, Params } from '../kit/types';
import { A4, fmt, gridSheet, labelsFromSerials, labelsFromTable, perPage, rollSheet, safeName, serials, toRows, type Label, type Sheet } from './core';
import { buildPdf, type Ecc, type TextRenderer } from './pdf';
import { canvasText } from './textimg';
import { readGrid } from './xlsx';
import { ResultBody, statOf } from './Result';
import './tool.css';

/** 可替换的依赖：测试里换成假的文字渲染 */
export const deps: { render: TextRenderer } = { render: canvasText };

const isGrid = (p: Params) => p.paper !== 'roll';
const PAPER: Record<string, string> = { a4: 'A4', custom: '自定义纸张', roll: '标签纸' };

export function makeSheet(p: Params): Sheet {
  if (p.paper === 'roll') return rollSheet(Number(p.labelW), Number(p.labelH));
  const page = p.paper === 'custom' ? { w: Number(p.pageW), h: Number(p.pageH) } : A4;
  if (!(page.w >= 20 && page.h >= 20 && page.w <= 1000 && page.h <= 1000)) throw new Error('纸张宽高要在 20～1000 mm 之间');
  return gridSheet({ pageW: page.w, pageH: page.h, cols: Number(p.cols), rows: Number(p.rows), marginX: Number(p.marginX), marginY: Number(p.marginY), gapX: Number(p.gapX), gapY: Number(p.gapY) });
}

async function makeLabels(p: Params, readFile: (path: string) => Promise<Uint8Array>): Promise<{ labels: Label[]; note: string }> {
  const tpl = String(p.template);
  if (p.source === 'excel') {
    const file = String(p.file);
    if (!file) throw new Error('先在参数里选择表格文件');
    const grid = await readGrid(await readFile(file), file);
    const { labels, skipped } = labelsFromTable(toRows(grid, Number(p.headerRow)), String(p.column), tpl);
    if (!labels.length) throw new Error(`「${p.column}」这一列没有内容`);
    return { labels, note: skipped.length ? `，跳过 ${skipped.length} 个空行（第 ${skipped.slice(0, 5).join('、')}${skipped.length > 5 ? ' 等' : ''} 行）` : '' };
  }
  const codes = serials({ prefix: String(p.prefix), suffix: '', start: Number(p.start), count: Number(p.count), step: 1, pad: Number(p.pad) });
  return { labels: labelsFromSerials(codes, tpl), note: '' };
}

const tool: GenerateTool = {
  id: 'o15',
  name: '批量二维码标签',
  tagline: '按编号规则或 Excel 表格批量生成二维码，配上文字排成 A4 或标签纸，导出可直接打印的 PDF。全部在本机完成，不联网、不上传。',
  icon: QrCodeAsIcon,
  category: '办公提效',
  type: 'data',
  mode: 'generate',
  resultView: 'table',
  columns: [['count', '标签数'], ['pages', '页数'], ['paper', '纸张'], ['size', '标签尺寸'], ['first', '第一个内容']],
  concurrency: 1,
  generateLabel: '生成 PDF',
  ResultBody,
  itemName: (_i, p) => `${safeName(String(p.name))}.pdf`,
  params: [
    { key: 'source', label: '内容来源', type: 'segment', options: [['rule', '按编号规则'], ['excel', '从表格导入']], default: 'rule' },
    { key: 'prefix', label: '编号前缀', type: 'text', default: 'ZC-2026-', placeholder: '例如 资产-2026-', when: (p) => p.source === 'rule', help: '二维码内容 = 前缀 + 数字，例如前缀「资产-」得到「资产-0001」' },
    { key: 'start', label: '起始号', type: 'number', default: 1, min: 0, when: (p) => p.source === 'rule' },
    { key: 'count', label: '数量', type: 'number', default: 24, min: 1, max: 10000, unit: '个', when: (p) => p.source === 'rule' },
    { key: 'pad', label: '数字补零到', type: 'number', default: 4, min: 0, max: 12, unit: '位', when: (p) => p.source === 'rule', help: '填 4 时 1 写成 0001；填 0 不补零' },
    { key: 'file', label: '表格文件', type: 'file', extensions: ['xlsx', 'csv'], fileLabel: '表格（.xlsx / .csv）', default: '', when: (p) => p.source === 'excel', help: '读第一个工作表' },
    { key: 'column', label: '二维码内容在哪一列', type: 'text', default: '编号', when: (p) => p.source === 'excel', help: '填表头名，例如「编号」或「网址」；也可以填列字母 A' },
    { key: 'headerRow', label: '表头在第几行', type: 'number', default: 1, min: 1, when: (p) => p.source === 'excel' },
    { key: 'template', label: '标签文字', type: 'textarea', rows: 3, default: '{内容}', help: '一行对应标签上一行字。{内容} 是二维码内容，{序号} 是第几个；表格可写列名，例如 {名称}。留空则只印二维码' },
    { key: 'paper', label: '纸张', type: 'select', options: [['a4', 'A4（210 × 297 mm）'], ['custom', '自定义纸张尺寸'], ['roll', '标签纸（每页一张标签）']], default: 'a4' },
    { key: 'pageW', label: '纸张宽', type: 'number', default: 100, min: 20, max: 1000, unit: 'mm', when: (p) => p.paper === 'custom' },
    { key: 'pageH', label: '纸张高', type: 'number', default: 150, min: 20, max: 1000, unit: 'mm', when: (p) => p.paper === 'custom' },
    { key: 'cols', label: '每页列数', type: 'number', default: 3, min: 1, max: 20, when: isGrid },
    { key: 'rows', label: '每页行数', type: 'number', default: 8, min: 1, max: 40, when: isGrid },
    { key: 'marginX', label: '左右边距', type: 'number', default: 10, min: 0, step: 0.5, unit: 'mm', when: isGrid },
    { key: 'marginY', label: '上下边距', type: 'number', default: 12, min: 0, step: 0.5, unit: 'mm', when: isGrid },
    { key: 'gapX', label: '标签左右间距', type: 'number', default: 3, min: 0, step: 0.5, unit: 'mm', when: isGrid },
    { key: 'gapY', label: '标签上下间距', type: 'number', default: 3, min: 0, step: 0.5, unit: 'mm', when: isGrid, help: '标签尺寸按纸张、行列、边距和间距自动算出，生成后在结果里显示' },
    { key: 'labelW', label: '标签宽', type: 'number', default: 50, min: 10, max: 500, unit: 'mm', when: (p) => p.paper === 'roll' },
    { key: 'labelH', label: '标签高', type: 'number', default: 30, min: 10, max: 500, unit: 'mm', when: (p) => p.paper === 'roll' },
    { key: 'layout', label: '排版', type: 'segment', options: [['left', '二维码在左'], ['top', '二维码在上']], default: 'left' },
    { key: 'padding', label: '标签内边距', type: 'number', default: 2, min: 0, step: 0.5, unit: 'mm' },
    { key: 'fontPt', label: '字号', type: 'number', default: 9, min: 5, max: 36, unit: '点' },
    { key: 'ecc', label: '纠错等级', type: 'select', options: [['L', 'L 低（约 7%，图案最简单）'], ['M', 'M 中（约 15%，推荐）'], ['Q', 'Q 较高（约 25%）'], ['H', 'H 高（约 30%，耐磨损）']], default: 'M' },
    { key: 'border', label: '画出标签边框', type: 'toggle', default: false, help: '用普通 A4 纸打印后自己裁剪时打开；不干胶标签纸一般关掉' },
    { key: 'name', label: '文件名', type: 'text', default: '二维码标签' },
    { key: 'out', label: '保存到', type: 'folder', default: '' },
  ],

  async generate(_index, ctx) {
    const p = ctx.params;
    const sheet = makeSheet(p);
    const { labels, note } = await makeLabels(p, ctx.readFile);
    const r = await buildPdf(
      labels,
      sheet,
      { layout: p.layout === 'top' ? 'top' : 'left', padding: Number(p.padding), fontPt: Number(p.fontPt), ecc: (String(p.ecc) as Ecc) || 'M', border: Boolean(p.border), quiet: 4 },
      deps.render,
      ctx.progress,
      ctx.signal,
    );
    const name = `${safeName(String(p.name))}.pdf`;
    const outputPath = await ctx.join(ctx.outputDir, name);
    await ctx.writeFile(outputPath, r.bytes);
    const size = `${fmt(sheet.labelW)} × ${fmt(sheet.labelH)} mm`;
    const paper = p.paper === 'roll' ? PAPER.roll : `${PAPER[String(p.paper)] ?? 'A4'} 每页 ${sheet.cols}×${sheet.rows}=${perPage(sheet)} 个`;
    const sampleText = labels.slice(0, 5).map((l, i) => `${i + 1}. ${l.content}${l.lines.length ? '　｜　' + l.lines.join(' / ') : ''}`).join('\n');
    return {
      title: name,
      outputPath,
      summary: `${labels.length} 个标签，${r.pages} 页${note}`,
      data: statOf(labels.slice(0, 48), sheet, { paper, layout: p.layout === 'top' ? 'top' : 'left', padding: Number(p.padding), fontPt: Number(p.fontPt), ecc: (String(p.ecc) as Ecc) || 'M', pages: r.pages, count: labels.length }),
      row: { count: labels.length, pages: r.pages, paper, size, first: labels[0].content },
      text: `${labels.length} 个标签，共 ${r.pages} 页，标签 ${size}${note}\n\n前几个标签：\n${sampleText}${labels.length > 5 ? '\n…' : ''}`,
    };
  },
};

export default tool;

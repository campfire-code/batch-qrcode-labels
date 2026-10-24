// 截图与预览用的示例数据（不会进入正式运行）
import type { Row } from '../kit/runner';
import { A4, fmt, gridSheet, labelsFromSerials, serials } from './core';
import { statOf } from './Result';

const sheet = gridSheet({ pageW: A4.w, pageH: A4.h, cols: 3, rows: 8, marginX: 10, marginY: 12, gapX: 3, gapY: 3 });
const labels = labelsFromSerials(serials({ prefix: '资产-', suffix: '', start: 1, count: 24, step: 1, pad: 4 }), '{内容}').map((l, i) => ({ ...l, lines: [l.content, ['办公椅', '升降桌', '显示器', '笔记本电脑'][i % 4]] }));
const stat = statOf(labels, sheet, { paper: 'A4 每页 3×8=24 个', layout: 'left', padding: 2, fontPt: 9, ecc: 'M', pages: 1, count: 24 });
const size = `${fmt(sheet.labelW)} × ${fmt(sheet.labelH)} mm`;
const text = `24 个标签，共 1 页，标签 ${size}`;

export const rows = (state: string): Row[] =>
  state === 'empty' ? [] : [
    {
      item: { id: 'g0', name: '二维码标签.pdf', path: '' },
      status: 'ok', progress: 1,
      result: { summary: '24 个标签，1 页', outputPath: '/示例/输出/二维码标签.pdf', text, data: stat, row: { count: 24, pages: 1, paper: stat.paper, size, first: '资产-0001' } },
    },
    {
      item: { id: 'g1', name: '固定资产清单.pdf', path: '' },
      status: state === 'done' ? 'ok' : 'run', progress: 0.5,
      result: state === 'done' ? { summary: '30 个标签，2 页，跳过 1 个空行（第 14 行）', outputPath: '/示例/输出/固定资产清单.pdf', data: { ...stat, count: 30, pages: 2 }, row: { count: 30, pages: 2, paper: stat.paper, size, first: '资产-0001' } } : undefined,
    },
  ];

export const params = { source: 'rule', prefix: '资产-', start: 1, count: 24 };

export const notice = { kind: 'ok' as const, text: '已生成 2 个 PDF，保存在输出文件夹里' };

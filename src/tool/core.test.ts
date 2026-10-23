import { describe, expect, it } from 'vitest';
import {
  A4, MM, cellText, fillTemplate, findColumn, gridSheet, innerLayout, labelsFromSerials, labelsFromTable, pageCount, parseCsv, perPage, placeholders, qrPath, rollSheet, serials, slot, toRows, wrapLines,
} from './core';

describe('编号规则', () => {
  it('前缀 + 补零', () => expect(serials({ prefix: 'ZC-', suffix: '', start: 1, count: 3, step: 1, pad: 4 })).toEqual(['ZC-0001', 'ZC-0002', 'ZC-0003']));
  it('步长与后缀，数字超过位数时不截断', () => expect(serials({ prefix: '', suffix: '号', start: 98, count: 3, step: 2, pad: 2 })).toEqual(['98号', '100号', '102号']));
  it('不补零', () => expect(serials({ prefix: 'A', suffix: '', start: 9, count: 2, step: 1, pad: 0 })).toEqual(['A9', 'A10']));
  it('数量超过上限报错', () => expect(() => serials({ prefix: '', suffix: '', start: 1, count: 10001, step: 1, pad: 0 })).toThrow('一次最多生成 10000 个'));
  it('起始号不能是小数或负数', () => expect(() => serials({ prefix: '', suffix: '', start: -1, count: 1, step: 1, pad: 0 })).toThrow('起始号'));
});

describe('表格', () => {
  it('CSV 引号与换行', () => expect(parseCsv('编号,名称\n"A,1","多\n行"\n')).toEqual([['编号', '名称'], ['A,1', '多\n行']]));
  it('单元格文字：整数、日期', () => {
    expect(cellText(12)).toBe('12');
    expect(cellText(new Date(Date.UTC(2026, 9, 23)))).toBe('2026-10-23');
    expect(cellText(null)).toBe('');
  });
  it('按表头名或列字母找列', () => {
    expect(findColumn(['编号', '名称'], '名称')).toBe(1);
    expect(findColumn(['编号', '名称'], 'b')).toBe(1);
    expect(findColumn(['编号', '名称'], '网址')).toBe(-1);
  });
  it('表头不在第一行，跳过空行', () => {
    const t = toRows([['资产清单'], ['编号', '名称'], ['A1', '椅子'], [null, ''], ['A2', '桌子']], 2);
    expect(t.header).toEqual(['编号', '名称']);
    expect(t.rows.map((r) => r.line)).toEqual([3, 5]);
  });
  it('表格转标签：内容为空的行跳过并记行号，模板可用列名', () => {
    const t = toRows([['编号', '名称'], ['A1', '椅子'], ['', '无编号'], ['A2', '桌子']], 1);
    const r = labelsFromTable(t, '编号', '{名称}\n编号 {内容}');
    expect(r.labels).toEqual([{ content: 'A1', lines: ['椅子', '编号 A1'] }, { content: 'A2', lines: ['桌子', '编号 A2'] }]);
    expect(r.skipped).toEqual([3]);
  });
  it('列名写错时列出表头', () => expect(() => labelsFromTable(toRows([['编号', '名称'], ['A1', 'x']], 1), '网址', '')).toThrow('表头是：编号、名称'));
  it('模板里的列名写错时报错', () => expect(() => labelsFromTable(toRows([['编号'], ['A1']], 1), '编号', '{位置}')).toThrow('{位置}'));
});

describe('文字模板', () => {
  it('占位符', () => expect(placeholders('{内容} {序号} { 内容 }')).toEqual(['内容', '序号']));
  it('填充并去掉空行', () => expect(fillTemplate('{内容}\n\n第{序号}个', { 内容: 'A', 序号: '3' })).toEqual(['A', '第3个']));
  it('编号模式不能用列名', () => expect(() => labelsFromSerials(['A'], '{名称}')).toThrow('只能用 {内容} 和 {序号}'));
  it('空模板只印二维码', () => expect(labelsFromSerials(['A'], '')).toEqual([{ content: 'A', lines: [] }]));
});

describe('纸张排版', () => {
  const a4 = gridSheet({ pageW: A4.w, pageH: A4.h, cols: 3, rows: 8, marginX: 10, marginY: 12, gapX: 3, gapY: 3 });
  it('A4 3×8：标签尺寸由边距和间距算出', () => {
    expect(a4.labelW).toBeCloseTo((210 - 20 - 6) / 3, 6);
    expect(a4.labelH).toBeCloseTo((297 - 24 - 21) / 8, 6);
    expect(perPage(a4)).toBe(24);
  });
  it('第 0 个在左上角，第 4 个在第二行第二列，第 24 个换到第 2 页', () => {
    expect(slot(a4, 0)).toMatchObject({ page: 0, col: 0, row: 0, x: 10, y: 12 });
    const s = slot(a4, 4);
    expect(s).toMatchObject({ page: 0, col: 1, row: 1 });
    expect(s.x).toBeCloseTo(10 + a4.labelW + 3, 6);
    expect(s.y).toBeCloseTo(12 + a4.labelH + 3, 6);
    expect(slot(a4, 24)).toMatchObject({ page: 1, col: 0, row: 0 });
  });
  it('最后一个标签的右下角正好落在边距内', () => {
    const s = slot(a4, 23);
    expect(s.x + a4.labelW).toBeCloseTo(210 - 10, 6);
    expect(s.y + a4.labelH).toBeCloseTo(297 - 12, 6);
  });
  it('分页数', () => {
    expect(pageCount(a4, 24)).toBe(1);
    expect(pageCount(a4, 25)).toBe(2);
    expect(pageCount(rollSheet(50, 30), 7)).toBe(7);
  });
  it('行列太多时报错', () => expect(() => gridSheet({ pageW: 210, pageH: 297, cols: 30, rows: 8, marginX: 10, marginY: 10, gapX: 3, gapY: 3 })).toThrow('太小了'));
  it('标签纸尺寸校验', () => expect(() => rollSheet(5, 30)).toThrow('至少 10 mm'));
});

describe('标签内部布局', () => {
  it('二维码在左：高度占满，文字在右', () => {
    const r = innerLayout(60, 30, { layout: 'left', padding: 2, lines: 2, fontPt: 9 });
    expect(r.qr).toEqual({ x: 2, y: 2, w: 26, h: 26 });
    expect(r.text).toEqual({ x: 29.5, y: 2, w: 28.5, h: 26 });
  });
  it('二维码在上：文字高度按行数，整体垂直居中', () => {
    const r = innerLayout(40, 50, { layout: 'top', padding: 2, lines: 1, fontPt: 9 });
    const th = (9 * 1.3) / MM;
    expect(r.text!.h).toBeCloseTo(th, 6);
    expect(r.qr.w).toBeCloseTo(36, 6);
    expect(r.qr.y + r.qr.w + 1.5 + th + r.qr.y).toBeCloseTo(50, 6);
  });
  it('没有文字时二维码居中', () => expect(innerLayout(60, 30, { layout: 'left', padding: 2, lines: 0, fontPt: 9 })).toEqual({ qr: { x: 17, y: 2, w: 26, h: 26 }, text: null }));
  it('放不下时报错', () => expect(() => innerLayout(10, 10, { layout: 'left', padding: 4, lines: 1, fontPt: 9 })).toThrow('内边距太大'));
});

describe('二维码路径与文字折行', () => {
  it('同一行连续的深色格子合成一段，加上留白偏移', () => {
    const m = [[1, 1, 0], [0, 0, 0], [1, 0, 1]];
    const r = qrPath(3, (y, x) => m[y][x] === 1, 4);
    expect(r.total).toBe(11);
    expect(r.path).toBe('M4 4h2v1h-2zM4 6h1v1h-1zM6 6h1v1h-1z');
  });
  it('按宽度折行，超出行数加省略号', () => {
    const measure = (s: string) => [...s].length * 10;
    expect(wrapLines(['一二三四五'], 30, 5, measure)).toEqual(['一二三', '四五']);
    expect(wrapLines(['一二三四五六七'], 30, 2, measure)).toEqual(['一二三', '四五…']);
    expect(wrapLines(['编号 ZC-01'], 60, 5, measure)).toEqual(['编号', 'ZC-01']);
    expect(wrapLines(['ABCDEFGH'], 30, 5, measure)).toEqual(['ABC', 'DEF', 'GH']);
  });
});

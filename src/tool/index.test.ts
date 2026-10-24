import { beforeAll, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import tool, { deps, makeSheet } from './index';
import { buildPdf, qrMatrix } from './pdf';
import { writeXlsx } from './xlsx';
import type { Params, RunContext } from '../kit/types';

// 1×1 透明 PNG：假的文字渲染，测试里不需要画布
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
const rendered: string[][] = [];
beforeAll(() => {
  deps.render = async (lines) => { rendered.push(lines); return PNG; };
});

function fakeCtx(files: Map<string, Uint8Array>, params: Params): RunContext {
  return {
    params, outputDir: '/out', signal: new AbortController().signal, progress: () => {},
    readFile: async (p) => { const f = files.get(p); if (!f) throw new Error('没有文件 ' + p); return f; },
    readText: async (p) => new TextDecoder().decode(files.get(p)!),
    writeFile: async (p, d) => void files.set(p, d),
    writeText: async (p, t) => void files.set(p, new TextEncoder().encode(t)),
    mkdir: async () => {},
    join: async (...parts) => parts.join('/'),
    llm: async () => '', sidecar: async () => '', ffmpeg: async () => {}, duration: async () => 0,
  };
}
const defaults = (over: Params): Params => ({ ...Object.fromEntries(tool.params.map((f) => [f.key, f.default])), ...over });
const pagesOf = async (b: Uint8Array) => (await PDFDocument.load(b)).getPages();

describe('编号规则生成 PDF', () => {
  it('默认参数：24 个标签排满 A4 一页', async () => {
    const files = new Map<string, Uint8Array>();
    const r = await tool.generate(0, fakeCtx(files, defaults({})));
    expect(r.outputPath).toBe('/out/二维码标签.pdf');
    expect(r.row).toMatchObject({ count: 24, pages: 1, first: 'ZC-2026-0001' });
    const pages = await pagesOf(files.get('/out/二维码标签.pdf')!);
    expect(pages).toHaveLength(1);
    // A4 = 210 × 297 mm ≈ 595.28 × 841.89 点
    expect(pages[0].getWidth()).toBeCloseTo(595.28, 1);
    expect(pages[0].getHeight()).toBeCloseTo(841.89, 1);
  });
  it('50 个标签分成 3 页', async () => {
    const files = new Map<string, Uint8Array>();
    const r = await tool.generate(0, fakeCtx(files, defaults({ count: 50, name: '资产' })));
    expect(r.summary).toBe('50 个标签，3 页');
    expect(await pagesOf(files.get('/out/资产.pdf')!)).toHaveLength(3);
  });
  it('标签纸：每页一张，页面尺寸就是标签尺寸', async () => {
    const files = new Map<string, Uint8Array>();
    await tool.generate(0, fakeCtx(files, defaults({ paper: 'roll', labelW: 40, labelH: 30, count: 5 })));
    const pages = await pagesOf(files.get('/out/二维码标签.pdf')!);
    expect(pages).toHaveLength(5);
    expect(pages[0].getWidth()).toBeCloseTo(40 * 72 / 25.4, 3);
  });
  it('自定义纸张尺寸', () => expect(makeSheet(defaults({ paper: 'custom', pageW: 100, pageH: 150, cols: 2, rows: 3, marginX: 5, marginY: 5, gapX: 2, gapY: 2 }))).toMatchObject({ pageW: 100, labelW: 44, labelH: (140 - 4) / 3 }));
});

describe('表格生成 PDF', () => {
  it('xlsx：按列取内容，模板用列名，空行跳过', async () => {
    const xlsx = await writeXlsx(['编号', '名称', '位置'], [['A-001', '办公椅', '三楼'], ['', '漏填', ''], ['A-002', '显示器', '二楼']]);
    const files = new Map([['/in/资产.xlsx', xlsx]]);
    rendered.length = 0;
    const r = await tool.generate(0, fakeCtx(files, defaults({ source: 'excel', file: '/in/资产.xlsx', column: '编号', template: '{名称}\n{位置} · {内容}' })));
    expect(r.row).toMatchObject({ count: 2, pages: 1, first: 'A-001' });
    expect(r.summary).toContain('跳过 1 个空行（第 3 行）');
    expect(rendered).toEqual([['办公椅', '三楼 · A-001'], ['显示器', '二楼 · A-002']]);
  });
  it('CSV（UTF-8 带 BOM），按列字母取内容', async () => {
    const csv = new TextEncoder().encode('\uFEFF网址,名称\nhttps://example.com/a,甲\n');
    const files = new Map([['/in/a.csv', csv]]);
    const r = await tool.generate(0, fakeCtx(files, defaults({ source: 'excel', file: '/in/a.csv', column: 'A', template: '' })));
    expect(r.row).toMatchObject({ count: 1, first: 'https://example.com/a' });
  });
  it('CSV（GBK 编码）按表头名取内容', async () => {
    // 「名称,编号」换行「甲,A1」的 GBK 字节
    const csv = Uint8Array.from([0xC3, 0xFB, 0xB3, 0xC6, 0x2C, 0xB1, 0xE0, 0xBA, 0xC5, 0x0A, 0xBC, 0xD7, 0x2C, 0x41, 0x31]);
    const files = new Map([['/in/b.csv', csv]]);
    rendered.length = 0;
    const r = await tool.generate(0, fakeCtx(files, defaults({ source: 'excel', file: '/in/b.csv', column: '编号', template: '{名称}' })));
    expect(r.row).toMatchObject({ count: 1, first: 'A1' });
    expect(rendered).toEqual([['甲']]);
  });
  it('没选文件时提示', async () => {
    await expect(tool.generate(0, fakeCtx(new Map(), defaults({ source: 'excel' })))).rejects.toThrow('先在参数里选择表格文件');
  });
  it('旧版 xls 提示另存', async () => {
    const files = new Map([['/in/a.xls', new Uint8Array([1])]]);
    await expect(tool.generate(0, fakeCtx(files, defaults({ source: 'excel', file: '/in/a.xls' })))).rejects.toThrow('另存为 .xlsx');
  });
});

describe('二维码', () => {
  it('同样内容、纠错等级越高格子越多', () => {
    const t = 'https://example.com/asset/ZC-2026-0001';
    expect(qrMatrix(t, 'H').size).toBeGreaterThan(qrMatrix(t, 'L').size);
  });
  it('内容太长时报出是第几个标签', async () => {
    const long = 'x'.repeat(5000);
    const sheet = makeSheet(defaults({}));
    await expect(buildPdf([{ content: 'ok', lines: [] }, { content: long, lines: [] }], sheet, { layout: 'left', padding: 2, fontPt: 9, ecc: 'H', border: false, quiet: 4 }, deps.render)).rejects.toThrow(/第 2 个标签.*内容太长/);
  });
});

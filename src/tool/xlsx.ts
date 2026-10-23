// 读表格：.xlsx 用 exceljs（MIT），.csv 自己解析（自动识别 UTF-8 / GBK）。只读第一个可见工作表。
import ExcelJS from 'exceljs';
import { decodeText, parseCsv, type Cell } from './core';

function cellValue(v: ExcelJS.CellValue): Cell {
  if (v == null) return null;
  if (v instanceof Date || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'object') {
    if ('result' in v) return cellValue((v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    if ('richText' in v) return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join('');
    if ('text' in v) return String((v as ExcelJS.CellHyperlinkValue).text);
    if ('error' in v) return null;
  }
  return String(v);
}

export async function readGrid(bytes: Uint8Array, fileName: string): Promise<Cell[][]> {
  if (/\.(csv|txt)$/i.test(fileName)) return parseCsv(decodeText(bytes));
  if (!/\.xlsx$/i.test(fileName)) throw new Error('只支持 .xlsx 和 .csv；旧版 .xls 请用 Excel 或 WPS 另存为 .xlsx');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  } catch {
    throw new Error('表格打不开，可能已损坏，或不是 .xlsx 格式');
  }
  const ws = wb.worksheets.find((w) => w.state === 'visible');
  if (!ws) throw new Error('表格里没有可见的工作表');
  const grid: Cell[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    grid[n - 1] = (row.values as ExcelJS.CellValue[]).slice(1).map(cellValue);
  });
  for (let i = 0; i < grid.length; i++) grid[i] ??= [];
  return grid;
}

export async function writeXlsx(header: string[], rows: Cell[][]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(header).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  ws.columns.forEach((c) => (c.width = 18));
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

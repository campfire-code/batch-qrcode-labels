// 截图与预览用的示例数据（不会进入正式运行）
import * as QRCode from 'qrcode';
import type { Row } from '../kit/runner';

/** 示例二维码缩略图：用工具同一个库画在画布上 */
function qrImage(content: string) {
  const q = QRCode.create(content, { errorCorrectionLevel: 'M' });
  const n = q.modules.size, k = 6, pad = 4 * k, size = n * k + pad * 2;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
  g.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (q.modules.get(r, col)) g.fillRect(pad + col * k, pad + r * k, k, k);
  return c.toDataURL('image/png');
}

const text = `24 个标签，共 1 页，标签 61.3 × 31.5 mm

前几个标签：
1. ZC-2026-0001　｜　ZC-2026-0001
2. ZC-2026-0002　｜　ZC-2026-0002
3. ZC-2026-0003　｜　ZC-2026-0003
4. ZC-2026-0004　｜　ZC-2026-0004
5. ZC-2026-0005　｜　ZC-2026-0005
…`;

export const rows = (state: string): Row[] =>
  state === 'empty' ? [] : [
    {
      item: { id: 'g0', name: '二维码标签（示例）.pdf', path: '' },
      status: 'ok', progress: 1,
      result: { preview: qrImage('ZC-2026-0001'), summary: '24 个标签，1 页', outputPath: '/示例/输出/二维码标签.pdf', text, row: { count: 24, pages: 1, paper: 'A4 每页 3×8=24 个', size: '61.3 × 31.5 mm', first: 'ZC-2026-0001' } },
    },
    {
      item: { id: 'g1', name: '固定资产清单（示例）.pdf', path: '' },
      status: state === 'done' ? 'ok' : 'run', progress: 0.5,
      result: state === 'done' ? { summary: '30 个标签，2 页，跳过 1 个空行（第 14 行）', outputPath: '/示例/输出/固定资产清单.pdf', row: { count: 30, pages: 2, paper: 'A4 每页 3×8=24 个', size: '61.3 × 31.5 mm', first: 'ZC-2026-0001' } } : undefined,
    },
  ];

export const params = { source: 'rule', prefix: 'ZC-2026-', start: 1, count: 24 };

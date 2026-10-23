// 生成 samples/ 里的示例文件（只在设置了 MAKE_SAMPLES=1 时运行）
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { writeXlsx } from './xlsx';

it.runIf(process.env.MAKE_SAMPLES === '1')('生成示例文件', async () => {
  const things = ['办公椅', '升降桌', '显示器', '笔记本电脑', '打印机', '文件柜', '投影仪', '白板', '路由器', '空调'];
  const places = ['一楼前台', '二楼办公区', '三楼会议室'];
  const rows = Array.from({ length: 30 }, (_, i) => [
    `ZC-2026-${String(i + 1).padStart(4, '0')}`,
    `${things[i % things.length]}（示例）`,
    places[i % places.length],
    i === 12 ? null : `2026-0${(i % 9) + 1}-15`,
  ]);
  rows.splice(12, 0, [null, '漏填编号的一行（示例）', '二楼办公区', null]);
  writeFileSync('samples/固定资产清单-示例.xlsx', await writeXlsx(['编号', '名称', '位置', '购入日期'], rows));
});

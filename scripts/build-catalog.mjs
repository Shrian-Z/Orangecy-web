import { buildCatalog, getCatalogStatus } from '../server/catalog.mjs';

const merge = process.argv.includes('--merge');
console.log(merge ? '开始补齐推荐歌池…' : '开始构建推荐歌池…');
try {
  await buildCatalog({ force: true, merge });
  console.log(getCatalogStatus());
} catch (error) {
  console.error('构建失败：', error.message);
  process.exitCode = 1;
}

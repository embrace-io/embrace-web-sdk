import { readdirSync, statSync, createReadStream } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream';
import { createGzip } from 'zlib';

const TARGET_DIRS = [
  { name: 'ESM', path: 'build/esm' },
  { name: 'ESNext', path: 'build/esnext' },
  { name: 'CJS (src)', path: 'build/src' },
  { name: 'CDN script (iife)', path: 'build/iife' },
];

const walkDir = (dir: string, ext = '.js'): string[] => {
  let files: string[] = [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, item.name);
    if (item.isDirectory()) {
      files = files.concat(walkDir(fullPath, ext));
    } else if (item.name.endsWith(ext)) {
      files.push(fullPath);
    }
  }
  return files;
};

const getSize = (file: string): number => statSync(file).size;

const getGzipSize = (file: string): Promise<number> =>
  new Promise((resolve, reject) => {
    let size = 0;
    pipeline(
      createReadStream(file),
      createGzip(),
      async function* (source) {
        for await (const chunk of source) size += chunk.length;
        resolve(size);
      },
      err => err && reject(err)
    );
  });

const analyzeFolder = async (name: string, path: string) => {
  try {
    const files = walkDir(path);
    let totalRaw = 0;
    let totalGzip = 0;

    console.log(`\n📂 ${name} — ${files.length} JS files\n`);

    for (const file of files) {
      const rawSize = getSize(file);
      const gzipSize = await getGzipSize(file);

      totalRaw += rawSize;
      totalGzip += gzipSize;
    }

    console.log(
      `📊 Total for ${name}: ${Math.round(totalRaw / 1024)} KB raw / ${Math.round(
        totalGzip / 1024
      )} KB gzip\n`
    );
  } catch (err) {
    console.warn(`⚠️  Skipped "${name}" (${path}): ${err}`);
  }
};

(async () => {
  console.log('\n🔎 Measuring output sizes...\n');
  for (const { name, path } of TARGET_DIRS) {
    await analyzeFolder(name, path);
  }
})();

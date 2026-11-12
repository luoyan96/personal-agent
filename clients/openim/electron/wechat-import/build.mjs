import { createRequire } from 'node:module';
import path from 'node:path';
export function buildWeChatImport(clientRoot, output) {
  const require = createRequire(path.join(clientRoot, 'package.json'));
  const esbuild = createRequire(require.resolve('vite'))('esbuild');
  for (const [entry, destination] of [
    ['electron', 'main/wechatImportRuntime.js'],
    ['preload', 'preload/wechatImportClient.js'],
  ]) esbuild.buildSync({
    entryPoints: [path.join(clientRoot, `electron/wechat-import/${entry}.mjs`)],
    outfile: path.join(output, destination), bundle: true, platform: 'node', format: 'cjs', target: 'node22',
  });
}

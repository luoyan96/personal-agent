import { spawnSync } from 'node:child_process';
import { mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = process.argv[2];
if (!output) throw new Error('Usage: pnpm build:apk <absolute-output-directory-outside-repository>');
const destination = resolve(output);
const repo = resolve(root, '../..');
if (!/^(?:[A-Za-z]:[\\/]|\/)/.test(output) || destination.toLowerCase().startsWith(repo.toLowerCase())) throw new Error('APK output must be an absolute directory outside this repository.');
const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status ?? 1);
};
run('pnpm', ['prebuild:android']);
// Non-debuggable build embeds JS and works without Metro. Expo dev-client remains
// available in assembleDebug; this internal preview uses only the generated debug
// signing key, never an app-store/release credential. No device install or publish.
run(process.platform === 'win32' ? 'android\\gradlew.bat' : 'android/gradlew', ['-p', 'android', ':app:assembleRelease', '--no-daemon', '--console=plain', '-PreactNativeArchitectures=arm64-v8a']);
const apk = readFileSync(join(root, 'android/app/build/outputs/apk/release/app-release.apk'));
mkdirSync(destination, { recursive: true });
const name = 'AcceptCat-mobile-0.1.0-preview-arm64.apk';
copyFileSync(join(root, 'android/app/build/outputs/apk/release/app-release.apk'), join(destination, name));
writeFileSync(join(destination, 'SHA256SUMS.txt'), `${createHash('sha256').update(apk).digest('hex')}  ${name}\n`);
console.log(`Internal preview APK: ${join(destination, name)} (${apk.length} bytes). Device and real-account acceptance remain separate.`);

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { libraryFixture, discoverRepository, repositoryUrl } from './helpers/team-library.mjs';

async function discoveryFixture(t) {
  const f = await libraryFixture(t);
  const root = path.join(f.root, 'discovery'), commands = [];
  const runner = directory => async (args, options = {}) => {
    commands.push(args);
    if (args[0] === 'config' && args[1] === 'remote.origin.url') args = [...args.slice(0, 2), f.remote];
    return f.git(['--git-dir=' + directory, ...args], { input: options.input, maxBuffer: options.maxBytes ?? 2*1024*1024 });
  };
  return { ...f, root, commands, connect: (url, previous = null) => discoverRepository(root, url, previous, runner) };
}

test('both pasted GitHub URLs normalize; credentials, extra paths and non-GitHub transports are rejected before Git', () => {
  for (const url of ['https://github.com/synthetic/files', ' https://github.com/synthetic/files.git ', 'https://github.com/synthetic/files/'])
    assert.equal(repositoryUrl(url), 'https://github.com/synthetic/files.git');
  for (const url of ['https://token@github.com/synthetic/files', 'https://github.com/synthetic/files?token=x', 'https://github.com/synthetic/files/tree/main', 'file:///secret', '--upload-pack=bad', 'https://example.invalid/synthetic/files'])
    assert.throws(() => repositoryUrl(url), /GitHub/);
});

test('first connection discovers a non-main default branch and reads the workspace from real Git objects without pushing', async t => {
  const f = await discoveryFixture(t);
  f.git(['--git-dir='+f.remote, 'branch', '-m', 'main', 'published']);
  const before = f.git(['--git-dir='+f.remote, 'show-ref']).toString();
  const result = await f.connect('https://github.com/synthetic/files');
  assert.equal(result.branch, 'published');
  assert.equal(result.workspaceId, f.manifest.workspaceId);
  assert.equal(result.url, f.binding.url);
  assert.equal(f.git(['--git-dir='+f.remote, 'show-ref']).toString(), before);
  assert(!f.commands.some(args => ['push', 'checkout', 'commit'].includes(args[0])));
  assert.deepEqual(await fs.readdir(f.root), []);
});

test('reconnecting preserves an existing custom branch; moving repositories preserves the workspace identity', async t => {
  const f = await discoveryFixture(t);
  f.git(['--git-dir='+f.remote, 'branch', 'release']);
  const result = await f.connect('https://github.com/synthetic/files', {...f.binding, branch:'release'});
  assert.equal(result.branch, 'release');
  const moved = await f.connect('https://github.com/synthetic/new-files.git', f.binding);
  assert.equal(moved.workspaceId, f.binding.workspaceId);
  await assert.rejects(f.connect(f.binding.url, {...f.binding,workspaceId:'another'}), /资料空间/);
  assert.deepEqual(await fs.readdir(f.root), []);
});

test('missing, invalid and symbolic-link manifests fail before saving and clean up discovery files', async t => {
  const f = await discoveryFixture(t);
  for (const kind of ['missing', 'invalid', 'symlink']) {
    const file = path.join(f.work, 'acceptcat-library.json');
    if (kind === 'missing') await fs.rm(file);
    else if (kind === 'invalid') await fs.writeFile(file, '{broken');
    else {
      const blob = f.git(['hash-object', '-w', '--stdin'], {input:Buffer.from('README.md')}).toString().trim();
      f.git(['update-index','--add','--cacheinfo',`120000,${blob},acceptcat-library.json`]);
    }
    if (kind !== 'symlink') f.git(['add', '-A']);
    f.git(['commit', '-m', 'Synthetic '+kind]);
    f.git(['push', f.remote, 'main']);
    await assert.rejects(f.connect(f.binding.url), /资料清单/);
    assert.deepEqual(await fs.readdir(f.root), []);
  }
});

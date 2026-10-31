import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relocatedMyWorkspace, relocatedWorkspace } from '../src/research/workspace-navigation.ts';

function target(path) { return new URL(path, 'https://synthetic.example.test'); }

test('saved My Agents links select the same Agent in the directory instead of opening a duplicate page', () => {
  for (const relocate of [relocatedMyWorkspace, relocatedWorkspace]) {
    const result = target(relocate(new URLSearchParams({ view: 'agents', agent: 'agent-synthetic-A' })));
    assert.equal(result.pathname, '/contact');
    assert.equal(result.searchParams.get('kind'), 'agents');
    assert.equal(result.searchParams.get('contact'), 'agent-synthetic-A');
    assert.equal(result.searchParams.has('agent'), false);
    assert.equal(result.searchParams.has('view'), false);
  }
});

test('saved private skill and catalog links retain their exact target/revision selection in the directory', () => {
  for (const relocate of [relocatedMyWorkspace, relocatedWorkspace]) {
    for (const view of ['agents', 'skills']) {
      const result = target(relocate(new URLSearchParams({ view, panel: 'skills', agent: 'agent-A', skill: 'skill-B', catalog: 'catalog-C' })));
      for (const [key, value] of Object.entries({ kind: 'agents', panel: 'skills', agent: 'agent-A', skill: 'skill-B', catalog: 'catalog-C' }))
        assert.equal(result.searchParams.get(key), value);
      assert.equal(result.searchParams.has('contact'), false);
      assert.equal(result.searchParams.has('view'), false);
    }
  }
  assert.equal(target(relocatedMyWorkspace(new URLSearchParams('view=skills'))).searchParams.get('panel'), 'skills');
});

test('other personal settings and relocated material/task routes retain their destinations', () => {
  for (const view of ['profile', 'labs', 'capabilities', 'models', 'memory', 'preferences', 'version'])
    assert.equal(relocatedMyWorkspace(new URLSearchParams({ view })), undefined);
  assert.equal(relocatedWorkspace(new URLSearchParams('view=capabilities')), '/me?view=capabilities');
  assert.equal(relocatedWorkspace(new URLSearchParams('view=reports')), '/library?panel=reports');
  assert.equal(relocatedWorkspace(new URLSearchParams('view=library')), '/library');
  assert.equal(relocatedWorkspace(new URLSearchParams('view=scheduled')), '/workbench?view=tasks');
});

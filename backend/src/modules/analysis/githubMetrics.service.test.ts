import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubMetricsService } from './githubMetrics.service.ts';

const service = new GitHubMetricsService();

test('parses HTTPS GitHub repository URLs', () => {
  assert.deepEqual(service.parseRepositoryUrl('https://github.com/openai/openai-node'), {
    owner: 'openai',
    repo: 'openai-node',
  });
});

test('strips .git from HTTPS GitHub repository URLs', () => {
  assert.deepEqual(service.parseRepositoryUrl('https://github.com/openai/openai-node.git'), {
    owner: 'openai',
    repo: 'openai-node',
  });
});

test('parses GitHub SSH repository URLs', () => {
  assert.deepEqual(service.parseRepositoryUrl('git@github.com:openai/openai-node.git'), {
    owner: 'openai',
    repo: 'openai-node',
  });
});

test('rejects non-GitHub remotes', () => {
  assert.equal(service.parseRepositoryUrl('https://gitlab.com/openai/openai-node'), null);
  assert.equal(service.parseRepositoryUrl('not-a-url'), null);
});

test('replaces a truncated subtree and counts logical paths separately from blob IDs', async (t) => {
  const head = 'a'.repeat(40);
  const root = 'b'.repeat(40);
  const directory = 'c'.repeat(40);
  const child = 'd'.repeat(40);
  const blob = { type: 'blob', sha: 'e'.repeat(40), size: 5 };
  const base = '/repos/owner/repo';
  const tree = (sha: string, entries: unknown[], truncated = false) => ({ sha, tree: entries, truncated });
  const responses = new Map<string, unknown>([
    [base, { size: 7 }],
    [`${base}/git/commits/${head}`, { sha: head, tree: { sha: root } }],
    [`${base}/git/trees/${root}`, tree(root, [{ ...blob, path: 'README' }, { type: 'tree', sha: directory, path: 'dir' }])],
    [`${base}/git/trees/${directory}?recursive=1`, tree(directory, [{ ...blob, path: 'duplicate' }], true)],
    [`${base}/git/trees/${directory}`, tree(directory, [{ ...blob, path: 'duplicate' }, { type: 'tree', sha: child, path: 'child' }])],
    [`${base}/git/trees/${child}?recursive=1`, tree(child, [{ ...blob, sha: 'f'.repeat(40), path: 'other', size: 3 }])],
  ]);
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    const response = responses.get(url.replace('https://api.github.com', ''));
    assert.ok(response, `Unexpected GitHub request ${url}`);
    return Response.json(response);
  });

  const snapshot = await service.collectCheckoutSnapshot('https://github.com/owner/repo', head, true);
  assert.equal(snapshot.repositoryBytes, 7 * 1024);
  assert.equal(snapshot.rootBytes, 5);
  assert.equal(snapshot.fullBytes, 13);
  assert.deepEqual(snapshot.fullBlobs, [blob.sha, 'f'.repeat(40)]);
});

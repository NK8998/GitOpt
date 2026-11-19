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

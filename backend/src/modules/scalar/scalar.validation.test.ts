import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  buildManagedWorkspacePath,
  sanitizeCommandOutput,
  validateScalarRepositoryUrl,
  workspaceRoot,
} from './scalar.validation.ts';

test('accepts HTTPS GitHub repository URLs', () => {
  const parsed = validateScalarRepositoryUrl('https://github.com/openai/openai-node.git');
  assert.equal(parsed.hostname, 'github.com');
});

test('rejects non-GitHub and non-HTTPS repository URLs', () => {
  assert.throws(() => validateScalarRepositoryUrl('https://gitlab.com/example/repo'));
  assert.throws(() => validateScalarRepositoryUrl('ssh://git@github.com/example/repo'));
});

test('builds managed workspaces beneath the configured root', () => {
  const target = buildManagedWorkspacePath(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222'
  );
  const root = workspaceRoot();
  assert.equal(target.startsWith(root + path.sep), true);
});

test('sanitizes embedded HTTPS credentials from command output', () => {
  const value = sanitizeCommandOutput(
    'fatal: https://token-user:secret-value@github.com/example/repo.git failed'
  );
  assert.equal(value.includes('secret-value'), false);
  assert.equal(value.includes('https://***:***@github.com'), true);
});

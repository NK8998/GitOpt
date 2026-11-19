import test from 'node:test';
import assert from 'node:assert/strict';
import { DeterministicRulesEngine } from './rules.engine.ts';

test('CI/CD Workload: triggers Shallow Clone when commit_count > 500', () => {
  const engine = new DeterministicRulesEngine();
  const results = engine.evaluate({
    workloadSlug: 'ci_cd',
    repositoryUrl: 'https://github.com/org/repo.git',
    repositoryName: 'repo',
    metrics: {
      repo_size_mb: 150,
      commit_count: 750,
      file_count: 800,
      large_file_count: 0,
    },
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].title, 'Shallow Clone (--depth 1)');
  assert.equal(results[0].category, 'clone');
  assert.equal(results[0].severity, 'high');
  assert.ok(results[0].relevanceScore >= 0.8);
  assert.match(results[0].templates[0].content, /git clone --depth 1/);
});

test('CI/CD Workload: triggers Blobless Partial Clone when repo_size_mb > 200 and commit_count <= 500', () => {
  const engine = new DeterministicRulesEngine();
  const results = engine.evaluate({
    workloadSlug: 'ci_cd',
    repositoryUrl: 'https://github.com/org/heavy-assets.git',
    repositoryName: 'heavy-assets',
    metrics: {
      repo_size_mb: 350,
      commit_count: 250,
      file_count: 1200,
      large_file_count: 3,
    },
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].title, 'Blobless Partial Clone (--filter=blob:none)');
  assert.equal(results[0].category, 'clone');
  assert.ok(results[0].relevanceScore >= 0.8);
  assert.match(results[0].templates[0].content, /--filter=blob:none/);
});

test('Monorepo Workload: triggers Sparse Checkout when file_count > 10,000', () => {
  const engine = new DeterministicRulesEngine();
  const results = engine.evaluate({
    workloadSlug: 'monorepo',
    repositoryUrl: 'https://github.com/org/massive-monorepo.git',
    repositoryName: 'massive-monorepo',
    metrics: {
      repo_size_mb: 600,
      commit_count: 3000,
      file_count: 15000,
      large_file_count: 1,
    },
  });

  const sparse = results.find((r) => r.title === 'Sparse Checkout');
  assert.ok(sparse, 'Expected Sparse Checkout recommendation');
  assert.equal(sparse.category, 'checkout');
  assert.equal(sparse.severity, 'critical');
  assert.match(sparse.templates[0].content, /git sparse-checkout init --cone/);
});

test('Monorepo Workload: triggers Treeless Partial Clone when repo_size_mb > 1000', () => {
  const engine = new DeterministicRulesEngine();
  const results = engine.evaluate({
    workloadSlug: 'monorepo',
    repositoryUrl: 'https://github.com/org/huge-monorepo.git',
    repositoryName: 'huge-monorepo',
    metrics: {
      repo_size_mb: 2400,
      commit_count: 20000,
      file_count: 25000,
      large_file_count: 4,
    },
  });

  const treeless = results.find((r) => r.title.includes('Treeless Partial Clone'));
  assert.ok(treeless, 'Expected Treeless Partial Clone recommendation');
  assert.equal(treeless.category, 'clone');
  assert.match(treeless.templates[0].content, /--filter=tree:0/);

  const sparse = results.find((r) => r.title === 'Sparse Checkout');
  assert.ok(sparse, 'Expected Sparse Checkout since file_count > 10,000');
});

test('Local Dev Workload: triggers Blobless Clone when repo_size_mb > 500', () => {
  const engine = new DeterministicRulesEngine();
  const results = engine.evaluate({
    workloadSlug: 'local_dev',
    repositoryUrl: 'https://github.com/org/big-project.git',
    repositoryName: 'big-project',
    metrics: {
      repo_size_mb: 850,
      commit_count: 1500,
      file_count: 8000,
      large_file_count: 0,
    },
  });

  const blobless = results.find((r) => r.title.includes('Blobless Partial Clone'));
  assert.ok(blobless, 'Expected Blobless Partial Clone');
  assert.match(blobless.templates[0].content, /--filter=blob:none/);
});

test('Local Dev Workload: triggers FSMonitor when file_count > 20,000', () => {
  const engine = new DeterministicRulesEngine();
  const results = engine.evaluate({
    workloadSlug: 'local_dev',
    repositoryUrl: 'https://github.com/org/huge-codebase.git',
    repositoryName: 'huge-codebase',
    metrics: {
      repo_size_mb: 450,
      commit_count: 4000,
      file_count: 32000,
      large_file_count: 1,
    },
  });

  const fsmonitor = results.find((r) => r.title.includes('FS Monitor'));
  assert.ok(fsmonitor, 'Expected FSMonitor recommendation');
  assert.equal(fsmonitor.category, 'filesystem');
  assert.match(fsmonitor.templates[0].content, /git config core\.fsmonitor true/);
});

test('Non-matching scenario produces empty recommendations list', () => {
  const engine = new DeterministicRulesEngine();
  const results = engine.evaluate({
    workloadSlug: 'local_dev',
    repositoryUrl: 'https://github.com/org/small-lib.git',
    repositoryName: 'small-lib',
    metrics: {
      repo_size_mb: 40,
      commit_count: 120,
      file_count: 450,
      large_file_count: 0,
    },
  });

  assert.equal(results.length, 0);
});

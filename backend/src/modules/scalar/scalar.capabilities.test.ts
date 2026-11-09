import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CapabilityCommandRunner,
  CommandExecutionResult,
  ScalarCapabilitiesService,
} from './scalar.capabilities.ts';

function ok(stdout = '', stderr = ''): CommandExecutionResult {
  return { ok: true, stdout, stderr, exitCode: 0 };
}

function failed(errorCode = 'ENOENT'): CommandExecutionResult {
  return {
    ok: false,
    stdout: '',
    stderr: '',
    exitCode: null,
    errorCode,
  };
}

class FakeRunner implements CapabilityCommandRunner {
  constructor(
    private readonly responses: Record<string, CommandExecutionResult>
  ) {}

  async run(command: string, args: string[]): Promise<CommandExecutionResult> {
    return this.responses[[command, ...args].join(' ')] ?? failed('ENOENT');
  }
}

function supportedRunner(overrides: Record<string, CommandExecutionResult> = {}) {
  return new FakeRunner({
    'git --version': ok('git version 2.53.0'),
    'scalar version': ok('git version 2.53.0'),
    'scalar -h': ok(
      'usage: scalar <command>\nclone\nlist\nregister\nunregister\nrun\nreconfigure\ndiagnose\ndelete'
    ),
    'scalar clone -h': ok(
      'usage: scalar clone [--[no-]src] [--[no-]maintenance] <url> [<enlistment>]'
    ),
    'git help -a': ok('maintenance\nmulti-pack-index\nsparse-checkout'),
    ...overrides,
  });
}

test('detects a supported Git Scalar installation', async () => {
  const service = new ScalarCapabilitiesService(supportedRunner());
  const result = await service.detect();

  assert.equal(result.supported, true);
  assert.equal(result.git.available, true);
  assert.equal(result.git.version, '2.53.0');
  assert.equal(result.scalar.available, true);
  assert.equal(result.scalar.implementation, 'git-scalar');
  assert.equal(result.scalar.version, '2.53.0');
  assert.equal(result.commands.scalar_clone, true);
  assert.equal(result.commands.git_maintenance, true);
  assert.equal(result.commands.git_multi_pack_index, true);
  assert.equal(result.clone_options.no_maintenance, true);
  assert.equal(result.clone_options.no_src, true);
});

test('does not invent --no-prefetch support', async () => {
  const service = new ScalarCapabilitiesService(supportedRunner());
  const result = await service.detect();

  assert.equal(result.clone_options.no_prefetch, false);
  assert.ok(result.warnings.some((warning) => warning.includes('--no-prefetch')));
});

test('rejects an unrelated scalar executable', async () => {
  const service = new ScalarCapabilitiesService(
    supportedRunner({
      'scalar version': ok('Scalar CLI 1.0.0'),
      'scalar -h': ok('document\nproject\nregistry'),
      'scalar clone -h': ok('unknown command'),
    })
  );
  const result = await service.detect();

  assert.equal(result.scalar.executable_available, true);
  assert.equal(result.scalar.available, false);
  assert.equal(result.scalar.implementation, 'unknown');
  assert.equal(result.supported, false);
  assert.ok(
    result.warnings.some((warning) =>
      warning.includes('not the Git Scalar large-repository tool')
    )
  );
});

test('reports a missing Scalar installation without failing the request', async () => {
  const service = new ScalarCapabilitiesService(
    supportedRunner({
      'scalar version': failed('ENOENT'),
    })
  );
  const result = await service.detect();

  assert.equal(result.scalar.executable_available, false);
  assert.equal(result.scalar.available, false);
  assert.equal(result.scalar.implementation, 'missing');
  assert.equal(result.supported, false);
  assert.ok(result.warnings.some((warning) => warning.includes('not installed')));
});

test('marks Ultra-Large mode unsupported when required Git commands are missing', async () => {
  const service = new ScalarCapabilitiesService(
    supportedRunner({
      'git help -a': ok('maintenance\nsparse-checkout'),
    })
  );
  const result = await service.detect();

  assert.equal(result.commands.git_multi_pack_index, false);
  assert.equal(result.supported, false);
});

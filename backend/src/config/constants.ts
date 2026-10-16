export const RULE_THRESHOLDS = {
  // CI/CD Workload
  CI_CD_SHALLOW_CLONE_COMMIT_THRESHOLD: 500,
  CI_CD_PARTIAL_CLONE_SIZE_MB: 200,

  // Monorepo Workload
  MONOREPO_SPARSE_CHECKOUT_FILE_COUNT: 10000,
  MONOREPO_TREELESS_CLONE_SIZE_MB: 1000,

  // Local Dev Workload
  LOCAL_DEV_PARTIAL_CLONE_SIZE_MB: 500,
  LOCAL_DEV_FSMONITOR_FILE_COUNT: 20000,

  // Large file warning
  LARGE_FILE_THRESHOLD_COUNT: 5,
} as const;

export const WORKLOAD_PROFILES_SEED = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'local_dev' as const,
    name: 'Local Development Workflow',
    description:
      'Engineers actively editing, branching, and running git log/status daily on local machines.',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    slug: 'ci_cd' as const,
    name: 'CI/CD or Short-Lived Build Pipeline',
    description:
      'Ephemeral worker nodes, automated test runners, and build containers requiring ultra-fast checkout.',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    slug: 'monorepo' as const,
    name: 'Large Monorepo Active Development',
    description:
      'Massive codebases with tens of thousands of files across multiple services and teams.',
  },
];

export const INITIAL_RECOMMENDATIONS_SEED = [
  {
    id: 'aaaa1111-1111-1111-1111-111111111111',
    title: 'Shallow Clone (--depth 1)',
    category: 'clone' as const,
    severity: 'high' as const,
    description:
      'Truncates commit history to only the tip of the target branch, avoiding downloading gigabytes of historical delta objects.',
    template: {
      id: 't1111111-1111-1111-1111-111111111111',
      title: 'Git Shallow Clone Execution',
      content: 'git clone --depth 1 <repository_url>',
      format: 'shell' as const,
    },
  },
  {
    id: 'aaaa2222-2222-2222-2222-222222222222',
    title: 'Blobless Partial Clone (--filter=blob:none)',
    category: 'clone' as const,
    severity: 'high' as const,
    description:
      'Clones all commits and trees without downloading file blob contents until explicit checkout or viewing, drastically speeding up clone times.',
    template: {
      id: 't2222222-2222-2222-2222-222222222222',
      title: 'Git Blobless Partial Clone Execution',
      content: 'git clone --filter=blob:none <repository_url>',
      format: 'shell' as const,
    },
  },
  {
    id: 'aaaa3333-3333-3333-3333-333333333333',
    title: 'Sparse Checkout',
    category: 'checkout' as const,
    severity: 'critical' as const,
    description:
      'Restricts the working tree to only specified folders using cone mode, dramatically lowering file count and status/index latency.',
    template: {
      id: 't3333333-3333-3333-3333-333333333333',
      title: 'Cone-Mode Sparse Checkout Commands',
      content: 'git sparse-checkout init --cone && git sparse-checkout set <directory_path>',
      format: 'shell' as const,
    },
  },
  {
    id: 'aaaa4444-4444-4444-4444-444444444444',
    title: 'Treeless Partial Clone (--filter=tree:0)',
    category: 'clone' as const,
    severity: 'high' as const,
    description:
      'Clones commit objects without trees or blobs. Trees and blobs are fetched on-demand during checkout, ideal for deep history analysis across huge monorepos.',
    template: {
      id: 't4444444-4444-4444-4444-444444444444',
      title: 'Git Treeless Partial Clone Execution',
      content: 'git clone --filter=tree:0 <repository_url>',
      format: 'shell' as const,
    },
  },
  {
    id: 'aaaa5555-5555-5555-5555-555555555555',
    title: 'Git Maintenance & FS Monitor',
    category: 'filesystem' as const,
    severity: 'medium' as const,
    description:
      'Enables the background filesystem monitor daemon (Watchman / built-in FSMonitor) to track filesystem alterations without scanning tens of thousands of files on every git status.',
    template: {
      id: 't5555555-5555-5555-5555-555555555555',
      title: 'Enable Git FSMonitor Configuration',
      content: 'git config core.fsmonitor true && git maintenance start',
      format: 'shell' as const,
    },
  },
];

export interface WorkloadProfile {
  id: string;
  slug: 'local_dev' | 'ci_cd' | 'monorepo';
  name: string;
  description: string;
}

export interface MetricItem {
  id?: string;
  analysis_id: string;
  metric_type: string;
  metric_value: number;
  unit: string;
}

export interface ObjectDistribution {
  blobs_mb: number;
  trees_mb: number;
  commits_mb: number;
  tags_mb: number;
}

export interface LargestObjectItem {
  name: string;
  size_mb: number;
  type: string;
  path: string;
}

export interface RepositoryItem {
  id: string;
  user_id: string;
  workload_id: string;
  name: string;
  source: string;
  url_path: string;
  created_at: string;
  workload?: WorkloadProfile;
}

export interface AnalysisItem {
  id: string;
  repository_id: string;
  status: 'pending' | 'analyzing' | 'completed' | 'failed';
  duration_ms: number | null;
  optimization_score?: number;
  current_stage?: string;
  progress_percent?: number;
  created_at: string;
  metrics?: MetricItem[];
  object_distribution?: ObjectDistribution;
  largest_objects?: LargestObjectItem[];
  repository?: RepositoryItem;
  metric_source?: 'github_api' | 'git_cli' | 'simulated';
  metric_notes?: string[];
  default_branch?: string;
  tree_truncated?: boolean;
}

export interface ImpactEstimate {
  metric_name: string;
  current_value: string;
  optimized_value: string;
  time_current?: string;
  time_optimized?: string;
  is_measured?: boolean;
}

export interface TemplateItem {
  id: string;
  recommendation_id: string;
  title: string;
  content: string;
  format: 'shell' | 'gitconfig';
}

export interface RecommendationItem {
  recommendation_id: string;
  title: string;
  category: string;
  severity: string;
  relevance_score: number;
  reasoning: string;
  description: string;
  why_recommended?: string;
  advantages?: string[];
  tradeoffs?: string[];
  git_mechanism?: string;
  impact_estimate?: ImpactEstimate;
  templates: TemplateItem[];
}


export interface ScalarCapabilities {
  supported: boolean;
  checked_at: string;
  git: {
    available: boolean;
    version: string | null;
    raw_version: string | null;
  };
  scalar: {
    executable_available: boolean;
    available: boolean;
    implementation: 'git-scalar' | 'unknown' | 'missing';
    version: string | null;
    raw_version: string | null;
  };
  commands: {
    scalar_clone: boolean;
    scalar_list: boolean;
    scalar_register: boolean;
    scalar_run: boolean;
    git_maintenance: boolean;
    git_multi_pack_index: boolean;
    git_sparse_checkout: boolean;
  };
  clone_options: {
    no_maintenance: boolean;
    no_prefetch: boolean;
    no_src: boolean;
    single_branch: boolean;
    no_tags: boolean;
    full_clone: boolean;
  };
  features: {
    scalar_partial_clone_defaults: boolean;
    scalar_sparse_checkout_defaults: boolean;
    fsmonitor_verification: 'requires_repository';
  };
  warnings: string[];
}

export interface ScalarOperationItem {
  id: string;
  enlistment_id: string;
  operation_type: 'clone' | 'maintenance_start' | 'midx_write' | 'midx_verify';
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at: string | null;
  completed_at: string | null;
  exit_code: number | null;
  output: string | null;
  error_message: string | null;
  created_at: string;
}

export interface ScalarEnlistmentItem {
  id: string;
  repository_id: string;
  user_id: string;
  workspace_path: string;
  worktree_path: string | null;
  clone_mode: string;
  checkout_scope: ScalarCheckoutScope;
  setup_status: 'running' | 'completed' | 'failed' | null;
  head_commit: string | null;
  git_bytes: number | null;
  worktree_bytes: number | null;
  status: 'pending' | 'cloning' | 'ready' | 'optimizing' | 'optimized' | 'failed';
  scalar_version: string | null;
  git_version: string | null;
  maintenance_enabled: boolean;
  midx_written: boolean;
  midx_verified: boolean;
  fsmonitor_enabled: boolean | null;
  partial_clone_enabled: boolean | null;
  sparse_checkout_enabled: boolean | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  operations: ScalarOperationItem[];
}

export type ScalarCheckoutScope = 'root' | 'full';

export interface UltraLargeComparison {
  network_mbps: number;
  repository: string;
  branch: string;
  head_commit: string;
  tree_sha: string;
  collected_at: string;
  git_version: string;
  provenance: Record<string, { source: string; git_version?: string; collected_at?: string }>;
  repository_bytes: number;
  history_pack_bytes: number | null;
  full_clone_pack_bytes: number | null;
  full_clone_transfer_seconds: number | null;
  scopes: {
    scope: ScalarCheckoutScope;
    logical_checkout_bytes: number;
    checkout_pack_bytes: number | null;
    checkout_transfer_seconds: number | null;
    partial_transfer_seconds: number | null;
  }[];
}

export interface BenchmarkStrategy {
  strategy: string;
  time: string;
  transfer: string;
  disk: string;
  relative_percent: number;
  is_best: boolean;
}

export interface BenchmarkComparison {
  analysis_id: string;
  best_strategy: string;
  estimated_time_saved: string;
  percent_faster: number;
  is_estimated: boolean;
  methodology: string;
  ultra_large?: UltraLargeComparison;
  strategies: BenchmarkStrategy[];
  chart_series: {
    clone_time_min: number[];
    data_transferred_gb: number[];
    disk_usage_gb: number[];
    labels: string[];
  };
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(endpoint, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.message || `Request failed with status ${res.status}`);
  }

  const json = await res.json();
  return json.data !== undefined ? json.data : json;
}

export const api = {
  getWorkloads: async (): Promise<WorkloadProfile[]> => {
    return request<WorkloadProfile[]>('/api/v1/workloads');
  },

  createRepository: async (data: {
    url_path: string;
    workload_id: string;
    name?: string;
    source?: string;
  }): Promise<RepositoryItem> => {
    let name = data.name;
    if (!name) {
      const parts = data.url_path.replace(/\/+$/, '').replace(/\.git$/, '').split('/');
      name = parts.slice(-2).join('/') || 'repository';
    }
    return request<RepositoryItem>('/api/v1/repositories', {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        name,
        source: data.source || 'github',
      }),
    });
  },

  startAnalysis: async (data: {
    repository_id: string;
    advanced_options?: Record<string, boolean>;
  }): Promise<AnalysisItem> => {
    return request<AnalysisItem>('/api/v1/analyses', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getAnalysis: async (id: string): Promise<AnalysisItem> => {
    return request<AnalysisItem>(`/api/v1/analyses/${id}`);
  },

  getAllAnalyses: async (): Promise<AnalysisItem[]> => {
    return request<AnalysisItem[]>('/api/v1/analyses');
  },

  getRecommendations: async (analysisId: string): Promise<RecommendationItem[]> => {
    return request<RecommendationItem[]>(`/api/v1/analyses/${analysisId}/recommendations`);
  },

  getRecommendation: async (id: string): Promise<RecommendationItem> => {
    return request<RecommendationItem>(`/api/v1/recommendations/${id}`);
  },

  getTemplates: async (recommendationId: string): Promise<TemplateItem[]> => {
    return request<TemplateItem[]>(`/api/v1/recommendations/${recommendationId}/templates`);
  },

  getBenchmarks: async (analysisId: string, ultraLarge = false): Promise<BenchmarkComparison> => {
    const mode = ultraLarge ? '?mode=ultra-large' : '';
    return request<BenchmarkComparison>(`/api/v1/analyses/${analysisId}/benchmarks${mode}`);
  },

  getScalarCapabilities: async (): Promise<ScalarCapabilities> => {
    return request<ScalarCapabilities>('/api/v1/scalar/capabilities');
  },

  createScalarEnlistment: async (repositoryId: string, checkoutScope: ScalarCheckoutScope = 'root'): Promise<ScalarEnlistmentItem> => {
    return request<ScalarEnlistmentItem>('/api/v1/scalar/enlistments', {
      method: 'POST',
      body: JSON.stringify({ repository_id: repositoryId, checkout_scope: checkoutScope }),
    });
  },

  getScalarEnlistment: async (id: string): Promise<ScalarEnlistmentItem> => {
    return request<ScalarEnlistmentItem>(`/api/v1/scalar/enlistments/${id}`);
  },

  getRepositoryScalarEnlistments: async (repositoryId: string): Promise<ScalarEnlistmentItem[]> => {
    return request<ScalarEnlistmentItem[]>(`/api/v1/scalar/repositories/${repositoryId}/enlistments`);
  },

  startScalarMaintenance: async (id: string): Promise<ScalarOperationItem> => {
    return request<ScalarOperationItem>(`/api/v1/scalar/enlistments/${id}/maintenance`, {
      method: 'POST',
    });
  },

  optimizeScalarMidx: async (id: string): Promise<ScalarOperationItem> => {
    return request<ScalarOperationItem>(`/api/v1/scalar/enlistments/${id}/midx`, {
      method: 'POST',
    });
  },

  runBenchmarks: async (analysisId: string): Promise<BenchmarkComparison> => {
    return request<BenchmarkComparison>('/api/v1/benchmarks', {
      method: 'POST',
      body: JSON.stringify({ analysis_id: analysisId }),
    });
  },
};

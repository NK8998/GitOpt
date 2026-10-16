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

  getBenchmarks: async (analysisId: string): Promise<BenchmarkComparison> => {
    return request<BenchmarkComparison>(`/api/v1/analyses/${analysisId}/benchmarks`);
  },

  runBenchmarks: async (analysisId: string): Promise<BenchmarkComparison> => {
    return request<BenchmarkComparison>('/api/v1/benchmarks', {
      method: 'POST',
      body: JSON.stringify({ analysis_id: analysisId }),
    });
  },
};

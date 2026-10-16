export type MetricUnit = 'MB' | 'count' | 'ms' | 'seconds' | 'minutes' | 'percentage';

export type MetricType =
  | 'repo_size_mb'
  | 'commit_count'
  | 'file_count'
  | 'large_file_count'
  | 'branch_count'
  | 'git_objects_count'
  | 'packfile_size_mb'
  | 'history_depth'
  | 'largest_object_mb'
  | 'estimated_clone_min'
  | 'current_tree_blob_mb';

export interface MetricDTO {
  id?: string;
  analysis_id: string;
  metric_type: MetricType | string;
  metric_value: number;
  unit: MetricUnit | string;
}

export interface ExtractedMetrics {
  repo_size_mb: number;
  commit_count: number;
  file_count: number;
  large_file_count: number;
  branch_count?: number;
  git_objects_count?: number;
  largest_object_mb?: number;
  largest_object_path?: string;
  estimated_clone_min?: number;
  current_tree_blob_mb?: number;
  growth_trend_percent?: number;
  [key: string]: any;
}

export interface ObjectDistribution {
  blobs_mb: number;
  trees_mb: number;
  commits_mb: number;
  tags_mb: number;
}

export interface LargestObjectInfo {
  name: string;
  size_mb: number;
  type: string;
  path: string;
}

export type AnalysisStatus = 'pending' | 'analyzing' | 'completed' | 'failed';
export type MetricSource = 'github_api' | 'git_cli' | 'simulated';

export interface AnalysisRecord {
  id: string;
  repository_id: string;
  status: AnalysisStatus;
  duration_ms: number | null;
  optimization_score?: number;
  current_stage?: string;
  progress_percent?: number;
  created_at: string;
  metrics?: MetricDTO[];
  object_distribution?: ObjectDistribution;
  largest_objects?: LargestObjectInfo[];
  repository?: RepositoryRecord;
  metric_source?: MetricSource;
  metric_notes?: string[];
  default_branch?: string;
  tree_truncated?: boolean;
  error_message?: string;
}

export type RepositorySource = 'github' | 'gitlab' | 'local';

export interface RepositoryRecord {
  id: string;
  user_id: string;
  workload_id: string;
  name: string;
  source: RepositorySource;
  url_path: string;
  created_at: string;
  workload?: WorkloadProfileRecord;
}

export interface WorkloadProfileRecord {
  id: string;
  slug: 'local_dev' | 'ci_cd' | 'monorepo';
  name: string;
  description: string;
}

export type MetricUnit = 'MB' | 'count' | 'ms' | 'seconds' | 'percentage';

export type MetricType =
  | 'repo_size_mb'
  | 'commit_count'
  | 'file_count'
  | 'large_file_count'
  | 'branch_count'
  | 'packfile_size_mb'
  | 'history_depth';

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
  [key: string]: number;
}

export type AnalysisStatus = 'pending' | 'analyzing' | 'completed' | 'failed';

export interface AnalysisRecord {
  id: string;
  repository_id: string;
  status: AnalysisStatus;
  duration_ms: number | null;
  created_at: string;
  metrics?: MetricDTO[];
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

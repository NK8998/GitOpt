export interface BenchmarkRecord {
  id: string;
  analysis_id: string;
  strategy: string;
  clone_time_sec: number;
  data_transferred_mb: number;
  disk_usage_mb: number;
  relative_percent: number;
  is_best: boolean;
  created_at: string;
}

export interface BenchmarkStrategyDTO {
  strategy: string;
  time: string;
  transfer: string;
  disk: string;
  relative_percent: number;
  is_best: boolean;
}

export interface BenchmarkComparisonDTO {
  analysis_id: string;
  best_strategy: string;
  estimated_time_saved: string;
  percent_faster: number;
  is_estimated: boolean;
  methodology: string;
  strategies: BenchmarkStrategyDTO[];
  chart_series: {
    clone_time_min: number[];
    data_transferred_gb: number[];
    disk_usage_gb: number[];
    labels: string[];
  };
  ultra_large?: UltraLargeComparisonDTO;
}

export interface UltraLargeComparisonDTO {
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
    scope: 'root' | 'full';
    logical_checkout_bytes: number;
    checkout_pack_bytes: number | null;
    checkout_transfer_seconds: number | null;
    partial_transfer_seconds: number | null;
  }[];
}

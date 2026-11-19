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
}

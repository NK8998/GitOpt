import { ExtractedMetrics } from './metrics';

export type WorkloadSlug = 'local_dev' | 'ci_cd' | 'monorepo';

export type RecommendationCategory =
  | 'clone'
  | 'checkout'
  | 'maintenance'
  | 'filesystem';

export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

export type TemplateFormat = 'shell' | 'gitconfig';

export interface TemplateRecord {
  id: string;
  recommendation_id: string;
  title: string;
  content: string;
  format: TemplateFormat;
}

export interface ImpactEstimate {
  metric_name: string;
  current_value: string;
  optimized_value: string;
  time_current?: string;
  time_optimized?: string;
  is_measured?: boolean;
}

export interface RecommendationRecord {
  id: string;
  title: string;
  category: RecommendationCategory;
  severity: SeverityLevel;
  description: string;
  why_recommended?: string;
  advantages?: string[];
  tradeoffs?: string[];
  git_mechanism?: string;
  impact_estimate?: ImpactEstimate;
  templates?: TemplateRecord[];
}

export interface RuleEvaluationContext {
  workloadSlug: WorkloadSlug;
  metrics: ExtractedMetrics;
  repositoryUrl: string;
  repositoryName: string;
}

export interface RuleEvaluationResult {
  ruleId: string;
  matched: boolean;
  title: string;
  category: RecommendationCategory;
  severity: SeverityLevel;
  relevanceScore: number;
  reasoning: string;
  description: string;
  why_recommended?: string;
  advantages?: string[];
  tradeoffs?: string[];
  git_mechanism?: string;
  impact_estimate?: ImpactEstimate;
  templates: Array<{
    title: string;
    content: string;
    format: TemplateFormat;
  }>;
}

export interface RuleDefinition {
  id: string;
  workload: WorkloadSlug;
  title: string;
  category: RecommendationCategory;
  severity: SeverityLevel;
  evaluate: (ctx: RuleEvaluationContext) => {
    matched: boolean;
    relevanceScore: number;
    reasoning: string;
    why_recommended?: string;
    advantages?: string[];
    tradeoffs?: string[];
    git_mechanism?: string;
    impact_estimate?: ImpactEstimate;
    customizedTemplates: Array<{
      title: string;
      content: string;
      format: TemplateFormat;
    }>;
  };
}

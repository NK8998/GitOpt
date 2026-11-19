import React, { useState, useEffect } from 'react';
import {
  GitBranch,
  Terminal,
  Zap,
  Layers,
  Database,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Play,
  Copy,
  Check,
  Shield,
  ArrowRight,
  Server,
  FolderTree,
  FileCode,
  HardDrive,
  RefreshCw,
  Sliders,
  ExternalLink,
  ChevronRight,
  Code2,
  Clock,
  Sparkles,
} from 'lucide-react';

interface Workload {
  id: string;
  slug: string;
  name: string;
  description: string;
}

interface Repository {
  id: string;
  name: string;
  source: string;
  url_path: string;
  workload_id: string;
  created_at: string;
  workload?: Workload;
}

interface Metric {
  id: string;
  metric_type: string;
  metric_value: number;
  unit: string;
}

interface Analysis {
  id: string;
  repository_id: string;
  status: string;
  duration_ms: number | null;
  created_at: string;
  metrics?: Metric[];
}

interface Recommendation {
  recommendation_id: string;
  title: string;
  category: string;
  severity: string;
  relevance_score: number;
  reasoning: string;
  description: string;
  templates: Array<{
    id?: string;
    title: string;
    content: string;
    format: string;
  }>;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'benchmarks' | 'api-explorer' | 'database' | 'architecture'>('benchmarks');
  const [workloads, setWorkloads] = useState<Workload[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>('');
  const [currentAnalysis, setCurrentAnalysis] = useState<Analysis | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [jwtToken, setJwtToken] = useState<string>('');
  const [dbStats, setDbStats] = useState<any>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // New Repository Form State
  const [newRepoName, setNewRepoName] = useState('react-monorepo-enterprise');
  const [newRepoUrl, setNewRepoUrl] = useState('https://github.com/facebook/react.git');
  const [newRepoSource, setNewRepoSource] = useState<'github' | 'gitlab' | 'local'>('github');
  const [newRepoWorkloadSlug, setNewRepoWorkloadSlug] = useState('monorepo');

  // Custom Metric Simulators
  const [customCommitCount, setCustomCommitCount] = useState<number>(1250);
  const [customRepoSizeMb, setCustomRepoSizeMb] = useState<number>(380);
  const [customFileCount, setCustomFileCount] = useState<number>(14500);

  // API Explorer State
  const [apiMethod, setApiMethod] = useState<'GET' | 'POST'>('GET');
  const [apiEndpoint, setApiEndpoint] = useState('/api/v1/workloads');
  const [apiPayload, setApiPayload] = useState('{}');
  const [apiResponse, setApiResponse] = useState<any>(null);
  const [apiLoading, setApiLoading] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const fetchInitialData = async () => {
    try {
      // 1. Fetch workloads
      const resWorkloads = await fetch('/api/v1/workloads');
      const dataWorkloads = await resWorkloads.json();
      if (dataWorkloads.data) {
        setWorkloads(dataWorkloads.data);
      }

      // 2. Fetch repositories
      const resRepos = await fetch('/api/v1/repositories');
      const dataRepos = await resRepos.json();
      if (dataRepos.data && dataRepos.data.length > 0) {
        setRepositories(dataRepos.data);
        setSelectedRepoId(dataRepos.data[0].id);
      }

      // 3. Fetch default JWT auth
      const authRes = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'developer@gitoptima.io',
          password: 'Password123!',
        }),
      });
      const authData = await authRes.json();
      if (authData.data?.token) {
        setJwtToken(authData.data.token);
      }

      // 4. Fetch Stats
      fetchDbStats();
    } catch (err) {
      console.error('Error fetching initial data:', err);
    }
  };

  const fetchDbStats = async () => {
    try {
      const res = await fetch('/api/v1/stats');
      const data = await res.json();
      setDbStats(data.data?.database_stats);
    } catch (e) {
      console.warn('Failed to fetch stats:', e);
    }
  };

  const handleRegisterRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const selectedWorkload = workloads.find((w) => w.slug === newRepoWorkloadSlug);
      if (!selectedWorkload) {
        showToast('Please select a valid workload profile', 'error');
        return;
      }

      const res = await fetch('/api/v1/repositories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
        },
        body: JSON.stringify({
          name: newRepoName,
          source: newRepoSource,
          url_path: newRepoUrl,
          workload_id: selectedWorkload.id,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        showToast(`Repository '${newRepoName}' registered successfully!`, 'success');
        setRepositories((prev) => [data.data, ...prev]);
        setSelectedRepoId(data.data.id);
        fetchDbStats();
      } else {
        showToast(data.message || 'Failed to register repository', 'error');
      }
    } catch (err) {
      showToast('Error registering repository', 'error');
    }
  };

  const handleTriggerAnalysis = async (metricsOverride?: {
    repo_size_mb?: number;
    commit_count?: number;
    file_count?: number;
  }) => {
    if (!selectedRepoId) {
      showToast('Please select or register a repository first', 'error');
      return;
    }

    setIsAnalyzing(true);
    setRecommendations([]);
    setCurrentAnalysis(null);

    try {
      const payload: any = {
        repository_id: selectedRepoId,
      };

      if (metricsOverride) {
        payload.simulated_metrics = metricsOverride;
      } else if (customCommitCount || customRepoSizeMb || customFileCount) {
        payload.simulated_metrics = {
          repo_size_mb: customRepoSizeMb,
          commit_count: customCommitCount,
          file_count: customFileCount,
        };
      }

      const res = await fetch('/api/v1/analyses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        setCurrentAnalysis(data.data);
        showToast(`Metric extraction completed in ${data.data.duration_ms}ms`, 'success');
        fetchDbStats();

        // Automatically run recommendation engine for seamless flow
        await handleRunEvaluation(data.data.id);
      } else {
        showToast(data.message || 'Analysis failed', 'error');
      }
    } catch (err) {
      showToast('Analysis request failed', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRunEvaluation = async (analysisId: string) => {
    setIsEvaluating(true);
    try {
      const res = await fetch(`/api/v1/recommendations/evaluate/${analysisId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
        },
      });

      const data = await res.json();
      if (res.ok) {
        setRecommendations(data.data || []);
        showToast(`Rule engine evaluated ${data.count} optimization recommendations!`, 'success');
        fetchDbStats();
      } else {
        showToast(data.message || 'Evaluation failed', 'error');
      }
    } catch (err) {
      showToast('Evaluation request failed', 'error');
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExecuteApiExplorer = async () => {
    setApiLoading(true);
    try {
      let body: any = undefined;
      if (apiMethod === 'POST') {
        try {
          body = JSON.parse(apiPayload);
        } catch {
          showToast('Invalid JSON in request payload', 'error');
          setApiLoading(false);
          return;
        }
      }

      const res = await fetch(apiEndpoint, {
        method: apiMethod,
        headers: {
          'Content-Type': 'application/json',
          ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
        },
        body: apiMethod === 'POST' ? JSON.stringify(body) : undefined,
      });

      const data = await res.json();
      setApiResponse({
        status: res.status,
        statusText: res.statusText,
        data,
      });
      fetchDbStats();
    } catch (e: any) {
      setApiResponse({
        error: e.message || 'Network error',
      });
    } finally {
      setApiLoading(false);
    }
  };

  // Quick Preset Scenarios for Week 4 Deterministic Rule Testing
  const applyPreset = async (preset: {
    workloadSlug: string;
    repoName: string;
    url: string;
    metrics: { repo_size_mb: number; commit_count: number; file_count: number };
    ruleTested: string;
  }) => {
    const targetWp = workloads.find((w) => w.slug === preset.workloadSlug);
    if (!targetWp) return;

    // Check if repo already exists or register
    let existing = repositories.find((r) => r.name === preset.repoName);
    if (!existing) {
      const res = await fetch('/api/v1/repositories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
        },
        body: JSON.stringify({
          name: preset.repoName,
          source: 'github',
          url_path: preset.url,
          workload_id: targetWp.id,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        existing = data.data;
        setRepositories((prev) => [data.data, ...prev]);
      }
    }

    if (existing) {
      setSelectedRepoId(existing.id);
      setCustomCommitCount(preset.metrics.commit_count);
      setCustomRepoSizeMb(preset.metrics.repo_size_mb);
      setCustomFileCount(preset.metrics.file_count);
      await handleTriggerAnalysis(preset.metrics);
    }
  };

  const selectedRepo = repositories.find((r) => r.id === selectedRepoId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-xl border text-sm backdrop-blur-md transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/40'
              : notification.type === 'error'
              ? 'bg-rose-950/90 text-rose-200 border-rose-500/40'
              : 'bg-indigo-950/90 text-indigo-200 border-indigo-500/40'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-400" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
              <GitBranch className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-bold text-base sm:text-lg tracking-tight text-white">GitOptima</span>
                <span className="hidden sm:inline-block text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                  Backend Engine v1.0
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 hidden md:block">
                Repository Performance Analytics &amp; Deterministic Rules Platform
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 overflow-x-auto max-w-full">
            <button
              onClick={() => setActiveTab('benchmarks')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-all shrink-0 ${
                activeTab === 'benchmarks'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Optimizer</span>
            </button>
            <button
              onClick={() => setActiveTab('api-explorer')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-all shrink-0 ${
                activeTab === 'api-explorer'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>API <span className="hidden sm:inline">Console</span></span>
            </button>
            <button
              onClick={() => setActiveTab('database')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-all shrink-0 ${
                activeTab === 'database'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>DDL</span>
            </button>
            <button
              onClick={() => setActiveTab('architecture')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-all shrink-0 ${
                activeTab === 'architecture'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Architecture</span>
              <span className="sm:hidden">Arch</span>
            </button>
          </nav>

          {/* User & Database Health */}
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-md bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>PostgreSQL Ready</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ========================================================================= */}
        {/* TAB 1: OPTIMIZER WORKBENCH & BENCHMARK LAB */}
        {/* ========================================================================= */}
        {activeTab === 'benchmarks' && (
          <div className="space-y-8">
            {/* Rule Engine Presets Banner */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 p-5 rounded-2xl border border-indigo-900/40 shadow-xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-indigo-300">
                      Deterministic Rules Benchmark Presets (Week 4 Scope)
                    </h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Click any test preset to automatically assign the workload profile, inject metrics, run analysis, and evaluate rules:
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() =>
                      applyPreset({
                        workloadSlug: 'ci_cd',
                        repoName: 'ci-pipeline-runner',
                        url: 'https://github.com/org/ci-pipeline.git',
                        metrics: { repo_size_mb: 180, commit_count: 850, file_count: 2400 },
                        ruleTested: 'Rule 1.1: Shallow Clone',
                      })
                    }
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-indigo-500 transition-all flex items-center gap-1.5"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <span>CI/CD: Shallow Clone (&gt;500 commits)</span>
                  </button>
                  <button
                    onClick={() =>
                      applyPreset({
                        workloadSlug: 'ci_cd',
                        repoName: 'ci-heavy-assets',
                        url: 'https://github.com/org/heavy-assets.git',
                        metrics: { repo_size_mb: 340, commit_count: 220, file_count: 1800 },
                        ruleTested: 'Rule 1.2: Blobless Partial Clone',
                      })
                    }
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-indigo-500 transition-all flex items-center gap-1.5"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    <span>CI/CD: Blobless Clone (&gt;200MB, &le;500)</span>
                  </button>
                  <button
                    onClick={() =>
                      applyPreset({
                        workloadSlug: 'monorepo',
                        repoName: 'mega-monorepo-services',
                        url: 'https://github.com/enterprise/mega-monorepo.git',
                        metrics: { repo_size_mb: 1450, commit_count: 15000, file_count: 26000 },
                        ruleTested: 'Rule 2.1 Sparse + Rule 2.2 Treeless',
                      })
                    }
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-indigo-500 transition-all flex items-center gap-1.5"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                    <span>Monorepo: Sparse (&gt;10k files) &amp; Treeless (&gt;1GB)</span>
                  </button>
                  <button
                    onClick={() =>
                      applyPreset({
                        workloadSlug: 'local_dev',
                        repoName: 'local-dev-core',
                        url: 'https://github.com/team/core-platform.git',
                        metrics: { repo_size_mb: 720, commit_count: 3200, file_count: 24000 },
                        ruleTested: 'Rule 3.1 Blobless + Rule 3.2 FSMonitor',
                      })
                    }
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-indigo-500 transition-all flex items-center gap-1.5"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>Local Dev: Blobless (&gt;500MB) &amp; FSMonitor (&gt;20k)</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Split Screen: Config & Trigger vs Analysis & Optimization */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Left Column: Repository & Workload Setup */}
              <div className="lg:col-span-5 space-y-6">
                {/* 1. Workload Profiles Cards */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-indigo-400" />
                      <span>Workload Profiles (`/api/v1/workloads`)</span>
                    </h3>
                    <span className="text-xs text-slate-500">{workloads.length} seeded</span>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5">
                    {workloads.map((wp) => (
                      <div
                        key={wp.id}
                        onClick={() => setNewRepoWorkloadSlug(wp.slug)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                          newRepoWorkloadSlug === wp.slug
                            ? 'bg-indigo-950/40 border-indigo-500/60 shadow-md ring-1 ring-indigo-500/40'
                            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-semibold text-indigo-300">
                            {wp.slug}
                          </span>
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">
                            UUID: {wp.id.slice(0, 8)}...
                          </span>
                        </div>
                        <h4 className="text-sm font-medium text-white mt-1">{wp.name}</h4>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          {wp.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Repository Selection & Registration Form */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                      <FolderTree className="w-4 h-4 text-indigo-400" />
                      <span>Registered Repositories (`/api/v1/repositories`)</span>
                    </h3>
                  </div>

                  {/* Repository Selector */}
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      Select Active Target Repository
                    </label>
                    <select
                      value={selectedRepoId}
                      onChange={(e) => setSelectedRepoId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      {repositories.map((repo) => (
                        <option key={repo.id} value={repo.id}>
                          {repo.name} ({repo.workload?.slug || repo.source})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Custom Metrics Tweaker for Benchmark Testing */}
                  <div className="pt-2 border-t border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-indigo-300 flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5" />
                        <span>Metric Threshold Inspector</span>
                      </label>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <span className="text-[10px] text-slate-400 block mb-1">Commit Count</span>
                        <input
                          type="number"
                          value={customCommitCount}
                          onChange={(e) => setCustomCommitCount(Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block mb-1">Repo Size (MB)</span>
                        <input
                          type="number"
                          value={customRepoSizeMb}
                          onChange={(e) => setCustomRepoSizeMb(Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block mb-1">File Count</span>
                        <input
                          type="number"
                          value={customFileCount}
                          onChange={(e) => setCustomFileCount(Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-3 flex gap-2">
                    <button
                      onClick={() => handleTriggerAnalysis()}
                      disabled={isAnalyzing}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-xs py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
                    >
                      {isAnalyzing ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Extracting Metrics...</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Run Analysis &amp; Evaluate</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Quick Register Collapsible */}
                  <details className="mt-4 pt-3 border-t border-slate-800 text-xs group">
                    <summary className="text-slate-400 hover:text-indigo-400 cursor-pointer font-medium list-none flex items-center justify-between">
                      <span>+ Register New Repository</span>
                      <ChevronRight className="w-3.5 h-3.5 group-open:rotate-90 transition-transform" />
                    </summary>
                    <form onSubmit={handleRegisterRepo} className="mt-3 space-y-3">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Repository Name</label>
                        <input
                          type="text"
                          value={newRepoName}
                          onChange={(e) => setNewRepoName(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Git URL or Path</label>
                        <input
                          type="text"
                          value={newRepoUrl}
                          onChange={(e) => setNewRepoUrl(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                          required
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Source</label>
                          <select
                            value={newRepoSource}
                            onChange={(e: any) => setNewRepoSource(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-white"
                          >
                            <option value="github">GitHub</option>
                            <option value="gitlab">GitLab</option>
                            <option value="local">Local Dir</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Workload</label>
                          <select
                            value={newRepoWorkloadSlug}
                            onChange={(e) => setNewRepoWorkloadSlug(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-white"
                          >
                            {workloads.map((wp) => (
                              <option key={wp.id} value={wp.slug}>
                                {wp.slug}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <button
                        type="submit"
                        className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 py-1.5 rounded text-xs font-medium transition-all"
                      >
                        Register in Database
                      </button>
                    </form>
                  </details>
                </div>
              </div>

              {/* Right Column: Analysis Results & Deterministic Recommendations */}
              <div className="lg:col-span-7 space-y-6">
                {/* 1. Analysis Status & Metrics Array */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <Code2 className="w-4 h-4 text-indigo-400" />
                      <h3 className="text-sm font-semibold text-slate-200">
                        Extracted Metrics (`/api/v1/analyses`)
                      </h3>
                    </div>
                    {currentAnalysis && (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          {currentAnalysis.status.toUpperCase()}
                        </span>
                        <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3" />
                          {currentAnalysis.duration_ms}ms
                        </span>
                      </div>
                    )}
                  </div>

                  {currentAnalysis ? (
                    <div className="mt-4 space-y-4">
                      {/* Metric Badges */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {currentAnalysis.metrics?.map((m) => (
                          <div
                            key={m.id || m.metric_type}
                            className="p-3 rounded-xl bg-slate-950/80 border border-slate-800"
                          >
                            <span className="text-[10px] text-slate-400 uppercase font-mono block">
                              {m.metric_type.replace(/_/g, ' ')}
                            </span>
                            <div className="mt-1 flex items-baseline gap-1">
                              <span className="text-xl font-bold font-mono text-white">
                                {m.metric_value.toLocaleString()}
                              </span>
                              <span className="text-[10px] text-indigo-400 font-mono">
                                {m.unit}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="text-[11px] text-slate-400 font-mono flex items-center justify-between px-1">
                        <span>Analysis UUID: {currentAnalysis.id}</span>
                        <span>Bound Workload: {selectedRepo?.workload?.slug || 'assigned'}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="py-10 text-center text-slate-500">
                      <Cpu className="w-8 h-8 mx-auto mb-2 opacity-40 text-indigo-400" />
                      <p className="text-xs">
                        Select a repository or preset and click "Run Analysis &amp; Evaluate" to extract Git metrics.
                      </p>
                    </div>
                  )}
                </div>

                {/* 2. Deterministic Rule Recommendations */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-400" />
                      <h3 className="text-sm font-semibold text-slate-200">
                        Deterministic Recommendations (`/api/v1/recommendations`)
                      </h3>
                    </div>
                    <span className="text-xs text-slate-400">
                      {recommendations.length} Matched Rules
                    </span>
                  </div>

                  {recommendations.length > 0 ? (
                    <div className="mt-4 space-y-4">
                      {recommendations.map((rec) => (
                        <div
                          key={rec.recommendation_id}
                          className="p-4 rounded-xl bg-slate-950/90 border border-slate-800/90 space-y-3"
                        >
                          {/* Header with Title, Category, Severity, Relevance Score */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-bold text-white">{rec.title}</h4>
                                <span
                                  className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded font-semibold ${
                                    rec.severity === 'critical'
                                      ? 'bg-rose-950 text-rose-300 border border-rose-500/30'
                                      : rec.severity === 'high'
                                      ? 'bg-amber-950 text-amber-300 border border-amber-500/30'
                                      : 'bg-indigo-950 text-indigo-300 border border-indigo-500/30'
                                  }`}
                                >
                                  {rec.severity}
                                </span>
                                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                  {rec.category}
                                </span>
                              </div>
                            </div>

                            {/* Relevance Score Bar */}
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-mono text-slate-400">Relevance:</span>
                              <div className="w-20 bg-slate-800 h-2 rounded-full overflow-hidden">
                                <div
                                  className="bg-indigo-500 h-full rounded-full"
                                  style={{ width: `${rec.relevance_score * 100}%` }}
                                />
                              </div>
                              <span className="text-xs font-mono font-bold text-indigo-300">
                                {Math.round(rec.relevance_score * 100)}%
                              </span>
                            </div>
                          </div>

                          {/* Rule Reasoning */}
                          <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                            <strong className="text-slate-100">Engineering Rationale: </strong>
                            {rec.reasoning}
                          </p>

                          {/* Templates / Commands */}
                          <div className="space-y-2">
                            {rec.templates.map((tpl, idx) => (
                              <div
                                key={tpl.id || idx}
                                className="bg-slate-900 rounded-lg p-3 border border-slate-800"
                              >
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
                                    <Terminal className="w-3 h-3 text-emerald-400" />
                                    <span>{tpl.title}</span>
                                    <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                                      {tpl.format}
                                    </span>
                                  </span>
                                  <button
                                    onClick={() => handleCopy(tpl.content, `${rec.recommendation_id}-${idx}`)}
                                    className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors flex items-center gap-1 text-[11px]"
                                    title="Copy Command"
                                  >
                                    {copiedId === `${rec.recommendation_id}-${idx}` ? (
                                      <>
                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                        <span className="text-emerald-400">Copied!</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3.5 h-3.5" />
                                        <span>Copy</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                                <pre className="text-xs font-mono text-emerald-300 bg-slate-950 p-2.5 rounded overflow-x-auto whitespace-pre-wrap">
                                  {tpl.content}
                                </pre>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-12 text-center text-slate-500">
                      <Zap className="w-8 h-8 mx-auto mb-2 opacity-40 text-amber-400" />
                      <p className="text-xs">
                        {isEvaluating
                          ? 'Evaluating deterministic rules engine...'
                          : 'No recommendations generated yet. Run an analysis above to trigger rule evaluation.'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: LIVE REST API CONSOLE */}
        {/* ========================================================================= */}
        {activeTab === 'api-explorer' && (
          <div className="space-y-6">
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Terminal className="w-5 h-5 text-indigo-400" />
                    <span>Interactive REST API Explorer</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Execute live HTTP requests against the modular Node.js/TypeScript backend router.
                  </p>
                </div>

                {/* Quick Endpoint Presets */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setApiMethod('GET');
                      setApiEndpoint('/api/v1/workloads');
                      setApiPayload('{}');
                    }}
                    className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-mono"
                  >
                    GET /workloads
                  </button>
                  <button
                    onClick={() => {
                      setApiMethod('GET');
                      setApiEndpoint('/api/v1/repositories');
                      setApiPayload('{}');
                    }}
                    className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-mono"
                  >
                    GET /repositories
                  </button>
                  <button
                    onClick={() => {
                      setApiMethod('GET');
                      setApiEndpoint('/api/v1/auth/me');
                      setApiPayload('{}');
                    }}
                    className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-mono"
                  >
                    GET /auth/me
                  </button>
                  <button
                    onClick={() => {
                      setApiMethod('POST');
                      setApiEndpoint('/api/v1/auth/login');
                      setApiPayload(
                        JSON.stringify(
                          {
                            email: 'developer@gitoptima.io',
                            password: 'Password123!',
                          },
                          null,
                          2
                        )
                      );
                    }}
                    className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-mono"
                  >
                    POST /auth/login
                  </button>
                </div>
              </div>

              {/* Endpoint Request Bar */}
              <div className="mt-5 space-y-4">
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={apiMethod}
                    onChange={(e: any) => setApiMethod(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono font-bold text-indigo-400 focus:outline-none"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                  </select>

                  <input
                    type="text"
                    value={apiEndpoint}
                    onChange={(e) => setApiEndpoint(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2 text-sm font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                    placeholder="/api/v1/..."
                  />

                  <button
                    onClick={handleExecuteApiExplorer}
                    disabled={apiLoading}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-5 py-2 rounded-lg font-medium text-sm flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-indigo-600/30"
                  >
                    {apiLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4 fill-current" />
                    )}
                    <span>Send Request</span>
                  </button>
                </div>

                {/* Payload Editor (for POST) */}
                {apiMethod === 'POST' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5 font-mono">
                      Request Body JSON:
                    </label>
                    <textarea
                      value={apiPayload}
                      onChange={(e) => setApiPayload(e.target.value)}
                      rows={5}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                )}

                {/* API Response View */}
                {apiResponse && (
                  <div className="mt-4 bg-slate-950 rounded-xl border border-slate-800 p-4">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-slate-400">HTTP Status:</span>
                        <span
                          className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                            apiResponse.status >= 200 && apiResponse.status < 300
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-950 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {apiResponse.status || 'ERROR'} {apiResponse.statusText}
                        </span>
                      </div>
                      <button
                        onClick={() => handleCopy(JSON.stringify(apiResponse.data, null, 2), 'api-resp')}
                        className="text-xs text-slate-400 hover:text-white flex items-center gap-1 font-mono"
                      >
                        {copiedId === 'api-resp' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>Copy JSON</span>
                      </button>
                    </div>
                    <pre className="text-xs font-mono text-slate-300 max-h-96 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                      {JSON.stringify(apiResponse.data || apiResponse, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: POSTGRESQL DATABASE DDL & LIVE TABLES */}
        {/* ========================================================================= */}
        {activeTab === 'database' && (
          <div className="space-y-6">
            {/* Live Table Counts */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
                <span className="text-xs font-mono text-slate-400">Table: users</span>
                <p className="text-2xl font-bold font-mono text-white mt-1">
                  {dbStats?.users ?? 1} <span className="text-xs text-slate-500">records</span>
                </p>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
                <span className="text-xs font-mono text-slate-400">Table: workload_profiles</span>
                <p className="text-2xl font-bold font-mono text-indigo-400 mt-1">
                  {dbStats?.workload_profiles ?? 3} <span className="text-xs text-slate-500">records</span>
                </p>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
                <span className="text-xs font-mono text-slate-400">Table: repositories</span>
                <p className="text-2xl font-bold font-mono text-cyan-400 mt-1">
                  {dbStats?.repositories ?? repositories.length}{' '}
                  <span className="text-xs text-slate-500">records</span>
                </p>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
                <span className="text-xs font-mono text-slate-400">Table: analyses &amp; metrics</span>
                <p className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                  {dbStats?.analyses ?? 0}{' '}
                  <span className="text-xs text-slate-500">/ {dbStats?.metrics ?? 0}</span>
                </p>
              </div>
            </div>

            {/* PostgreSQL DDL Script */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-sm font-semibold text-white">
                    PostgreSQL Relational DDL Specifications (`src/config/schema.sql`)
                  </h3>
                </div>
                <span className="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                  8 Relational Tables &amp; Junctions
                </span>
              </div>

              <div className="mt-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <pre className="text-xs font-mono text-indigo-200/90 leading-relaxed overflow-x-auto whitespace-pre-wrap">
{`-- 1. users: UUID PK, name, email, password_hash, role, created_at
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'developer',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. workload_profiles: 'local_dev', 'ci_cd', 'monorepo'
CREATE TABLE workload_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL
);

-- 3. repositories: FK to users (CASCADE) & workload_profiles
CREATE TABLE repositories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workload_id UUID NOT NULL REFERENCES workload_profiles(id),
    name VARCHAR(255) NOT NULL,
    source VARCHAR(50) NOT NULL,
    url_path TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. analyses: status, duration_ms, FK to repositories (CASCADE)
CREATE TABLE analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. metrics: metric_type, metric_value, unit, FK to analyses (CASCADE)
CREATE TABLE metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    metric_type VARCHAR(100) NOT NULL,
    metric_value NUMERIC NOT NULL,
    unit VARCHAR(20) NOT NULL
);

-- 6. recommendations: title, category, severity, description
CREATE TABLE recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    description TEXT NOT NULL
);

-- 7. templates: FK to recommendations (CASCADE), title, content, format
CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id UUID NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    format VARCHAR(20) NOT NULL
);

-- 8. analysis_recommendations: Composite PK (analysis_id, recommendation_id)
CREATE TABLE analysis_recommendations (
    analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    recommendation_id UUID NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
    relevance_score NUMERIC NOT NULL,
    reasoning TEXT NOT NULL,
    PRIMARY KEY (analysis_id, recommendation_id)
);`}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: ARCHITECTURE & SYSTEM DESIGN */}
        {/* ========================================================================= */}
        {activeTab === 'architecture' && (
          <div className="space-y-6">
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-indigo-400" />
                  <span>Modular Platform Architecture</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Strict separation of concerns across controllers, services, repositories, middleware, and domain logic.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-indigo-400 font-mono text-xs font-bold">
                    <Shield className="w-4 h-4" />
                    <span>Auth Module</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Bcrypt password hashing, JWT token generation &amp; validation, User context injection in Express Request.
                  </p>
                  <span className="text-[10px] font-mono text-slate-500 block">
                    modules/auth/*
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-amber-400 font-mono text-xs font-bold">
                    <Sliders className="w-4 h-4" />
                    <span>Workload Profiles</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Seeded profiles for <code className="text-indigo-300">local_dev</code>, <code className="text-indigo-300">ci_cd</code>, and <code className="text-indigo-300">monorepo</code>.
                  </p>
                  <span className="text-[10px] font-mono text-slate-500 block">
                    modules/workload/*
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-bold">
                    <Cpu className="w-4 h-4" />
                    <span>Analysis Service</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Orchestrates Git CLI extraction (<code className="text-indigo-300">rev-list</code>, <code className="text-indigo-300">ls-files</code>, <code className="text-indigo-300">count-objects</code>) and duration benchmarking.
                  </p>
                  <span className="text-[10px] font-mono text-slate-500 block">
                    modules/analysis/*
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs font-bold">
                    <Zap className="w-4 h-4" />
                    <span>Rules Engine</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Deterministic evaluation logic for Shallow Clones, Blobless Partial Clones, Sparse Checkout, Treeless, and FSMonitor.
                  </p>
                  <span className="text-[10px] font-mono text-slate-500 block">
                    modules/recommendation/*
                  </span>
                </div>
              </div>

              {/* Rules Logic Table */}
              <div className="border-t border-slate-800 pt-6">
                <h4 className="text-sm font-semibold text-white mb-3">
                  Deterministic Rules Engine Mapping Matrix
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border border-slate-800 rounded-lg">
                    <thead className="bg-slate-950 text-slate-400 font-mono text-[11px]">
                      <tr>
                        <th className="p-3 border-b border-slate-800">Workload</th>
                        <th className="p-3 border-b border-slate-800">Rule Name</th>
                        <th className="p-3 border-b border-slate-800">Deterministic Threshold Condition</th>
                        <th className="p-3 border-b border-slate-800">Target Git Optimization Command</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                      <tr className="hover:bg-slate-850">
                        <td className="p-3 text-amber-300">ci_cd</td>
                        <td className="p-3 text-white">Rule 1.1: Shallow Clone</td>
                        <td className="p-3 text-slate-300">commit_count &gt; 500</td>
                        <td className="p-3 text-emerald-300">git clone --depth 1 &lt;repo&gt;</td>
                      </tr>
                      <tr className="hover:bg-slate-850">
                        <td className="p-3 text-amber-300">ci_cd</td>
                        <td className="p-3 text-white">Rule 1.2: Blobless Partial Clone</td>
                        <td className="p-3 text-slate-300">repo_size_mb &gt; 200 AND commit_count &le; 500</td>
                        <td className="p-3 text-emerald-300">git clone --filter=blob:none &lt;repo&gt;</td>
                      </tr>
                      <tr className="hover:bg-slate-850">
                        <td className="p-3 text-purple-300">monorepo</td>
                        <td className="p-3 text-white">Rule 2.1: Sparse Checkout</td>
                        <td className="p-3 text-slate-300">file_count &gt; 10,000</td>
                        <td className="p-3 text-emerald-300">git sparse-checkout init --cone &amp;&amp; git sparse-checkout set &lt;dir&gt;</td>
                      </tr>
                      <tr className="hover:bg-slate-850">
                        <td className="p-3 text-purple-300">monorepo</td>
                        <td className="p-3 text-white">Rule 2.2: Treeless Partial Clone</td>
                        <td className="p-3 text-slate-300">repo_size_mb &gt; 1,000</td>
                        <td className="p-3 text-emerald-300">git clone --filter=tree:0 &lt;repo&gt;</td>
                      </tr>
                      <tr className="hover:bg-slate-850">
                        <td className="p-3 text-cyan-300">local_dev</td>
                        <td className="p-3 text-white">Rule 3.1: Blobless Clone</td>
                        <td className="p-3 text-slate-300">repo_size_mb &gt; 500</td>
                        <td className="p-3 text-emerald-300">git clone --filter=blob:none &lt;repo&gt;</td>
                      </tr>
                      <tr className="hover:bg-slate-850">
                        <td className="p-3 text-cyan-300">local_dev</td>
                        <td className="p-3 text-white">Rule 3.2: FSMonitor / Maintenance</td>
                        <td className="p-3 text-slate-300">file_count &gt; 20,000</td>
                        <td className="p-3 text-emerald-300">git config core.fsmonitor true</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

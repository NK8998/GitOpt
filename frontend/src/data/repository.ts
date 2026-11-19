import {
  Box,
  Clock3,
  Database,
  FileArchive,
  FileCode2,
  GitBranch,
} from "lucide-react"

export const metrics = [
  {
    label: "Repository size",
    value: "32.4 GB",
    hint: "Total packed and loose objects",
    Icon: Database,
  },
  {
    label: "Git objects",
    value: "2.1M",
    hint: "1.8M blobs · 240K trees",
    Icon: Box,
  },
  {
    label: "Commits",
    value: "184K",
    hint: "14.2 years of history",
    Icon: GitBranch,
  },
  {
    label: "Files",
    value: "96.4K",
    hint: "Across 1,428 directories",
    Icon: FileCode2,
  },
  {
    label: "Largest object",
    value: "1.8 GB",
    hint: "models/model.bin",
    Icon: FileArchive,
  },
  {
    label: "Estimated clone",
    value: "28 min",
    hint: "Full clone on 200 Mbps",
    Icon: Clock3,
  },
]

export const recommendations = [
  {
    number: "01",
    title: "Use partial clone",
    impact: "High impact",
    confidence: "High confidence",
    why: "The repository contains 28.6 GB of blob data, while local development does not require all file contents immediately.",
    current: "32.4 GB",
    optimized: "6.8 GB",
    metric: "Initial download",
    command:
      "git clone --filter=blob:none \\\n  https://github.com/microsoft/git.git",
  },
  {
    number: "02",
    title: "Enable sparse checkout",
    impact: "Medium impact",
    confidence: "High confidence",
    why: "Most changes are concentrated in 18% of repository paths. Materialize only the directories required for active work.",
    current: "96.4K",
    optimized: "18.2K",
    metric: "Working tree files",
    command:
      "git sparse-checkout init --cone\ngit sparse-checkout set src/backend",
  },
  {
    number: "03",
    title: "Consider shallow clone",
    impact: "Context dependent",
    confidence: "Medium confidence",
    why: "CI jobs use only the latest commit. Limit history in temporary build environments, but retain full history for local development.",
    current: "184K",
    optimized: "1",
    metric: "Commits in CI",
    command: "git clone --depth=1 \\\n  https://github.com/microsoft/git.git",
  },
]

export const benchmarkRows = [
  {
    strategy: "Full clone",
    time: "28m 14s",
    transfer: "32.4 GB",
    disk: "34.1 GB",
    width: 100,
  },
  {
    strategy: "Shallow clone",
    time: "12m 08s",
    transfer: "14.2 GB",
    disk: "15.3 GB",
    width: 43,
  },
  {
    strategy: "Partial clone",
    time: "8m 21s",
    transfer: "6.8 GB",
    disk: "9.1 GB",
    width: 30,
  },
  {
    strategy: "Partial + sparse",
    time: "6m 43s",
    transfer: "5.2 GB",
    disk: "6.7 GB",
    width: 24,
    best: true,
  },
]

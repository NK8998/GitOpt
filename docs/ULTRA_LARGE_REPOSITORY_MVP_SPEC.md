# Ultra-Large Repository Mode MVP

## User flow

1. On **Analyze**, the user enables **Ultra-Large Repository Mode** and starts analysis. GitOpt registers the repository and shows the usual analysis progress.
2. When analysis completes, **View strategy comparison** opens the default results view for this mode. It shows the analyzed repository, the checkout scope, and the assumed effective network speed of **100 Mbps (12.5 MB/s)**. The Linux reference appears as its own example with a pinned commit. Each timing identifies its inputs and assumptions.
3. **Run live Scalar clone** starts an asynchronous backend workspace setup. The comparison remains available while the Scalar dashboard shows checkout, MIDX, and maintenance status. If the host lacks the required capabilities, keep the comparison available and explain why the live action is unavailable.
4. The live action defaults to a root-only sparse checkout at HEAD. Offer **Full working tree at HEAD** as a checkout scope for users who need all files. Both scopes use the same branch history. The full working tree option materializes all HEAD files in the partial clone.

### Explain GitHub and GVFS where users choose the mode

Use this copy on the Analyze page and surface **GitHub partial clone** on the Scalar dashboard beside the Git and Scalar versions.

> GitOpt uses Scalar to create a GitHub partial clone on the backend. The initial checkout contains root-level files by default. Git fetches additional file content as needed.
>
> GVFS is a protocol for remotes that provide GVFS endpoints and clients configured to use them. Microsoft Scalar’s `--no-prefetch` option and parallel object downloads apply to GVFS. GitHub clones in GitOpt use Git’s standard partial-clone protocol.

Replace the current standalone `--no-prefetch` availability notice with the protocol explanation. A GitHub workspace can be available regardless of whether the local Scalar binary lists `--no-prefetch`. [Microsoft Scalar protocol selection](https://github.com/microsoft/git/blob/v2.56.1.vfs.0.1/scalar.c#L930-L950) · [Microsoft Scalar prefetch handling](https://github.com/microsoft/git/blob/v2.56.1.vfs.0.1/scalar.c#L984-L1017) · [GVFS parallel POST requests](https://github.com/microsoft/git/pull/980)

## Linux reference snapshot

Use `torvalds/linux`, branch `master`, commit `4405c18c95d2d0f99f6c581ef0ee8591a1aa6ccd`, and tree `f07c049f80f98f71047c0a29a357de05e240e0ad`. Display decimal MB and GB and store integer bytes. [Pinned Linux tree](https://github.com/torvalds/linux/tree/4405c18c95d2d0f99f6c581ef0ee8591a1aa6ccd)

| Field | Value | Provenance |
| --- | ---: | --- |
| GitHub-reported repository size | **6.63 GB** | GitHub repository metadata reports 6,471,147 KiB. This is a repository-wide size reference. |
| Full HEAD logical file size | **1.676 GB** | 1,676,103,698 bytes across 97,371 blob entries. Sum of tracked paths from the complete GitHub tree. |
| Root-only HEAD logical file size | **1.252 MB** | 1,252,207 bytes across 18 blob entries. |
| Root-only HEAD checkout pack | **326,059 bytes** | Completed Git fetch of the 18 root-level blob IDs. |
| Rounded arithmetic remainder | **4.954 GB** | `6.630 − 1.676`. The subtraction combines GitHub’s repository-size field with logical file bytes. It is an illustrative remainder with no measured history-pack meaning. |
| Compressed commit-and-tree history pack | **Unavailable** | The cold blobless fetch timed out. Only a completed, verified fetch can populate this field. |
| Full-tree HEAD checkout pack | **Unavailable** | Requires fetching the unique HEAD blob IDs for this scope. |
| Full-clone pack for the same branch | **Unavailable** | Requires a completed unfiltered fetch from a fresh repository. |

The reference card displays the 6.63 GB repository-size figure and 1.676 GB logical HEAD figure with their labels. The 4.954 GB arithmetic example can appear in the methodology details. The history-pack input stays empty until the collector has a verified value.

## Model and collection

Compute the network portion in seconds from the applicable pack bytes and the chosen effective network speed.

```text
bytes_per_second = network_mbps * 1_000_000 / 8
partial_transfer_seconds = (history_pack_bytes + checkout_pack_bytes) / bytes_per_second
full_transfer_seconds = full_clone_pack_bytes / bytes_per_second
```

At 100 Mbps, each decimal GB contributes 80 seconds. The measured Linux root-only checkout pack contributes about 26 ms of payload time. The partial-clone total stays unavailable until the history pack is collected. A hypothetical payload of 6.63 GB would take about 8m 50s at that rate. Label it as a size scenario if displayed. Checkout materialization, server preparation, network round trips, MIDX, and scheduler registration have their own timings.

Collect or refresh a snapshot outside the Analyze request, using a local command or a benchmark runner when available.

1. Resolve and record the commit and tree. Enumerate blobs through the GitHub Trees API. When a recursive response has `truncated: true`, descend into its subtrees and sum complete results. Count each checkout path for logical size and deduplicate object IDs for the checkout pack. [GitHub Trees API](https://docs.github.com/en/rest/git/trees#get-a-tree)
2. Fetch the pinned commit into a fresh bare repository with `--no-tags --filter=blob:none`. Verify the commit and successful filtered fetch, then record the completed pack bytes. Fetch the checkout scope’s unique blob IDs and record the new pack bytes before maintenance or repacking. A fresh unfiltered fetch with the same ref scope supplies the optional full-clone baseline.
3. Persist the repository identifier, ref scope, commit and tree IDs, checkout scope, collection date, Git version, outcome, and byte counts with per-field provenance. Store the snapshot independently of the selected network speed so users can recalculate from the same inputs. Use `null` for missing pack data.
4. Compute speedups only when both strategies have compatible ref and checkout scopes and all required pack inputs. Label the result **Estimated transfer time** even when the input pack sizes are measured. Existing modelled comparison values may remain visible under their current methodology.

Add an optional Ultra-Large comparison payload to `GET /api/v1/analyses/:id/benchmarks` with snapshot metadata, byte inputs, their provenance, and estimated transfer seconds per available scope. Compute using the default 100 Mbps for the first release. Keep the pinned Linux sample labeled as reference data when the active analysis is for a different repository or commit.

## Live backend workflow

Reuse `POST /api/v1/scalar/enlistments` and the existing status endpoint. The create request carries the repository ID and an allowlisted checkout scope. The backend derives the URL and destination from the registered repository. The response remains `202 Accepted` with the enlistment ID the dashboard polls. [Current Scalar integration](SCALAR_IMPLEMENTATION.md)

Run the following stages in order under one setup workflow.

1. **Checkout HEAD.** Use `scalar clone --no-maintenance --single-branch --no-tags` with capability-verified flags. For the full working tree scope, add `--full-clone`, which expands the working tree while the GitHub transport still uses blobless partial clone. Verify the worktree and record the actual HEAD and partial/sparse checkout state. The dashboard can distinguish a full-clone fallback from a successful partial clone. [Scalar clone options](https://git-scm.com/docs/scalar/2.53.0#_clone)
2. **Write and verify MIDX.** Run `git multi-pack-index write` followed by `git multi-pack-index verify` in the verified worktree. Persist the two existing operation records.
3. **Schedule maintenance immediately after MIDX verification.** Run `git maintenance start`. Display **Maintenance scheduled** when the command succeeds. The scheduler runs maintenance tasks at their configured times. An immediate maintenance task would be a separate `git maintenance run` operation. [Git maintenance docs](https://git-scm.com/docs/git-maintenance#Documentation/git-maintenance.txt-start)

Persist the active stage and terminal outcome. Guard against duplicate submissions for the same active workspace setup and block manual MIDX or maintenance operations while the automatic sequence owns the enlistment. A failed checkout prevents later stages and can be retried in a fresh workspace. A failed MIDX or scheduler keeps the verified checkout available and reports the failed stage. Once the automatic sequence ends, users can retry MIDX or, after successful verification, maintenance through the existing dashboard actions. Apply time and disk budgets across the job, including any fallback fetch.

### Tracing and status

Set `GIT_TRACE2_EVENT` per operation for the live clone, MIDX commands, maintenance registration, and benchmark fetches. Use a private run directory, bounded trace retention, and the operation or snapshot ID for correlation. Capture subprocess durations, exit codes or timeouts, and a sanitized phase summary. Show actual live timing and disk usage separately from the reference model. Enable packet or HTTP diagnostics only for a diagnostic run. [Git Trace2 documentation](https://git-scm.com/docs/git#Documentation/git.txt-codeGITTRACE2EVENTcode)

## Implementation order and acceptance

| Work | Acceptance |
| --- | --- |
| Reference snapshot and estimate model | The pinned Linux figures render at 100 Mbps. Missing history or checkout pack values produce an unavailable estimate. The 4.954 GB remainder cannot enter a transfer formula. |
| Mode entry, comparison, and protocol copy | A completed Ultra-Large analysis opens the comparison by default. The live Scalar action is explicit. The UI identifies the GitHub transport and explains when Microsoft’s GVFS options apply. |
| Live sequence and traces | A disposable Git fixture verifies checkout → MIDX write → MIDX verify → maintenance scheduling. Simulated failures verify stage gating, retry behavior, duplicate protection, and trace capture. |
| Linux pack collection | A completed, verified fetch fills each missing pack field independently. The live and estimated views show commit and scope so a user can tell which results are comparable. |

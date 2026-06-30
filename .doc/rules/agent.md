# Agent Reading Protocol

Use the CLI-first bootstrap loop whenever possible: `xgraph context "<task>" --budget small` prints must-read paths and reasons without inlining source or JSON.

If the task is already tied to files or a diff, prefer `xgraph context --file <path>`, `xgraph context --changed`, or `xgraph affected --file <path>` before broad searching.

Read only the returned paths first. If the CLI or context index is unavailable, fall back to `.doc/index.json` and follow `readOrder` progressively.

Before editing, read the compact catalog or catalog refs declared by the index, then read only the affected module cards and source files.

Read affected module files resolved from `moduleMap` before editing or summarizing module behavior. Use `xgraph affected` to identify dependent modules and high-confidence tests.

Before finishing, run `xgraph status` to catch stale context indexes and unmapped changed files.

After `xgraph status`, when an agent lifecycle hook is installed, let it run `xgraph finish`; otherwise run `xgraph sync` before finishing.

`xgraph finish` is a safe lifecycle-hook wrapper around `xgraph sync`.

`xgraph sync` refreshes deterministic context, including the committed context index. In governed profile it also records changed files and writes active-agent task files.

Prefer finer modules around real workflows when a coarse module hides unrelated concepts.

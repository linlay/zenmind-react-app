# XGraph Context Migration

The repository now uses `.doc` as the single AI-readable project context.

## Completed

- Legacy module, task, flow, and rule knowledge was converted into `.doc/curated`.
- Generated XGraph cards, catalogs, project facts, and the context index are rebuilt from `.doc/curated`.
- Narrative reference material now lives under `.doc/reference`.
- Agent entry files, README links, package scripts, and code comments now point to `.doc` and `xgraph`.

## Regeneration

Run:

```bash
xgraph index
xgraph status
```

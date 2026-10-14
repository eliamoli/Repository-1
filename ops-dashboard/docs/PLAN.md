# Bridgerow Operations Dashboard — proposed plan (v1, read-only)

Status: PROPOSED, awaiting Elia's approval. Nothing has been built yet.
Prepared Oct 8, 2026 from ELIA OS (Work Drive) and the eliamoli/repository-1 GitHub repo.

## What I checked

| Source | What it says now | Read |
| --- | --- | --- |
| ELIA OS START_HERE | Record format `ID \| STATUS \| statement`, labels VERIFIED / USER-STATED / PROPOSED / UNKNOWN / CONFLICTED / SUPERSEDED; "a verified artifact does not prove operational adoption" | Oct 8 |
| Global CURRENT_STATE / DECISIONS | Last updated Sep 27; no background writer or n8n installed (OS-Q-003) | Oct 8 |
| Bridgerow CONTEXT / DECISIONS / CURRENT_STATE | CURRENT_STATE edited Oct 8 02:28 UTC. Content engine BR-S-003, BR-A-004 (Week 1, 14 videos), BR-S-008 / BR-A-008 / BR-A-009 (Drive → Muse handoff, **not activated**), offers BR-S-009/010/011, BR-D-008 three-layer model | Oct 8 |
| Daily Video Handoff (Proposed) | `BridgeRow/Content/Ready/YYYY-MM-DD/` with `post-01.mp4`, `post-02.mp4`, `manifest.json`; states draft → ready → publishing → scheduled → published / failed / unknown; `published_url` only after the live post is verified | Oct 8 |
| Palios CURRENT_STATE | Last updated Sep 27; inventory release and current scope are UNKNOWN (PAL-Q-001..003) | Oct 8 |
| Dance Alchemy | **No ELIA OS project record found.** The only Drive hit is a client access document that contains credentials; the mod will never open it | Oct 8 |
| eliamoli/repository-1 | Bridgerow website (`index.html` + logo) on branch `bridgerow-website`, last commit Oct 7 19:43 UTC | Oct 8 |
| Claude Code 2.1.293 Mods API | Pane + slash command, `$.mcp.call` (uses the already-connected claude.ai Google Drive connector, as BR-A-005 verified), `$.process.run` (local `gh`/`git`), `$.session.usage()` (model, context window, 5-hour / 7-day limits with `resetsAt`), `$.store` (local cache) | Oct 8 |

## Layout (one pane inside Claude Code, opened with `/ops`)

```
┌ Bridgerow Operations ─────────────────────────── [Refresh]  refreshed 02:41 MDT ┐
│ Filter: [All] [Website] [Content engine] [Palios inventory] [Dance Alchemy]      │
│ Needs you (3)                                                                    │
│  ! Content: no Ready folder for today — 0 of 2 posts (target 2/day)   Drive 02:41│
│  ! BR-A-008 publishing route not activated — Muse dry run pending   ELIA OS 02:28│
│  ? Dance Alchemy: no project record configured                        —  MISSING │
├ Agent activity  (observed only) ────────────────────────────────────────────────┤
│  working   Explore subagent · "map content repo"   this session   02:39  [link]  │
│  completed website commit "Use inquiries spelling"  GitHub   Oct 7 19:43 [link]  │
├ Projects ────────────────────────────────────────────────────────────────────────┤
│  Website          VERIFIED  last commit Oct 7    source GitHub  checked 02:41    │
│  Content engine   USER-STATED BR-S-003 …         source ELIA OS checked 02:41    │
│  Palios inventory UNKNOWN PAL-Q-001 …   STALE (11 days)  source ELIA OS          │
│  Dance Alchemy    MISSING — no source configured                                 │
├ Content pipeline  (today, America/Edmonton) ────────────────────────────────────┤
│  idea ▸ script ▸ narration ▸ render ▸ QA ▸ Drive ▸ Muse ▸ published              │
│  post-01  ●       ○        ○           ○        ○    ○      ○      ○  BLOCKED    │
│  Published today: 0 / 2   (only counted from a verified published_url+receipt)   │
├ Sales & offers ─────────────────────────────────────────────────────────────────┤
│  In progress  BR-S-009 services & CAD rate card — Owner: user review             │
│  Decisions    choose lead offers; CTA naming; pillar mix …                       │
├ Usage ──────────────────────────────────────────────────────────────────────────┤
│  Model claude-…   Context 41% of 1M   5-hour 23% resets 04:00   7-day 8% Oct 12  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Every row carries a provenance tag: **OBSERVED** (seen live this session, from GitHub, or from a Drive file's real state) or **SNAPSHOT** (a status written into an ELIA OS doc by a person or agent), plus its source and last-checked time. Rows older than their threshold show **STALE**; missing sources show **MISSING**. Nothing is inferred to fill a gap.

## Data sources, one per section

| Section | Source | Kind | Stale after |
| --- | --- | --- | --- |
| Agent activity | Subagents and tool calls in the current Claude Code session (hooks); commits and PRs on eliamoli/repository-1 via `gh` | OBSERVED | 24 h |
| Projects: Website | GitHub repo above (latest commit, open PRs) + Bridgerow CURRENT_STATE | OBSERVED + SNAPSHOT | 7 days |
| Projects: Content engine | Bridgerow CURRENT_STATE (BR-S-003, BR-Q-004, BR-A-004/008/009); optional local `ai-content-engine` checkout git log if you give me its path | SNAPSHOT (+ OBSERVED if path set) | 3 days |
| Projects: Palios inventory | Palios CURRENT_STATE / DECISIONS | SNAPSHOT | 7 days |
| Projects: Dance Alchemy automation | None found. Shows MISSING until a record you name is configured | MISSING | — |
| Content pipeline | Week 1 calendar (ideas), `Content/Ready/<date>/manifest.json` on Drive (per-post status, approval, receipt) | OBSERVED for manifest, SNAPSHOT for calendar | 24 h |
| Sales & offers | Bridgerow CURRENT_STATE / DECISIONS records (BR-S-009/010/011, BR-P-*, BR-A-001..003, BR-Q-*), Gusto CURRENT_STATE. No new CRM | SNAPSHOT | 7 days |
| Usage | `$.session.usage()` and the session's model | OBSERVED | live |

Content rules, matching the handoff doc: a post counts as **published** only with `status: published`, a `published_url` and a `delivery_receipt`. A rendered MP4, a Drive upload, a Ready folder, `scheduled` or a Muse pickup never count. `unknown` and `failed` show as blocked with the manifest's `error_notes`. No manifest for today shows **0 / 2, MISSING** rather than a guess.

## Permissions

- **Drive (read only):** `search_files`, `get_file_metadata`, `read_file_content` on the claude.ai Google Drive connector, limited in code to the ELIA OS folder tree and the Content/Ready folder. Write, share and trash tools are never called.
- **Deny list:** any file whose title matches Login, Password, Access, Credential or Secret, and any file not owned by info@gustogrp.com, is skipped unread. Secret-looking strings (keys, tokens, passwords) are redacted before display.
- **GitHub (read only):** `gh api` GET calls for eliamoli/repository-1 only, using your existing `gh` login. No pushes.
- **Local:** `git log` on a content-engine folder only if you configure one. A local cache in the mod's own store so the pane opens instantly; it is marked SNAPSHOT with its time.
- **Client separation:** Palios and Dance Alchemy rows only show their own project's records. No client contacts, prices or documents are shown in other sections, and the "Needs you" strip names the project, not client details.
- No hosted service, database, Slack, n8n or paid integration. Refresh is manual (button or `/ops refresh`) plus once when the pane opens.

## Deliverables

1. The mod `bridgerow-ops-dashboard` (plugin.json, hooks module, types, tests).
2. `/ops`, `/ops refresh`, `/ops demo` commands. Demo mode loads fixtures that show a missing source, a stale record and a blocked post (rendered but unpublished, plus an `unknown` publish), and the tests assert each is labeled correctly.
3. README with install (`claude --plugin-dir <folder>`, or `/plugin install` from the repo) and removal steps.

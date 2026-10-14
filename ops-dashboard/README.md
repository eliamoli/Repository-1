# Bridgerow Operations Dashboard

A read-only pane inside Claude Code that shows what is happening across Bridgerow and what needs Elia's attention. Built as a Claude Code mod (function-hooks plugin) for Claude Code 2.1.293 or newer.

## What it shows

- **Needs you**: every source problem, stale record, conflict, blocked item and the daily content target.
- **Agent activity**: only what can be observed. The main session's turns and the subagents started in this Claude Code session, plus recent pull requests on the website repository.
- **Projects**: Bridgerow website, social media, content engine, Palios inventory and Dance Alchemy automation, each kept separate.
- **Website**: the latest commit, the repository's deployments (Vercel records each one on GitHub) with whether a production deployment exists, one check of the public site at https://bridgerow.ca/ (HTTP status, response time, page title, and the host that serves it), whether the live page carries an analytics script, and, from PostHog, visitors, pageviews, sessions, top pages and traffic sources for the last 7 days. See [Website](#website).
- **Social media**: for Instagram, TikTok, YouTube Shorts and Facebook, how many posts the publisher reported as published in the last 7 days, how many were targeted, failed or not counted, and the latest reported posts with their links. Audience numbers come from Zernio, read-only: each connected account with its followers and 30-day growth, and views, likes, comments, shares and engagement for the last 7 days' posts. See [Social media](#social-media).
- **Content pipeline**: idea, approved, video, scheduled, then one column per platform, for today's posts (America/Edmonton). The count is **reported published**: what a valid Social Ops `manifest.json` says, with its evidence checked for form (see [Publication evidence](#publication-evidence)). A render, a Drive upload, approval or a schedule never count.
- **Sales & offers**: Bridgerow's offer records from ELIA OS, grouped into decisions needing Elia, work in progress, next actions and open questions. No separate CRM.
- **Usage**: the session's model, context-window use, and the five-hour and seven-day usage limits with their reset times when Claude Code reports them.

## States

Every status carries one of these badges, and under it a line naming its source and timestamps:

```
↳ OBSERVED · GitHub eliamoli/repository-1@bridgerow-website · updated Oct 7, 13:43 · checked Oct 8, 09:00 (0s ago)
```

| Badge | Meaning | Count shown |
| --- | --- | --- |
| `SOURCE NOT CONFIGURED` | No ID is set for this source in the settings | none (`—`) |
| `ACCESS DENIED` | An ID is set, but it cannot be read, or the Drive connector is not verified as signed in to the Work account | none (`—`) |
| `NOT APPROVED` | A file found in a configured folder is owned by another account, or reports no owner, and is not listed in `approvedSharedIds`. It is not read. | none (`—`) |
| `SOURCE ERROR` | The source was read but cannot be trusted: a malformed or ambiguous manifest, two documents with the same title, a configured ID of the wrong kind, or a folder listing that stopped early | none (`—`) |
| `MISSING` | The source was read in full, and the expected item is not there (for example no `Content/Publishing` folder or no folder for today, no `DECISIONS` document, or no deployments) | none (`—`) |
| `STALE` | The source was read, but it has not been updated for `staleDays` days, or has no update time | as read |
| `VERIFIED ZERO` | Today's manifest was read, passed validation, and reports nothing published yet (or, for a platform, nothing in the 7-day window) | `0 / 2` |
| `BLOCKED` | The source says or shows that work cannot proceed: a day folder without a manifest, an approved post whose video is missing, a post past its scheduled time with no reported publication, a platform upload that failed, a post marked published without acceptable evidence, a failed latest deployment, an unreachable public site, or a record saying blocked | as reported |
| `CONFLICT` | An ELIA OS document is older than dated activity on the same project, or says publishing is not live when a publication is reported after it | as read |
| `OK` | Read and current | as reported |

An absent folder is never a production count. The content count is a number only when today's `manifest.json` was read and passed validation; otherwise it shows `— / 2 (no verifiable count)`.

The source line says how the status is known:

- **OBSERVED**: seen live (this session, GitHub, the real state of a Drive folder).
- **SNAPSHOT**: a status someone wrote into an ELIA OS document.
- **REPORTED**: what the publisher wrote in today's manifest. Its form is checked; nothing confirms it with the platform.
- **DEMO FIXTURE**: demo data.

Conflicts compare each document's last update with dated activity: website commits and pull requests into the configured branch, the content engine's last commit, and each reported publication at its receipt's `publishedAt`. The conflict row shows both dates. The dashboard does not decide which is right; it says the document may be out of date.

Rows that are informational only (a platform nobody targets, audience metrics not connected, no analytics on the site, no public URL set, a platform with a verified zero) are not listed under Needs you and do not set the project's header unless the project has nothing else.

When a project has several problems, its header shows the most serious one, in this order: ACCESS DENIED, SOURCE NOT CONFIGURED, NOT APPROVED, SOURCE ERROR, BLOCKED, MISSING, CONFLICT, STALE. Each row keeps its own badge.

**Needs you** lists every source problem, conflict and blocked item, and also every open record that asks for Elia's decision or approval, even when the document it comes from is healthy. "Needs Elia" is inferred from the record's owner or approval wording.

## Publication evidence

Each day's posts are read from a Social Ops manifest at `Content/Publishing/<YYYY>/<MM>/<YYYY-MM-DD>/manifest.json`, schema version 1 (the shape frozen packaging V1 writes). It must match this schema, or the whole day shows SOURCE ERROR with no count:

```json
{
  "schemaVersion": 1,
  "publishDate": "2026-10-08",
  "timezone": "America/Edmonton",
  "posts": [
    {
      "id": "BR-20261008-01",
      "slot": 1,
      "content": { "workingTitle": "…", "calendarSlot": "Day 2A" },
      "media": { "file": "post-01.mp4" },
      "approval": { "status": "approved" },
      "targets": { "instagram": { "enabled": true }, "tiktok": { "enabled": true }, "youtubeShorts": { "enabled": false } },
      "schedule": { "publishAt": "2026-10-08T15:00:00-06:00" },
      "publishing": {
        "status": "published",
        "attempts": [],
        "receipts": {
          "instagram": { "status": "published", "postId": "17890000000000000", "publishedAt": "2026-10-08T15:01:12-06:00", "url": "https://www.instagram.com/reel/ABC123/", "error": null },
          "tiktok": { "status": "failed", "postId": null, "publishedAt": null, "url": null, "error": "video too long" }
        }
      }
    }
  ]
}
```

- `schemaVersion` must be `1`, `publishDate` must equal the folder's date, and `timezone` must be `America/Edmonton`.
- `posts` holds 1 to 10 objects. Each needs an `id` of the form `BR-YYYYMMDD-NN` for that date, a `slot` from 1 to 10, a `media.file`, an `approval.status`, a `targets` object, a `schedule.publishAt` (a time with an offset, or null) and a `publishing` block with `status`, `attempts` and `receipts`. `content.calendarSlot` is optional.
- Targets are `instagram`, `tiktok`, `youtubeShorts` and `facebook` (Facebook is optional; it is accepted ahead of the proposed V1.1). An unknown target, or a receipt for one, is an error.
- No two posts may share an `id`, a `slot` or a media file, and no two receipts may share a post URL or a platform's `postId`.

Each enabled platform of a post is one cell in the table. It counts as **reported published** only when its receipt has `status` `published` and:

- `url` is a valid `https` URL to a post (not a home page) on that platform's own host, with no credentials: `instagram.com`; `tiktok.com`; `youtube.com` or `youtu.be`; `facebook.com` or `fb.watch` (subdomains included). A Drive or storage link is a handoff, not a publication.
- `postId` is not empty or a placeholder such as `n/a`, and `publishedAt` has a time zone, is on the manifest's date, and is not in the future.

A post counts toward the day's `N / 2` once, when at least one of its platforms is reported published. A receipt marked published with bad evidence is BLOCKED with the reason (`Instagram marked published but not counted: …`); a receipt with `status` `failed` or an error is BLOCKED with that error; a disabled target shows `–`. The rest of the post:

- **approved**: done when `approval.status` is `approved`; BLOCKED when it is `rejected`, `changes_requested` or `declined`; otherwise pending.
- **video**: done when `media.file` is in the day folder; an approved post whose video is missing is BLOCKED.
- **scheduled**: done when `schedule.publishAt` is set. Once that time has passed with no reported publication on every target, the post is BLOCKED.

The `published` receipt status is an assumption: packaging V1 leaves receipts at `not_started` and does not yet name the success status. If the publisher writes a different word, it must be added here before anything counts.

## Ideas

The idea column reads the content calendar's text, not its file details. It finds the calendar's `Status:` line and every `Slot: Day N, Video X` entry. Today's ideas are the slots for the day number counted from `contentCalendarStartDate` (or a `Start date: YYYY-MM-DD` line in the calendar). A post's `content.calendarSlot` (written `Day 2A` or `Day 2, Video A`) must be one of the slots scheduled for the manifest's date: a slot from another day, or a date with no calendar entry, marks that post's idea BLOCKED with the reason (for example `calendarSlot Day 1A is not scheduled for 2026-10-08 (today: Day 2A, Day 2B)`) and turns the day's status to CONFLICT; the reported count still stands. A post's idea is done only when its slot (its `calendarSlot`, or A for slot 1 and B for slot 2) is scheduled for that date and the calendar's status is approved (APPROVED, ACTIVE, FINAL, IN PRODUCTION or LIVE); a PROPOSED calendar leaves it pending. Without a start date, today's ideas, including any named `calendarSlot`, show as unknown.

## Website

Read from GitHub only, with no new account:

- **Website deployments**: the last 10 deployments recorded on `websiteRepo` and the latest status of the 5 most recent. A failed latest deployment is BLOCKED; no deployments is MISSING. When none is a production deployment the row says so, without concluding the site is down: bridgerow.ca is served by Netlify, so the GitHub deployments are Vercel previews of the repository. The row names the environment, state, time and host of the latest one.
- **Website traffic**: whether the live page (or, when it cannot be read, `index.html` on `websiteBranch`) carries an analytics script (Vercel Web Analytics, Google Analytics, Plausible, Cloudflare, Umami or Fathom). Netlify's own analytics run on its servers and leave no script, so they cannot be seen from the page. With none it shows NO ANALYTICS; with one it shows NOT CONNECTED, because reading visitor numbers needs that tool's read token. No visitor number is shown or estimated.
- **Website visitors (PostHog)**: read through the PostHog connector, only from the project in `posthogProjectId` (657204, "Default project"). If the connector's active project is a different one, nothing is read and the row says so; the dashboard never switches projects. Only three read-only commands are sent, and any other is refused in code before the call: `project-get`, `query-web-overview` (visitors, pageviews, sessions, average session length, bounce rate) and `query-web-stats` (top 5 pages and top 5 channels), each for the last 7 days. Only totals are shown: no people, IDs or recordings. Until the project has received an event, the row reads NO DATA YET and says whether the PostHog snippet is on the live page. When PostHog numbers are read, Website traffic shows PostHog as CONNECTED.
- **Public site**: `websiteUrl` (https only, https://bridgerow.ca/ by default), one GET per refresh: HTTP status, response time, page title and the host (Netlify, Vercel, Cloudflare or GitHub Pages, from the response headers or page). Empty shows NOT SET; a failed request or an error status is BLOCKED.

## Social media

Read from the same Social Ops manifests, for the last 7 days (today and the 6 days before, America/Edmonton):

- One row per platform: posts reported published, posts targeted, posts failed or not counted, and how many of the 7 days had a valid manifest. A day that cannot be read is left out of the window, never counted as zero. With no valid manifest in the window the row is MISSING (NO COUNT). A failure makes the platform BLOCKED. A platform nobody targeted shows NOT TARGETED.
- The account next to each platform comes from `socialAccounts` and is shown as set there, **not verified with the platform**.
- The latest 5 reported posts, with their post IDs and links.
All of the above is REPORTED: what the publisher wrote, with its form checked. Nothing is confirmed with the platforms.

### Audience numbers from Zernio

Followers, views and engagement are read through the Zernio connector named in `zernioServer` (default `plugin:zernio:zernio`, the name the Zernio plugin gets in `/mcp`). Only three read-only tools are called, and any other Zernio tool is refused in code before the call, so the dashboard never posts, schedules, edits or deletes anything:

- `accounts_list`: the connected social accounts.
- `accounts_get_follower_stats`: each account's current followers and its growth over the last 30 days.
- `analytics_get_analytics`: the posts published in the last 7 days (up to 100), with views, likes, comments, shares and engagement rate. A post sent to several platforms counts once per platform. Scheduled, draft and failed posts are left out.

What the section shows:

- **Audience metrics**: how many accounts are connected, total followers, posts in the last 7 days and their views, likes, comments, shares and average engagement.
- One row per account (for example `Instagram bridgerow_solutions`), with its followers, 30-day growth and its own post numbers.
- The 5 latest posts, each with its views, engagement and a link to the post.

Zernio reports what the platforms report; nothing is estimated. A part Zernio does not answer says why instead of showing a number. Follower counts need Zernio's Analytics add-on: without it the accounts show FOLLOWERS UNKNOWN and the post numbers still show. With no accounts connected in Zernio the row reads NO ACCOUNTS. A connector that is not connected or not signed in shows ACCESS DENIED / NOT CONNECTED and is listed under Needs you. Setting `zernioServer` to empty turns the section off (NOT CONNECTED, not listed). These rows are OBSERVED: read live from Zernio at refresh.

### Demo data

`/ops demo` loads fixtures that show every state above. The demo is kept apart from live data: it has its own state, it is never written to the live cache, a banner reads `▲ DEMO FIXTURES · NOT LIVE DATA`, every section title ends in `· DEMO FIXTURES`, every label starts with `DEMO`, and every source line says `DEMO FIXTURE`. `/ops live` or the **Go live** button returns to live data.

## Commands

| Command | What it does |
| --- | --- |
| `/ops` | Opens the pane and refreshes live data |
| `/ops refresh` | Refreshes (the **Refresh live** button or `r` in the pane does the same) |
| `/ops website`, `social`, `content`, `offers`, `palios`, `dance`, `all` | Filters by project (the buttons in the pane do the same) |
| `/ops demo` | Shows the demo fixtures |
| `/ops live` | Returns to live data |
| `/ops clear-cache` | Deletes the local cache (nothing else) |

Nothing refreshes from Drive or GitHub in the background. Agent activity in this session updates the pane as it happens, without a refresh.

### The local cache

So the pane can open with the last statuses before a refresh, each live refresh stores a small cache in the mod's own Claude Code store, under the key `lastLiveSnapshot`. It holds only record IDs, titles, statuses, states, labels and times. It holds no record text, notes, links, agent activity or usage, and everything in it is sanitized first.

The cache is tied to the verified Drive account and to every source setting. It is written only when the connector is verified as the Work account, and a refresh under any other account deletes it. At session start, a cache made under different settings or another account is deleted, not shown. At session start a matching cache is **held back, not shown**: the pane says a cached view is held until a refresh verifies the Drive connector account. A refresh checks the connector first. Only if it is signed in as `workAccount`, the account the cache was made under, does the cached view appear while the rest of the refresh runs; otherwise the cache is deleted unseen. A cached view never says "verified": its header reads `CACHED from <time> under <account> · connector re-verified <time> · details not cached, refreshing`, naming the account it was cached under and when the connector was checked again. A fresh live view reads `Drive account <account> (verified <time>)`.

To clear it, run `/ops clear-cache`. Removing the mod also stops it being read.

## Sources

Every Drive source is an explicit Work Drive ID. Inside a configured folder, a document, `Publishing` and each folder of `Publishing/YYYY/MM/YYYY-MM-DD` (folders only), `manifest.json` and each video it names are found by an **exact-title search scoped to that folder's ID**, read page by page (up to 5 pages of 100). A match is claimed only when the search ran to its last page and found exactly one item with that exact title: a search that stops early gives SOURCE ERROR (never MISSING or a match), two or more items with one title give SOURCE ERROR, and none gives MISSING. Quotes and backslashes in titles are escaped in the query.

| Setting | Default | What is read |
| --- | --- | --- |
| `bridgerowFolderId` | empty; set it to the ID of ELIA OS/PROJECTS/Bridgerow | `CURRENT_STATE` and `DECISIONS` in that folder |
| `paliosFolderId` | empty; set it to the ID of ELIA OS/PROJECTS/Palios | the titles in `paliosDocTitles` |
| `paliosDocTitles` | `CURRENT_STATE,DECISIONS` | |
| `danceAlchemyFolderId` | empty, so not configured | the titles in `danceAlchemyDocTitles` |
| `danceAlchemyDocTitles` | `CURRENT_STATE,DECISIONS` | |
| `contentFolderId` | empty; set it to the ID of ELIA OS/PROJECTS/Bridgerow/Content | `Publishing/<YYYY>/<MM>/<YYYY-MM-DD>/manifest.json` and the videos it names, for the last 7 days |
| `contentCalendarDocId` | empty; set it to the ID of Week 1 calendar | its `Status:` line and `Slot:` entries |
| `contentCalendarStartDate` | empty, so today's ideas are unknown | the calendar's Day 1 |
| `socialAccounts` | empty | `platform=handle` pairs (`instagram`, `tiktok`, `youtubeShorts`, `facebook`; `ig`, `youtube` and `fb` also work), shown as set, not verified |
| `workAccount` | `info@gustogrp.com` | the account the Drive connector must be signed in as |
| `approvedSharedIds` | empty | IDs of files or folders owned by another account that may be read when found in a configured folder |
| `driveServer` | `claude.ai Google Drive` | |
| `websiteRepo` / `websiteBranch` | `eliamoli/repository-1` / `bridgerow-website` | latest commit, pull requests, deployments and `index.html` |
| `websiteUrl` | `https://bridgerow.ca/` | the public site, one GET per refresh; its page is also checked for analytics |
| `posthogProjectId` | `657204` (Default project) | PostHog web analytics for that project; empty means not configured |
| `posthogServer` | `claude.ai PostHog` | the PostHog connector's name in Claude Code |
| `zernioServer` | `plugin:zernio:zernio` | the Zernio connector's name in Claude Code, as `/mcp` lists it (`zernio` if it was added with `claude mcp add`); empty means not configured |
| `contentEngineDir` | empty, so not configured | `git log -1` in that folder |
| `staleDays` | `7` | |

### Scope and account

Before reading anything from Drive, the dashboard checks which account the connector is signed in as. It asks Drive for a file owned by "me" in one of the configured folders and reads that file's owner. If the owner is not `workAccount`, or cannot be found, every Drive source shows ACCESS DENIED, nothing is read, and nothing is cached.

What it reads:

- **Configured IDs** (the folders and calendar in the settings) are read because you named them.
- **Files found inside a configured folder** are read only when the verified account owns them, or when their ID is in `approvedSharedIds`. A file owned by another account, or one that reports no owner, shows NOT APPROVED and is not read.
- **Files whose names look like credentials** are never read, even if approved.

## Hooks and permissions

The mod registers six hooks:

| Hook | What it does |
| --- | --- |
| `session.start` | Registers `/ops`, clears any live view, and holds back the cache if it matches the settings and account (otherwise deletes it); the held cache is shown only after a refresh verifies the connector account. Then passes the event on. |
| `command.run` for `ops` | Runs `/ops`: opens the pane, refreshes, switches between demo and live, sets the filter, clears the cache. |
| `turn.start` | Records the main session as working, then passes the event on. |
| `turn.complete` | After the turn ends, records the main session as waiting for you and updates this session's subagents. |
| `tool.call` | Watches only the `Agent` and `Task` tools to record subagents (working, completed, or blocked on an error). Every tool call goes through unchanged. `next` is called exactly once, outside any error handling: bookkeeping before or after it can fail without the call running again, an error result passes through unchanged, and a call that throws is recorded as blocked with its sanitized message (`threw: …`) and then the original error is rethrown unchanged. The hook has no `.catch` handler. Tests check that the call runs once in each case. |
| `ui.render` for the `bridgerow-ops` pane | Draws the pane. |

It uses these capabilities, which `claude plugin validate` also lists from the code:

| Capability | Exactly what |
| --- | --- |
| `$.mcp.call` | Zernio connector: only `accounts_list`, `accounts_get_follower_stats` and `analytics_get_analytics` (all read-only); any other Zernio tool is refused in code before the call. PostHog connector: only its `exec` tool, with only `call --json project-get`, `call --json query-web-overview` and `call --json query-web-stats` (all read-only); any other command is refused in code before the call. Google Drive connector: only `search_files` (`parentId = '<ID>'`, and once `owner = 'me' and parentId = '<ID>'` to verify the account), `get_file_metadata` and `download_file_content`. Any other Drive tool is refused in code before the call. |
| `$.process.run` | `gh api --method GET <path>` for the website repository's commits, pull requests into `websiteBranch`, deployments and their statuses, and `index.html`; and `git -C <contentEngineDir> log -1`. Nothing else. |
| `$.http.fetch` | `GET https://api.github.com/...` for the same paths, only when `gh` is not available; and one `GET` of `websiteUrl`. |
| `$.session.model`, `$.session.usage` | Model, context and usage limits. |
| `$.agent.list` | This session's subagents. |
| `$.store` | One key, `lastLiveSnapshot`, in the mod's own local store: read, written and deleted as described in [The local cache](#the-local-cache). |
| `$.state` | The pane's in-memory state. |
| `$.command.register`, `$.ui.open`, `$.ui.resolve` | The `/ops` command and the pane. |
| `$.clock` | The time for "checked" and "updated", and the public site's response time. |

A refresh makes up to 9 GitHub requests. Without `gh` signed in, GitHub allows 60 unauthenticated requests an hour, so about 6 refreshes an hour; after that the website rows show ACCESS DENIED or UNKNOWN until the limit resets.

**Important:** a mod's calls through `$.mcp.call` and `$.process.run` do not show a permission prompt; loading the mod is the grant. That is why read-only is enforced in the code (the lists above), and why you should load only a copy you have reviewed.

Safety rules built in:

- Nothing is read unless the Drive connector is verified as the Work account, and only within the scope above.
- Files whose names look like credentials (login, password, credential, secret, API key, token) are skipped without being opened. The Dance Alchemy "Access & Login Information" document is never opened.
- Every text that is shown or cached is sanitized, labels and titles included. Secrets are replaced with `[redacted]`: keyword pairs such as `password: …` or `"api_key": "…"`, where a quoted value is removed whole, up to its closing quote, with spaces, punctuation and escaped quotes (`\"`, `\'`) included, also for JSON carried inside a JSON string, and an unclosed quote is removed to the end of the line, bearer and basic tokens, keys with known prefixes (GitHub, Slack, Google, AWS, Stripe-style, GitLab, Shopify, SendGrid), JWTs, private key blocks, and credentials or secret parameters in URLs. Control and direction-override characters are removed, and links keep only scheme, host and path. **Redaction is best effort:** a secret in a format it does not recognize can still get through, which is another reason credential files are never opened.
- Each project shows only its own records. Gusto Consulting Group's documents are not read.
- No hosted service, database, Slack, n8n or paid integration. Nothing is written anywhere except the local snapshot cache.

## Step 1: one temporary session

This loads the mod for a single session without changing your settings.

1. Unzip `bridgerow-ops-dashboard.zip` into `C:\Users\<you>\claude-mods\`. You should then have `C:\Users\<you>\claude-mods\bridgerow-ops-dashboard\.claude-plugin\plugin.json` and `C:\Users\<you>\claude-mods\ops-settings.json`.
2. In PowerShell, check it:
   ```powershell
   cd C:\Users\<you>\claude-mods
   claude --version
   claude plugin validate .\bridgerow-ops-dashboard
   claude plugin test .\bridgerow-ops-dashboard
   ```
   Expect version 2.1.293 or newer, `Validation passed`, and `100 pass, 0 fail`.
3. Start one session with the mod and its settings file:
   ```powershell
   claude --plugin-dir "C:\Users\<you>\claude-mods\bridgerow-ops-dashboard" --settings "C:\Users\<you>\claude-mods\ops-settings.json"
   ```
4. In that session:
   1. `/mcp`: Google Drive should be connected with the Work account. If it is not, Drive rows say ACCESS DENIED, which is correct but not useful. The pane header names the verified account, or says `Drive account NOT VERIFIED`.
   2. `/ops demo`: you should see the DEMO banner and every state (STALE, SOURCE NOT CONFIGURED, MISSING, CONFLICT, ACCESS DENIED, BLOCKED), plus the Website and Social media sections.
   3. `/ops live`: the banner is gone and the header reads `LIVE · Drive account info@gustogrp.com (verified <time>)`. With these settings, expect Dance Alchemy as SOURCE NOT CONFIGURED; Content as MISSING and each social platform as NO COUNT, because `Content/Publishing` does not exist yet, with the content count as `— / 2`; Website deployments BLOCKED if the latest Vercel preview still fails; Public site OK with HTTP 200 from bridgerow.ca, served by Netlify; Website traffic as NO ANALYTICS; PostHog as NO DATA YET until the site sends events (check `/mcp` shows the PostHog connector, or the row says ACCESS DENIED); Audience metrics with your Zernio accounts, followers and post numbers (check `/mcp` shows Zernio connected and signed in, or the row says ACCESS DENIED); and Bridgerow and Palios read from Drive. Any CONFLICT row names the document and the newer activity.
   4. `/ops social`, then `/ops website`, then `/ops all`: the filter.
5. Run `/ops clear-cache` if you want nothing left behind, then exit. Your settings are unchanged.

If anything looks wrong, run step 3 again with `--debug` added and share the lines that mention `bridgerow-ops-dashboard`.

## Step 2: persistent installation

When the temporary session looks right, merge this into `%USERPROFILE%\.claude\settings.json`. Add the two keys at the top level. If the file already has an `env` or `pluginConfigs` object, add the inner key to that object instead of replacing it, and keep everything else in the file as it is.

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "C:\\Users\\<you>\\claude-mods\\bridgerow-ops-dashboard"
  },
  "pluginConfigs": {
    "bridgerow-ops-dashboard@inline": {
      "options": {
        "workAccount": "info@gustogrp.com",
        "bridgerowFolderId": "<bridgerow-drive-id>",
        "paliosFolderId": "<palios-drive-id>",
        "paliosDocTitles": "CURRENT_STATE,DECISIONS",
        "danceAlchemyFolderId": "",
        "danceAlchemyDocTitles": "CURRENT_STATE,DECISIONS",
        "contentFolderId": "<content-drive-id>",
        "contentCalendarDocId": "<calendar-drive-id>",
        "contentCalendarStartDate": "",
        "socialAccounts": "",
        "approvedSharedIds": "",
        "websiteRepo": "eliamoli/repository-1",
        "websiteBranch": "bridgerow-website",
        "websiteUrl": "https://bridgerow.ca/",
        "posthogProjectId": "657204",
        "posthogServer": "claude.ai PostHog",
        "zernioServer": "plugin:zernio:zernio",
        "contentEngineDir": "",
        "staleDays": 7
      }
    }
  }
}
```

Notes:

- Backslashes in JSON paths are doubled. If `CLAUDE_CODE_PLUGIN_DIRS` already lists folders, add this one after a `;`.
- `bridgerow-ops-dashboard@inline` is the name Claude Code gives a mod loaded from a folder (by `--plugin-dir` or `CLAUDE_CODE_PLUGIN_DIRS`). Plugin options are read from your user settings, a `--settings` file or managed settings, not from a project's `.claude/settings.json`.
- To configure Dance Alchemy later, put its folder's Work Drive ID in `danceAlchemyFolderId`. Add `socialAccounts` (for example `instagram=@handle,tiktok=@handle`) when you have them.
- Zernio must be connected in this Claude Code too, signed in to the Zernio account that holds Bridgerow's social accounts. If `/mcp` does not list it, install the Zernio plugin, or run `claude mcp add --transport http zernio https://mcp.zernio.com/mcp` and set `zernioServer` to `zernio`; then pick it in `/mcp` and sign in.
- Upgrading from 0.4: add `zernioServer` as above. Nothing else changes.
- Upgrading from 0.3: `contentReadyFolderId` and `publicationHosts` are gone; remove them and add `contentFolderId`, `socialAccounts` and `websiteUrl` as above.
- Restart Claude Code (terminal or the desktop app's Code tab), then type `/ops`.

## Remove

1. Run `/ops clear-cache`.
2. In `%USERPROFILE%\.claude\settings.json`, remove this folder from `CLAUDE_CODE_PLUGIN_DIRS` (or the whole entry) and remove `bridgerow-ops-dashboard@inline` from `pluginConfigs`.
3. Restart Claude Code.
4. Delete `C:\Users\<you>\claude-mods\bridgerow-ops-dashboard` and `ops-settings.json`.

## Tests

`claude plugin test bridgerow-ops-dashboard` runs 100 tests in two files. `tests/model.test.ts` covers the rules and `tests/dashboard.test.ts` covers the pane and hooks against fake Drive, GitHub and engine answers.

- **Publication evidence:** malformed, `http`, localhost, IP, intranet, Drive, home-page and credential-carrying URLs are rejected; each platform's URL must be on its own hosts; empty, placeholder, undated, other-day and future receipts are rejected; a receipt marked published with bad evidence is not counted; good evidence counts once per post, as REPORTED, at the receipt time.
- **Manifest schema:** the TEST-001 shape from packaging V1 is accepted; a wrong version, date or time zone, duplicate IDs, slots, media files, post URLs or platform post IDs, malformed entries, too many posts, two manifest files and unparseable JSON each give SOURCE ERROR with no count, never a crash.
- **Content states:** not configured, access denied, no `Publishing` folder or no day folder (MISSING, no count), no manifest (BLOCKED), incomplete or unapproved day folder, verified zero, approved and scheduled but not published (BLOCKED once overdue), a failed platform upload with its error, disabled targets, an approved post whose video is missing.
- **Social media:** per-platform counts from the 7-day window with the account as set and not verified; no valid manifest is NO COUNT; a failure is BLOCKED and listed under Needs you; NOT TARGETED platforms and NOT CONNECTED metrics are not; accounts parse from `platform=handle` pairs.
- **Zernio:** accounts, followers and post numbers are read with only the three read-only tools, for the last 30 and 7 days; scheduled posts are not counted; without the Analytics add-on followers show FOLLOWERS UNKNOWN with the reason while post numbers still show; a connector that is not connected is ACCESS DENIED with no numbers; no accounts says NO ACCOUNTS; accounts parse from Zernio's text or JSON answer; missing numbers are never filled in.
- **Website:** no deployments is MISSING; a failed latest deployment is BLOCKED and says there is no production deployment, without calling the site unpublished; previews alone are OK; no analytics script is NO ANALYTICS; a script without read access is NOT CONNECTED, never a number; the public site is checked once when a URL is set, names its host, and its live page decides the analytics row; an unreachable site is BLOCKED.
- **PostHog:** an empty project says NO DATA YET with no numbers and is not listed under Needs you; with data, visitors, top pages and sources are shown and every command sent is one of the three read-only ones; another active project is a SOURCE ERROR and nothing else is queried; a missing connector is ACCESS DENIED.
- **Ideas:** a calendar that exists is not proof of today's ideas; with a start date today's slots are found; a PROPOSED calendar keeps ideas pending; a calendar without entries is a SOURCE ERROR; a `calendarSlot` from another day, or for a date with no entry, is BLOCKED with its reason and makes the day a CONFLICT; without a start date a named slot is unknown.
- **Scope and account:** another owner is NOT APPROVED and not read; an approved shared document is read; a file with no owner is NOT APPROVED; a connector signed in as another account, or one that cannot be verified, reads nothing and caches nothing.
- **Exact-title search:** a document is found by exact title among 250 unrelated items; a search that never finishes gives SOURCE ERROR, never a match or MISSING; two documents, two day folders or two manifests with one title each give SOURCE ERROR; a file titled with today's date is not taken for the day folder; a title with a quote is escaped.
- **Needs you:** an approval request from a healthy document is listed.
- **Secrets and cache:** secrets in records, labels, commit messages and PR titles never reach the pane or the cache; the cache holds no record text, links or agents; complete quoted secrets (spaces, punctuation, escapes) never reach the pane or cache; a cache from other settings or another account is dropped at session start; a matching cache is held back at session start; it appears only after the connector is re-verified, without details and never labeled verified; it is deleted unseen when the connector is another account; `/ops clear-cache` deletes it; the demo never reaches live data or the cache.
- **GitHub and agents:** only pull requests into the configured branch count; agent activity appears without a refresh.
- **Agent interception:** the Agent call runs exactly once when bookkeeping fails after it or before it, and when the call itself fails; a call that throws is shown BLOCKED and its original error is rethrown; other tools pass straight through.
- **Conflicts and the pane:** document-vs-activity conflicts, a conflict that uses the receipt time rather than the manifest's file time, stale and missing documents, the demo on terminal and desktop with a source line under every status, and the filter (including `/ops social`).

# Bridgerow Ops Dashboard v0.5: demonstration

Everything below is the pane exactly as the mod draws it on the terminal. It was captured from `claude plugin test` runs against a fixed clock (Oct 8, 2026, 09:00 America/Edmonton) and fake Drive, GitHub, PostHog, Zernio and engine answers. Nothing here is live data. Section 3b is new in v0.5: followers, views and engagement from Zernio. Sections 2, 2b and 3 came in v0.4: website, PostHog visitors and social media.

## 1. `/ops demo`: every state, marked as demo

```
▲ DEMO FIXTURES · NOT LIVE DATA · live data is kept separately · /ops live to return
DEMO · refreshed Oct 8, 09:00 (0s ago) · read-only
Needs you (11) · DEMO FIXTURES
! Content BLOCKED: 1 of 2 reported published. TikTok failed: DEMO: upload rejected, video too long for this account
    ↳ DEMO FIXTURE · DEMO Drive: Content/Publishing/2026/10/2026-10-08/manifest.json · updated Oct 8, 08:10 · checked Oct 8, 09:00 (0s ago)
! Bridgerow website CONFLICT: DEMO ELIA OS Bridgerow/CURRENT_STATE: Document last updated 2026-10-07T09:00:00.000Z; newer activity: DEMO commit "update contact email" at 2026-10-08T13:00:00.000Z (DEMO GitHub repo@main). The document may not reflect it.
    ↳ DEMO FIXTURE · DEMO GitHub repo@main · updated Oct 8, 07:00 · checked Oct 8, 09:00 (0s ago)
! Bridgerow website BLOCKED: DEMO Website deployments: latest Preview deployment failure at 2026-10-08T10:00:00.000Z (demo-site-abc123.vercel.app); 1 of the last 2 failed; no production deployment is recorded on GitHub (the public site may be hosted elsewhere; see Public site)
    ↳ DEMO FIXTURE · DEMO GitHub repo deployments · updated Oct 8, 04:00 · checked Oct 8, 09:00 (0s ago)
! Social media BLOCKED: DEMO TikTok: 0 reported published of 2 targeted, 1 failed or not counted (1 of 7 days had a valid manifest); no account set (setting socialAccounts)
    ↳ DEMO FIXTURE · DEMO Drive: Content/Publishing manifests, last 7 days · updated Oct 8, 07:20 · checked Oct 8, 09:00 (0s ago)
! Sales & offers NEEDS YOUR DECISION: BR-S-009 DEMO: service catalogue and rate card drafted. Owner: user review. Next: choose lead offers.
    ↳ DEMO FIXTURE · DEMO ELIA OS Bridgerow/CURRENT_STATE · updated Oct 7, 03:00 · checked Oct 8, 09:00 (0s ago)
! Sales & offers NEEDS YOUR DECISION: BR-A-001 User: DEMO discovery conversation with a prospect. Done when answers are captured.
    ↳ DEMO FIXTURE · DEMO ELIA OS Bridgerow/CURRENT_STATE · updated Oct 7, 03:00 · checked Oct 8, 09:00 (0s ago)
! Content engine NEEDS YOUR DECISION: BR-A-008 DEMO: validate the Muse publishing route in a dry run, then seek approval for one test post.
    ↳ DEMO FIXTURE · DEMO ELIA OS Bridgerow/CURRENT_STATE · updated Oct 7, 03:00 · checked Oct 8, 09:00 (0s ago)
! Dance Alchemy automation SOURCE NOT CONFIGURED: Dance Alchemy records: DEMO: no ID set (setting danceAlchemyFolderId)
    ↳ DEMO FIXTURE · DEMO Work Drive: Dance Alchemy folder · no update time · checked Oct 8, 09:00 (0s ago)
! Sales & offers MISSING: DEMO ELIA OS Bridgerow/DECISIONS: DECISIONS not found in the configured folder
    ↳ DEMO FIXTURE · DEMO Work Drive: Bridgerow folder · updated Oct 7, 03:00 · checked Oct 8, 09:00 (0s ago)
! Palios inventory STALE: source last updated 11 days ago (limit 7)
    ↳ DEMO FIXTURE · DEMO ELIA OS Palios/CURRENT_STATE · updated Sep 27, 09:00 · checked Oct 8, 09:00 (0s ago)
! Agent BLOCKED: DEMO Render post-02 (tool error: render failed)
    ↳ DEMO FIXTURE · DEMO this session · general-purpose · updated Oct 8, 08:20 · checked Oct 8, 09:00 (0s ago)
Agent activity (observed only) · DEMO FIXTURES
working   DEMO Draft Week 2 scripts · Content engine · last update Oct 8, 08:56
    ↳ DEMO FIXTURE · DEMO this session · general-purpose · updated Oct 8, 08:56 · checked Oct 8, 09:00 (0s ago)
blocked   DEMO Render post-02 · Content engine · last update Oct 8, 08:20 · tool error: render failed
    ↳ DEMO FIXTURE · DEMO this session · general-purpose · updated Oct 8, 08:20 · checked Oct 8, 09:00 (0s ago)
waiting   DEMO PR #12 Add services page · Bridgerow website · last update Oct 8, 06:00 · awaiting review
    ↳ DEMO FIXTURE · DEMO GitHub pull requests · updated Oct 8, 06:00 · checked Oct 8, 09:00 (0s ago)
Projects · DEMO FIXTURES
Bridgerow website [BLOCKED]
  DEMO ELIA OS Bridgerow/CURRENT_STATE [CONFLICT] CONFLICT Document last updated 2026-10-07T09:00:00.000Z; newer activity: DEMO commit "update contact email" at 2026-10-08T13:00:00.000Z (DEMO GitHub repo@main). The document may not reflect it.
    ↳ DEMO FIXTURE · DEMO GitHub repo@main · updated Oct 8, 07:00 · checked Oct 8, 09:00 (0s ago)
  DEMO website repo [OK] LAST COMMIT DEMO: update contact email
    ↳ DEMO FIXTURE · DEMO GitHub repo@main · updated Oct 8, 07:00 · checked Oct 8, 09:00 (0s ago)
  DEMO Website deployments [BLOCKED] LATEST FAILED latest Preview deployment failure at 2026-10-08T10:00:00.000Z (demo-site-abc123.vercel.app); 1 of the last 2 failed; no production deployment is recorded on GitHub (the public site may be hosted elsewhere; see Public site)
    ↳ DEMO FIXTURE · DEMO GitHub repo deployments · updated Oct 8, 04:00 · checked Oct 8, 09:00 (0s ago)
  DEMO Website traffic [SOURCE NOT CONFIGURED] NO ANALYTICS no analytics script is on the page, so there are no visitor numbers to read; adding one (for example Cloudflare Web Analytics or Google Analytics, both free) and a read-only token would be needed
    ↳ DEMO FIXTURE · DEMO GitHub repo@main/index.html · no update time · checked Oct 8, 09:00 (0s ago)
  DEMO Public site [SOURCE NOT CONFIGURED] NOT SET no public website URL is set (setting websiteUrl), so the live site is not checked
    ↳ DEMO FIXTURE · DEMO public site · no update time · checked Oct 8, 09:00 (0s ago)
  DEMO Website visitors [OK] 42 VISITORS 42 visitors, 120 pageviews, 50 sessions, average session 65 s, bounce rate 41%
    ↳ DEMO FIXTURE · DEMO PostHog project Demo project, last 7 days · no update time · checked Oct 8, 09:00 (0s ago)
  DEMO Top pages [OK] VISITORS BY PAGE / 30, /#services 8, /#contact 5
    ↳ DEMO FIXTURE · DEMO PostHog project Demo project, last 7 days · no update time · checked Oct 8, 09:00 (0s ago)
  DEMO Traffic sources [OK] VISITORS BY CHANNEL Direct 25, Organic Search 12, Referral 5
    ↳ DEMO FIXTURE · DEMO PostHog project Demo project, last 7 days · no update time · checked Oct 8, 09:00 (0s ago)
  BR-Q-003 [OK] UNKNOWN DEMO: domain status for the website is unverified.
    ↳ DEMO FIXTURE · DEMO ELIA OS Bridgerow/CURRENT_STATE · updated Oct 7, 03:00 · checked Oct 8, 09:00 (0s ago)
Social media [BLOCKED]
  DEMO Instagram [OK] 1 REPORTED POST 1 reported published of 2 targeted (1 of 7 days had a valid manifest); account @demo_account (from settings, not verified with Instagram)
    ↳ DEMO FIXTURE · DEMO Drive: Content/Publishing manifests, last 7 days · updated Oct 8, 07:20 · checked Oct 8, 09:00 (0s ago)
  DEMO TikTok [BLOCKED] 0 REPORTED POSTS 0 reported published of 2 targeted, 1 failed or not counted (1 of 7 days had a valid manifest); no account set (setting socialAccounts)
    ↳ DEMO FIXTURE · DEMO Drive: Content/Publishing manifests, last 7 days · updated Oct 8, 07:20 · checked Oct 8, 09:00 (0s ago)
  DEMO YouTube Shorts [VERIFIED ZERO] 0 REPORTED POSTS 0 reported published of 1 targeted (1 of 7 days had a valid manifest); no account set (setting socialAccounts)
    ↳ DEMO FIXTURE · DEMO Drive: Content/Publishing manifests, last 7 days · updated Oct 8, 07:20 · checked Oct 8, 09:00 (0s ago)
  DEMO Facebook [SOURCE NOT CONFIGURED] NOT TARGETED no post in the last 7 days targets Facebook; no account set (setting socialAccounts)
    ↳ DEMO FIXTURE · DEMO Drive: Content/Publishing manifests, last 7 days · updated Oct 8, 07:20 · checked Oct 8, 09:00 (0s ago)
  DEMO Instagram BR-20261008-01 [OK] REPORTED PUBLISHED post DEMO-ig-778899 at 2026-10-08T13:20:00.000Z
    ↳ DEMO FIXTURE · DEMO Drive: Content/Publishing manifests, last 7 days · updated Oct 8, 07:20 · checked Oct 8, 09:00 (0s ago)
  DEMO Audience metrics [OK] 2 ACCOUNTS 2 connected accounts, 1,560 followers in total, 2 posts published in the last 7 days, 2,460 views, 137 likes, 15 comments, 9 shares, average engagement 6.8%
    ↳ DEMO FIXTURE · DEMO Zernio (plugin:zernio:zernio), followers last 30 days, posts last 7 days · no update time · checked Oct 8, 09:00 (0s ago)
  DEMO Instagram @demo_account [OK] 1,250 FOLLOWERS +50 (+4.2%) over 30 days; 1 post in the last 7 days, 1,840 views, 96 likes, 12 comments, 7 shares, average engagement 6.2%
    ↳ DEMO FIXTURE · DEMO Zernio (plugin:zernio:zernio), followers last 30 days, posts last 7 days · no update time · checked Oct 8, 09:00 (0s ago)
  DEMO TikTok @demo_tiktok [OK] 310 FOLLOWERS -4 (-1.3%) over 30 days; 1 post in the last 7 days, 620 views, 41 likes, 3 comments, 2 shares, average engagement 7.4%
    ↳ DEMO FIXTURE · DEMO Zernio (plugin:zernio:zernio), followers last 30 days, posts last 7 days · no update time · checked Oct 8, 09:00 (0s ago)
  DEMO Instagram post 2026-10-08 [OK] 1,840 VIEWS account @demo_account, 96 likes, 12 comments, 7 shares, average engagement 6.2%
    ↳ DEMO FIXTURE · DEMO Zernio (plugin:zernio:zernio), followers last 30 days, posts last 7 days · updated Oct 8, 07:00 · checked Oct 8, 09:00 (0s ago)
  DEMO TikTok post 2026-10-07 [OK] 620 VIEWS account @demo_tiktok, 41 likes, 3 comments, 2 shares, average engagement 7.4%
    ↳ DEMO FIXTURE · DEMO Zernio (plugin:zernio:zernio), followers last 30 days, posts last 7 days · updated Oct 7, 07:00 · checked Oct 8, 09:00 (0s ago)
Content engine [BLOCKED]
  BR-A-008 [OK] PROPOSED / NOT ACTIVATED DEMO: validate the Muse publishing route in a dry run, then seek approval for one test post.
    ↳ DEMO FIXTURE · DEMO ELIA OS Bridgerow/CURRENT_STATE · updated Oct 7, 03:00 · checked Oct 8, 09:00 (0s ago)
Palios inventory [STALE]
  PAL-Q-001 [STALE] UNKNOWN DEMO: which inventory release is authoritative and currently used?
    ↳ DEMO FIXTURE · DEMO ELIA OS Palios/CURRENT_STATE · updated Sep 27, 09:00 · checked Oct 8, 09:00 (0s ago)
  PAL-A-001 [STALE] READY WHEN WORK RESUMES DEMO: identify the current priority and document versions.
    ↳ DEMO FIXTURE · DEMO ELIA OS Palios/CURRENT_STATE · updated Sep 27, 09:00 · checked Oct 8, 09:00 (0s ago)
Dance Alchemy automation [SOURCE NOT CONFIGURED]
  Dance Alchemy records [SOURCE NOT CONFIGURED] SOURCE NOT CONFIGURED DEMO: no ID set (setting danceAlchemyFolderId)
    ↳ DEMO FIXTURE · DEMO Work Drive: Dance Alchemy folder · no update time · checked Oct 8, 09:00 (0s ago)
Content pipeline · DEMO FIXTURES
2026-10-08 (America/Edmonton) · reported published: 1 / 2 [BLOCKED]
A post counts when a valid manifest (schema 1) has a platform receipt marked published with its post ID, publishedAt on this date and a post URL on that platform. Reported by the publisher, not confirmed with the platform.
1 of 2 reported published; publishing is blocked
↳ DEMO FIXTURE · DEMO Drive: Content/Publishing/2026/10/2026-10-08/manifest.json · updated Oct 8, 08:10 · checked Oct 8, 09:00 (0s ago)
        idea      approved  video     scheduled Instagram TikTok    YouTube   Facebook  
post-01 ?         ●         ●         ●         ●         ✕         –         –         
        BLOCKED: TikTok failed: DEMO: upload rejected, video too long for this account
post-02 ?         ●         ●         ●         ○         ○         ○         –         
        BLOCKED: scheduled time passed with no reported publication on every target
● done  ○ not yet  ? not observable  ✕ blocked  – not targeted
Ideas: [ACCESS DENIED] DEMO: the Work account cannot read contentCalendarDocId (Entity not found)
    ↳ DEMO FIXTURE · DEMO Drive: content calendar · no update time · checked Oct 8, 09:00 (0s ago)
Sales & offers · DEMO FIXTURES
Sources
  DEMO ELIA OS Bridgerow/DECISIONS [MISSING] MISSING DECISIONS not found in the configured folder
    ↳ DEMO FIXTURE · DEMO Work Drive: Bridgerow folder · updated Oct 7, 03:00 · checked Oct 8, 09:00 (0s ago)
Decisions needing Elia
  BR-S-009 [OK] VERIFIED ARTIFACT / RECOMMENDED PRICES DEMO: service catalogue and rate card drafted. Owner: user review. Next: choose lead offers.
    ↳ DEMO FIXTURE · DEMO ELIA OS Bridgerow/CURRENT_STATE · updated Oct 7, 03:00 · checked Oct 8, 09:00 (0s ago)
  BR-A-001 [OK] READY User: DEMO discovery conversation with a prospect. Done when answers are captured.
    ↳ DEMO FIXTURE · DEMO ELIA OS Bridgerow/CURRENT_STATE · updated Oct 7, 03:00 · checked Oct 8, 09:00 (0s ago)
"Needing Elia" is inferred from each record's owner or approval wording.
Usage · DEMO FIXTURES
Model: demo-model · Context: 41% of 1000k tokens
five-hour: 23.5% · resets Oct 8, 11:00
seven-day: 8% · resets Oct 12, 09:00
↳ DEMO FIXTURE · DEMO this Claude Code session · no update time · checked Oct 8, 09:00 (0s ago)
```

## 2. Website

Read from GitHub with no new account. Here the last two Vercel preview deployments failed and the page has no analytics script. (This case has no public URL set.)

```
! Bridgerow website BLOCKED: Website deployments: latest Preview deployment failure at 2026-10-08T12:00:00.000Z (bar-inventory-abc.vercel.app); 2 of the last 2 failed; no production deployment is recorded on GitHub (the public site may be hosted elsewhere; see Public site)
    ↳ OBSERVED · GitHub eliamoli/repository-1 deployments · updated Oct 8, 06:00 · checked Oct 8, 09:00 (0s ago)
```

```
Bridgerow website [BLOCKED]
  eliamoli/repository-1@bridgerow-website [OK] LAST COMMIT Fix footer
    ↳ OBSERVED · GitHub eliamoli/repository-1@bridgerow-website · updated Sep 30, 18:00 · checked Oct 8, 09:00 (0s ago)
  Website deployments [BLOCKED] LATEST FAILED latest Preview deployment failure at 2026-10-08T12:00:00.000Z (bar-inventory-abc.vercel.app); 2 of the last 2 failed; no production deployment is recorded on GitHub (the public site may be hosted elsewhere; see Public site)
    ↳ OBSERVED · GitHub eliamoli/repository-1 deployments · updated Oct 8, 06:00 · checked Oct 8, 09:00 (0s ago)
  Website traffic [SOURCE NOT CONFIGURED] NO ANALYTICS no analytics script is on the page, so there are no visitor numbers to read; adding one (for example Cloudflare Web Analytics or Google Analytics, both free) and a read-only token would be needed
    ↳ OBSERVED · GitHub eliamoli/repository-1@bridgerow-website/index.html · no update time · checked Oct 8, 09:00 (0s ago)
  Public site [SOURCE NOT CONFIGURED] NOT SET no public website URL is set (setting websiteUrl), so the live site is not checked
    ↳ OBSERVED · public site · no update time · checked Oct 8, 09:00 (0s ago)
  PostHog [SOURCE NOT CONFIGURED] NO DATA YET PostHog project Default project has received no events. No visitor numbers are shown.
    ↳ OBSERVED · PostHog project Default project, last 7 days · no update time · checked Oct 8, 09:00 (0s ago)
  BR-Q-003 [OK] UNKNOWN Name/domain status for the website.
    ↳ SNAPSHOT · ELIA OS Bridgerow/CURRENT_STATE · updated Oct 6, 04:00 · checked Oct 8, 09:00 (0s ago)
```

With an analytics script on the page but no read access, nothing is guessed:

```
  Website traffic [SOURCE NOT CONFIGURED] NOT CONNECTED Vercel Web Analytics is on the page, but this dashboard has no read access to its numbers; a read-only API token would be needed
```

With `websiteUrl` set (bridgerow.ca by default), one check per refresh names the host, and the live page decides the analytics row:

```
  Public site [OK] HTTP 200 answered HTTP 200 in 0 ms, page title "Bridgerow Solutions", served by Netlify
```

An unreachable site is blocked. In this test the engine reports the thrown error as `no implementation for http.fetch`; in a real session it is the network error itself:

```
! Bridgerow website BLOCKED: Public site: the site could not be reached (no implementation for http.fetch)
  Public site [BLOCKED] UNREACHABLE the site could not be reached (no implementation for http.fetch)
```

## 2b. Website visitors from PostHog

Read-only, totals only, for the last 7 days. With data:

```
  Website traffic [OK] CONNECTED PostHog is on the page, and its numbers are read below
  Website visitors [OK] 42 VISITORS 42 visitors, 120 pageviews, 50 sessions, average session 65 s, bounce rate 41%
    ↳ OBSERVED · PostHog project Default project, last 7 days · no update time · checked Oct 8, 09:00 (0s ago)
  Top pages [OK] VISITORS BY PAGE / 30, /#services 8
    ↳ OBSERVED · PostHog project Default project, last 7 days · no update time · checked Oct 8, 09:00 (0s ago)
  Traffic sources [OK] VISITORS BY CHANNEL Direct 25, Organic Search 12
    ↳ OBSERVED · PostHog project Default project, last 7 days · no update time · checked Oct 8, 09:00 (0s ago)
```

Which is where things stand today: the project exists but has received no events, because the snippet is not on bridgerow.ca yet:

```
  PostHog [SOURCE NOT CONFIGURED] NO DATA YET PostHog project Default project has received no events, and the PostHog snippet is not on the public page yet. No visitor numbers are shown.
```

## 3. Social media

Per platform, from the Social Ops manifests of the last 7 days. One Instagram post is reported published; TikTok and YouTube were targeted with nothing published; nobody targeted Facebook. The Instagram handle comes from `socialAccounts` and is not verified with Instagram. This run has `zernioServer` empty, so audience numbers are not connected and nothing is estimated (section 3b shows them from Zernio):

```
Social media [OK]
  Instagram [OK] 1 REPORTED POST 1 reported published of 2 targeted (1 of 7 days had a valid manifest); account @bridgerow_solutions (from settings, not verified with Instagram)
    ↳ REPORTED · Drive: Content/Publishing manifests, last 7 days · updated Oct 8, 08:30 · checked Oct 8, 09:00 (0s ago)
  TikTok [VERIFIED ZERO] 0 REPORTED POSTS 0 reported published of 2 targeted (1 of 7 days had a valid manifest); no account set (setting socialAccounts)
    ↳ REPORTED · Drive: Content/Publishing manifests, last 7 days · updated Oct 8, 08:30 · checked Oct 8, 09:00 (0s ago)
  YouTube Shorts [VERIFIED ZERO] 0 REPORTED POSTS 0 reported published of 2 targeted (1 of 7 days had a valid manifest); no account set (setting socialAccounts)
    ↳ REPORTED · Drive: Content/Publishing manifests, last 7 days · updated Oct 8, 08:30 · checked Oct 8, 09:00 (0s ago)
  Facebook [SOURCE NOT CONFIGURED] NOT TARGETED no post in the last 7 days targets Facebook; no account set (setting socialAccounts)
    ↳ REPORTED · Drive: Content/Publishing manifests, last 7 days · updated Oct 8, 08:30 · checked Oct 8, 09:00 (0s ago)
  Instagram BR-20261008-01 [OK] REPORTED PUBLISHED post ig-01-778899 at 2026-10-08T14:30:00.000Z
    ↳ REPORTED · Drive: Content/Publishing manifests, last 7 days · updated Oct 8, 08:30 · checked Oct 8, 09:00 (0s ago)
  Audience metrics [SOURCE NOT CONFIGURED] NOT CONNECTED no Zernio connector set (setting zernioServer). Followers, views and engagement come from Zernio. No numbers are shown or estimated.
    ↳ OBSERVED · Zernio · no update time · checked Oct 8, 09:00 (0s ago)
```

A failed TikTok upload is listed under Needs you:

```
! Social media BLOCKED: TikTok: 0 reported published of 2 targeted, 1 failed or not counted (1 of 7 days had a valid manifest); no account set (setting socialAccounts)
    ↳ REPORTED · Drive: Content/Publishing manifests, last 7 days · no update time · checked Oct 8, 09:00 (0s ago)
```

Before anything is packaged in `Content/Publishing`, which is where things stand today, there is no count on any platform:

```
  Instagram [MISSING] NO COUNT no packaged day with a valid manifest in the last 7 days, so nothing can be counted; account @bridgerow_solutions (from settings, not verified with Instagram)
  TikTok [MISSING] NO COUNT no packaged day with a valid manifest in the last 7 days, so nothing can be counted; no account set (setting socialAccounts)
  YouTube Shorts [MISSING] NO COUNT no packaged day with a valid manifest in the last 7 days, so nothing can be counted; no account set (setting socialAccounts)
  Facebook [MISSING] NO COUNT no packaged day with a valid manifest in the last 7 days, so nothing can be counted; no account set (setting socialAccounts)
```

## 3b. Audience numbers from Zernio

Read live from the Zernio connector with three read-only tools: the connected accounts, each account's followers and 30-day growth, and the last 7 days' posts with their views and engagement. A post sent to two platforms counts once on each. The scheduled post Zernio also returned is left out. (The Drive rows of these runs are left out here.)

```
  Audience metrics [OK] 2 ACCOUNTS 2 connected accounts, 1,550 followers in total, 2 posts published in the last 7 days, 1,600 views, 100 likes, 10 comments, 4 shares, average engagement 6.6%
    ↳ OBSERVED · Zernio (plugin:zernio:zernio), followers last 30 days, posts last 7 days · no update time · checked Oct 8, 09:00 (0s ago)
  Instagram bridgerow_solutions [OK] 1,250 FOLLOWERS +50 (+4.2%) over 30 days; 1 post in the last 7 days, 1,200 views, 80 likes, 9 comments, 4 shares, average engagement 7.8%
    ↳ OBSERVED · Zernio (plugin:zernio:zernio), followers last 30 days, posts last 7 days · no update time · checked Oct 8, 09:00 (0s ago)
  TikTok bridgerow [OK] 300 FOLLOWERS -3 (-1.0%) over 30 days; 1 post in the last 7 days, 400 views, 20 likes, 1 comment, 0 shares, average engagement 5.4%
    ↳ OBSERVED · Zernio (plugin:zernio:zernio), followers last 30 days, posts last 7 days · no update time · checked Oct 8, 09:00 (0s ago)
  Instagram post 2026-10-07 [OK] 1,200 VIEWS account bridgerow_solutions, 80 likes, 9 comments, 4 shares, average engagement 7.8%
    ↳ OBSERVED · Zernio (plugin:zernio:zernio), followers last 30 days, posts last 7 days · updated Oct 7, 12:00 · checked Oct 8, 09:00 (0s ago)
  TikTok post 2026-10-07 [OK] 400 VIEWS account bridgerow, 20 likes, 1 comment, 0 shares, average engagement 5.4%
    ↳ OBSERVED · Zernio (plugin:zernio:zernio), followers last 30 days, posts last 7 days · updated Oct 7, 12:00 · checked Oct 8, 09:00 (0s ago)
```

Without Zernio's Analytics add-on, follower counts say why and the post numbers still show:

```
  Audience metrics [SOURCE ERROR] 2 ACCOUNTS 2 connected accounts, 2 posts published in the last 7 days, 1,600 views, 100 likes, 10 comments, 4 shares, average engagement 6.6%, follower counts not available (Zernio's Analytics add-on is needed: 403 Requires analytics add-on subscription)
    ↳ OBSERVED · Zernio (plugin:zernio:zernio), followers last 30 days, posts last 7 days · no update time · checked Oct 8, 09:00 (0s ago)
  Instagram bridgerow_solutions [SOURCE ERROR] FOLLOWERS UNKNOWN follower count not available; 1 post in the last 7 days, 1,200 views, 80 likes, 9 comments, 4 shares, average engagement 7.8%
    ↳ OBSERVED · Zernio (plugin:zernio:zernio), followers last 30 days, posts last 7 days · no update time · checked Oct 8, 09:00 (0s ago)
  TikTok bridgerow [SOURCE ERROR] FOLLOWERS UNKNOWN follower count not available; 1 post in the last 7 days, 400 views, 20 likes, 1 comment, 0 shares, average engagement 5.4%
    ↳ OBSERVED · Zernio (plugin:zernio:zernio), followers last 30 days, posts last 7 days · no update time · checked Oct 8, 09:00 (0s ago)
  Instagram post 2026-10-07 [OK] 1,200 VIEWS account bridgerow_solutions, 80 likes, 9 comments, 4 shares, average engagement 7.8%
    ↳ OBSERVED · Zernio (plugin:zernio:zernio), followers last 30 days, posts last 7 days · updated Oct 7, 12:00 · checked Oct 8, 09:00 (0s ago)
  TikTok post 2026-10-07 [OK] 400 VIEWS account bridgerow, 20 likes, 1 comment, 0 shares, average engagement 5.4%
    ↳ OBSERVED · Zernio (plugin:zernio:zernio), followers last 30 days, posts last 7 days · updated Oct 7, 12:00 · checked Oct 8, 09:00 (0s ago)
```

When the Zernio connector is not connected or not signed in, no number is shown and it is listed under Needs you:

```
! Social media ACCESS DENIED: Audience metrics: the Zernio connector (plugin:zernio:zernio) could not be read (MCP server "plugin:zernio:zernio" is not connected). Followers, views and engagement come from Zernio. No numbers are shown or estimated.
...
  Audience metrics [ACCESS DENIED] NOT CONNECTED the Zernio connector (plugin:zernio:zernio) could not be read (MCP server "plugin:zernio:zernio" is not connected). Followers, views and engagement come from Zernio. No numbers are shown or estimated.
    ↳ OBSERVED · Zernio · no update time · checked Oct 8, 09:00 (0s ago)
```

## 4. Live: not configured, access denied, not approved and conflict

Dance Alchemy has no ID. The Palios ID cannot be read. DECISIONS is owned by another account and is not in `approvedSharedIds`, so it is NOT APPROVED and never read. A credentials document sits in the folder and is never opened. A website commit is newer than CURRENT_STATE, so that is a CONFLICT.

```
LIVE · Drive account info@gustogrp.com (verified Oct 8, 09:00) · refreshed Oct 8, 09:00 (0s ago) · read-only
Needs you (9)
! Content ACCESS DENIED: no verifiable count. the Work account cannot read contentFolderId (get_file_metadata: Entity not found.)
    ↳ OBSERVED · Drive: Content folder · no update time · checked Oct 8, 09:00 (0s ago)
! Bridgerow website CONFLICT: ELIA OS Bridgerow/CURRENT_STATE: Document last updated 2026-10-06T10:00:00.000Z; newer activity: commit "Fix footer" at 2026-10-07T19:43:53.000Z (GitHub eliamoli/repository-1@bridgerow-website). The document may not reflect it.
    ↳ OBSERVED · GitHub eliamoli/repository-1@bridgerow-website · updated Oct 7, 13:43 · checked Oct 8, 09:00 (0s ago)
! Bridgerow website MISSING: Website deployments: no deployments are recorded for the repository
    ↳ OBSERVED · GitHub eliamoli/repository-1 deployments · no update time · checked Oct 8, 09:00 (0s ago)
! Bridgerow website BLOCKED: Public site: answered HTTP 404 in 0 ms
    ↳ OBSERVED · https://bridgerow.ca/ · updated Oct 8, 09:00 · checked Oct 8, 09:00 (0s ago)
! Sales & offers NEEDS YOUR DECISION: BR-S-009 Rate card. Owner: user review.
    ↳ SNAPSHOT · ELIA OS Bridgerow/CURRENT_STATE · updated Oct 6, 04:00 · checked Oct 8, 09:00 (0s ago)
! Sales & offers NOT APPROVED: ELIA OS Bridgerow/DECISIONS: DECISIONS is owned by another account and is not in approvedSharedIds, so it is not read
    ↳ SNAPSHOT · Work Drive: Bridgerow folder · updated Sep 27, 09:10 · checked Oct 8, 09:00 (0s ago)
! Palios inventory ACCESS DENIED: Palios records: the Work account cannot read paliosFolderId (get_file_metadata: Entity not found.)
    ↳ SNAPSHOT · Work Drive: Palios folder · no update time · checked Oct 8, 09:00 (0s ago)
! Dance Alchemy automation SOURCE NOT CONFIGURED: Dance Alchemy records: no ID set (setting danceAlchemyFolderId)
    ↳ SNAPSHOT · Work Drive: Dance Alchemy folder · no update time · checked Oct 8, 09:00 (0s ago)
! Social media ACCESS DENIED: Social Ops manifests: the Work account cannot read contentFolderId (get_file_metadata: Entity not found.)
    ↳ OBSERVED · Drive: Content/Publishing · no update time · checked Oct 8, 09:00 (0s ago)
Agent activity (observed only)
No observed agent activity. Only this session's agents and GitHub PRs are visible.
Projects
Bridgerow website [BLOCKED]
  ELIA OS Bridgerow/CURRENT_STATE [CONFLICT] CONFLICT Document last updated 2026-10-06T10:00:00.000Z; newer activity: commit "Fix footer" at 2026-10-07T19:43:53.000Z (GitHub eliamoli/repository-1@bridgerow-website). The document may not reflect it.
    ↳ OBSERVED · GitHub eliamoli/repository-1@bridgerow-website · updated Oct 7, 13:43 · checked Oct 8, 09:00 (0s ago)
  eliamoli/repository-1@bridgerow-website [OK] LAST COMMIT Fix footer
    ↳ OBSERVED · GitHub eliamoli/repository-1@bridgerow-website · updated Oct 7, 13:43 · checked Oct 8, 09:00 (0s ago)
  Website deployments [MISSING] NONE no deployments are recorded for the repository
    ↳ OBSERVED · GitHub eliamoli/repository-1 deployments · no update time · checked Oct 8, 09:00 (0s ago)
  Website traffic [SOURCE NOT CONFIGURED] NO ANALYTICS no analytics script is on the page, so there are no visitor numbers to read; adding one (for example Cloudflare Web Analytics or Google Analytics, both free) and a read-only token would be needed
    ↳ OBSERVED · GitHub eliamoli/repository-1@bridgerow-website/index.html · no update time · checked Oct 8, 09:00 (0s ago)
  Public site [BLOCKED] HTTP 404 answered HTTP 404 in 0 ms
    ↳ OBSERVED · https://bridgerow.ca/ · updated Oct 8, 09:00 · checked Oct 8, 09:00 (0s ago)
  PostHog [SOURCE NOT CONFIGURED] NO DATA YET PostHog project Default project has received no events. No visitor numbers are shown.
    ↳ OBSERVED · PostHog project Default project, last 7 days · no update time · checked Oct 8, 09:00 (0s ago)
  BR-Q-003 [OK] UNKNOWN Name/domain status for the website.
    ↳ SNAPSHOT · ELIA OS Bridgerow/CURRENT_STATE · updated Oct 6, 04:00 · checked Oct 8, 09:00 (0s ago)
Social media [ACCESS DENIED]
  Social Ops manifests [ACCESS DENIED] ACCESS DENIED the Work account cannot read contentFolderId (get_file_metadata: Entity not found.)
    ↳ OBSERVED · Drive: Content/Publishing · no update time · checked Oct 8, 09:00 (0s ago)
Content engine [ACCESS DENIED]
  No source returned anything for this project.
Palios inventory [ACCESS DENIED]
  Palios records [ACCESS DENIED] ACCESS DENIED the Work account cannot read paliosFolderId (get_file_metadata: Entity not found.)
    ↳ SNAPSHOT · Work Drive: Palios folder · no update time · checked Oct 8, 09:00 (0s ago)
Dance Alchemy automation [SOURCE NOT CONFIGURED]
  Dance Alchemy records [SOURCE NOT CONFIGURED] SOURCE NOT CONFIGURED no ID set (setting danceAlchemyFolderId)
    ↳ SNAPSHOT · Work Drive: Dance Alchemy folder · no update time · checked Oct 8, 09:00 (0s ago)
Content pipeline
2026-10-08 (America/Edmonton) · reported published: — / 2 (no verifiable count) [ACCESS DENIED]
A post counts when a valid manifest (schema 1) has a platform receipt marked published with its post ID, publishedAt on this date and a post URL on that platform. Reported by the publisher, not confirmed with the platform.
the Work account cannot read contentFolderId (get_file_metadata: Entity not found.)
↳ OBSERVED · Drive: Content folder · no update time · checked Oct 8, 09:00 (0s ago)
        idea      approved  video     scheduled Instagram TikTok    YouTube   Facebook  
post-01 ?         ?         ?         ?         ?         ?         ?         ?         
post-02 ?         ?         ?         ?         ?         ?         ?         ?         
● done  ○ not yet  ? not observable  ✕ blocked  – not targeted
Ideas: [SOURCE NOT CONFIGURED] no ID set (setting contentCalendarDocId)
    ↳ SNAPSHOT · Drive: content calendar · no update time · checked Oct 8, 09:00 (0s ago)
Sales & offers
Sources
  ELIA OS Bridgerow/DECISIONS [NOT APPROVED] NOT APPROVED DECISIONS is owned by another account and is not in approvedSharedIds, so it is not read
    ↳ SNAPSHOT · Work Drive: Bridgerow folder · updated Sep 27, 09:10 · checked Oct 8, 09:00 (0s ago)
Decisions needing Elia
  BR-S-009 [OK] VERIFIED ARTIFACT Rate card. Owner: user review.
    ↳ SNAPSHOT · ELIA OS Bridgerow/CURRENT_STATE · updated Oct 6, 04:00 · checked Oct 8, 09:00 (0s ago)
"Needing Elia" is inferred from each record's owner or approval wording.
Usage
Model: test-model · Context: 12% of 1000k tokens
five-hour: 30% · resets Oct 8, 12:00
↳ OBSERVED · this Claude Code session · no update time · checked Oct 8, 09:00 (0s ago)
```

## 5. Content pipeline

No `Content/Publishing` folder yet:

```
Content pipeline
2026-10-08 (America/Edmonton) · reported published: — / 2 (no verifiable count) [MISSING]
A post counts when a valid manifest (schema 1) has a platform receipt marked published with its post ID, publishedAt on this date and a post URL on that platform. Reported by the publisher, not confirmed with the platform.
Content/Publishing does not exist yet, so nothing has been packaged for publishing
↳ OBSERVED · Drive: Content/ · no update time · checked Oct 8, 09:00 (0s ago)
        idea      approved  video     scheduled Instagram TikTok    YouTube   Facebook  
post-01 ?         ?         ?         ?         ?         ?         ?         ?         
post-02 ?         ?         ?         ?         ?         ?         ?         ?         
● done  ○ not yet  ? not observable  ✕ blocked  – not targeted
Ideas: [ACCESS DENIED] the Work account cannot read contentCalendarDocId (get_file_metadata: Entity not found.)
    ↳ SNAPSHOT · Drive: content calendar · no update time · checked Oct 8, 09:00 (0s ago)
```

A malformed manifest:

```
Content pipeline
2026-10-08 (America/Edmonton) · reported published: — / 2 (no verifiable count) [SOURCE ERROR]
A post counts when a valid manifest (schema 1) has a platform receipt marked published with its post ID, publishedAt on this date and a post URL on that platform. Reported by the publisher, not confirmed with the platform.
manifest.json is invalid, so nothing is counted: schemaVersion null is not supported (expected 1); manifest has no publishDate; manifest timezone must be America/Edmonton; entry 1 has no id of the form BR-YYYYMMDD-NN (+6 more)
↳ REPORTED · Drive: Content/Publishing/2026/10/2026-10-08/manifest.json · updated Oct 8, 07:00 · checked Oct 8, 09:00 (0s ago)
        idea      approved  video     scheduled Instagram TikTok    YouTube   Facebook  
post-01 ?         ?         ?         ?         ?         ?         ?         ?         
post-02 ?         ?         ?         ?         ?         ?         ?         ?         
● done  ○ not yet  ? not observable  ✕ blocked  – not targeted
Ideas: [ACCESS DENIED] the Work account cannot read contentCalendarDocId (get_file_metadata: Entity not found.)
    ↳ SNAPSHOT · Drive: content calendar · no update time · checked Oct 8, 09:00 (0s ago)
```

A valid schema 1 manifest with nothing published:

```
Content pipeline
2026-10-08 (America/Edmonton) · reported published: 0 / 2 [VERIFIED ZERO]
A post counts when a valid manifest (schema 1) has a platform receipt marked published with its post ID, publishedAt on this date and a post URL on that platform. Reported by the publisher, not confirmed with the platform.
Valid manifest read: 0 of 2 reported published so far
↳ REPORTED · Drive: Content/Publishing/2026/10/2026-10-08/manifest.json · updated Oct 8, 07:00 · checked Oct 8, 09:00 (0s ago)
        idea      approved  video     scheduled Instagram TikTok    YouTube   Facebook  
post-01 ?         ○         ●         ○         ○         ○         ○         –         
post-02 ?         ○         ●         ○         ○         ○         ○         –         
● done  ○ not yet  ? not observable  ✕ blocked  – not targeted
Ideas: [ACCESS DENIED] the Work account cannot read contentCalendarDocId (get_file_metadata: Entity not found.)
    ↳ SNAPSHOT · Drive: content calendar · no update time · checked Oct 8, 09:00 (0s ago)
```

## 6. Calendar slots are checked against the manifest date

The calendar starts 2026-10-07, so 2026-10-08 is Day 2. The first post names `Day 1A`, yesterday's slot: its idea is blocked with the reason, and the day is a CONFLICT. The second names `Day 2, Video B` and the calendar is approved, so its idea is done.

```
! Content CONFLICT: 0 of 2 reported published. post-01: calendarSlot Day 1A is not scheduled for 2026-10-08 (today: Day 2A, Day 2B)
    ↳ REPORTED · Drive: Content/Publishing/2026/10/2026-10-08/manifest.json · updated Oct 8, 07:00 · checked Oct 8, 09:00 (0s ago)
```

```
Content pipeline
2026-10-08 (America/Edmonton) · reported published: 0 / 2 [CONFLICT]
A post counts when a valid manifest (schema 1) has a platform receipt marked published with its post ID, publishedAt on this date and a post URL on that platform. Reported by the publisher, not confirmed with the platform.
0 of 2 reported published; post-01: calendarSlot Day 1A is not scheduled for 2026-10-08 (today: Day 2A, Day 2B)
↳ REPORTED · Drive: Content/Publishing/2026/10/2026-10-08/manifest.json · updated Oct 8, 07:00 · checked Oct 8, 09:00 (0s ago)
        idea      approved  video     scheduled Instagram TikTok    YouTube   Facebook  
post-01 ✕         ○         ●         ○         ○         ○         ○         –         
        IDEA: calendarSlot Day 1A is not scheduled for 2026-10-08 (today: Day 2A, Day 2B)
post-02 ●         ○         ●         ○         ○         ○         ○         –         
● done  ○ not yet  ? not observable  ✕ blocked  – not targeted
Ideas (4 planned): [OK] today: Day 2A, Day 2B. calendar status APPROVED
    ↳ SNAPSHOT · Drive: Week 1 calendar · updated Oct 4, 18:00 · checked Oct 8, 09:00 (0s ago)
```

## 7. The Drive connector is signed in as another account

Nothing is read, nothing is cached, and the other account is not named.

```
LIVE · Drive account NOT VERIFIED · refreshed Oct 8, 09:00 (0s ago) · read-only
Needs you (9)
! Content ACCESS DENIED: no verifiable count. the Drive connector is signed in as another account, not info@gustogrp.com; nothing is read
    ↳ OBSERVED · Drive: Content folder · no update time · checked Oct 8, 09:00 (0s ago)
! Bridgerow website MISSING: Website deployments: no deployments are recorded for the repository
    ↳ OBSERVED · GitHub eliamoli/repository-1 deployments · no update time · checked Oct 8, 09:00 (0s ago)
! Bridgerow website BLOCKED: Public site: answered HTTP 404 in 0 ms
    ↳ OBSERVED · https://bridgerow.ca/ · updated Oct 8, 09:00 · checked Oct 8, 09:00 (0s ago)
```

## 8. Secrets

```
waiting   PR #7 Add token=[redacted] to config · Bridgerow website · last update Oct 8, 06:00 · awaiting review
  eliamoli/repository-1@bridgerow-website [OK] LAST COMMIT Use [redacted] temporarily
  BR-A-010 [OK] READY password=[redacted] Rotate {"api_key": "[redacted]"} for the site.
  BR-A-011 [OK] READY Login at https://[redacted]@example.com/admin?access_token=[redacted] now.
  BR-A-012 [OK] READY Keys [redacted] and [redacted].
  BR-A-013 [OK] READY Set {"password": "[redacted]"} and api_key='[redacted]' today.
```


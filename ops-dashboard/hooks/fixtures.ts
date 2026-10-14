// DEMO FIXTURES for `/ops demo`. Every source here is kind 'fixture' and every
// label starts with DEMO, so nothing in it can be mistaken for live data. The
// demo is kept in its own state and never written to the live cache.

import type { Snapshot, Source } from '../types'
import {
  DAY_MS,
  deploymentRow,
  detectConflicts,
  edmontonDate,
  evaluateContentDay,
  liveSiteRow,
  posthogRows,
  parseRecords,
  rowsFromRecords,
  socialRows,
  zernioRows,
  sourceRow,
  trafficRow,
} from './model'

const DEMO_STATE = `
BR-S-009 | VERIFIED ARTIFACT / RECOMMENDED PRICES | DEMO: service catalogue and rate card drafted. Owner: user review. Next: choose lead offers.
BR-A-001 | READY | User: DEMO discovery conversation with a prospect. Done when answers are captured.
BR-A-008 | PROPOSED / NOT ACTIVATED | DEMO: validate the Muse publishing route in a dry run, then seek approval for one test post.
BR-Q-003 | UNKNOWN | DEMO: domain status for the website is unverified.
`

const PALIOS_STATE = `
PAL-Q-001 | UNKNOWN | DEMO: which inventory release is authoritative and currently used?
PAL-A-001 | READY WHEN WORK RESUMES | DEMO: identify the current priority and document versions.
`

export function demoSnapshot(now: number): Snapshot {
  const demo = (label: string, updatedAt?: number): Source => ({
    label: `DEMO ${label}`,
    kind: 'fixture',
    checkedAt: now,
    updatedAt,
  })
  const stateDoc = demo('ELIA OS Bridgerow/CURRENT_STATE', now - 30 * 60 * 60 * 1000)
  const bridgerow = rowsFromRecords(
    parseRecords(DEMO_STATE),
    r => (/muse|publishing/i.test(r.text) ? 'content' : /website|domain/i.test(r.text) ? 'website' : 'offers'),
    stateDoc,
    now,
    7,
  )
  // Stale: the Palios record was last updated eleven days ago.
  const palios = rowsFromRecords(
    parseRecords(PALIOS_STATE),
    'palios',
    demo('ELIA OS Palios/CURRENT_STATE', now - 11 * DAY_MS),
    now,
    7,
  )
  // Source not configured: no Dance Alchemy folder ID is set.
  const dance = sourceRow('dance', 'not-configured', 'Dance Alchemy records', 'DEMO: no ID set (setting danceAlchemyFolderId)', demo('Work Drive: Dance Alchemy folder'))
  // Missing: the configured folder was read but has no DECISIONS document.
  const decisions = sourceRow('offers', 'missing', 'DEMO ELIA OS Bridgerow/DECISIONS', 'DECISIONS not found in the configured folder', demo('Work Drive: Bridgerow folder', now - 30 * 60 * 60 * 1000))

  const commitAt = now - 2 * 60 * 60 * 1000
  const website = {
    id: 'website-github',
    project: 'website' as const,
    title: 'DEMO website repo',
    status: 'LAST COMMIT',
    detail: 'DEMO: update contact email',
    source: demo('GitHub repo@main', commitAt),
    health: 'ok' as const,
    needsElia: false,
    kind: 'summary' as const,
  }

  const date = edmontonDate(now)
  const compact = date.replace(/-/g, '')
  const hourAgo = new Date(now - 60 * 60 * 1000).toISOString()
  const receipt = (status: string, extra: Record<string, unknown> = {}) => ({ status, postId: null, publishedAt: null, url: null, error: null, ...extra })
  // Post 01 is reported live on Instagram; its TikTok upload failed.
  // Post 02 was approved and scheduled an hour ago but has no receipt yet.
  // Access denied: the content calendar could not be read.
  const content = evaluateContentDay({
    date,
    now,
    checkedAt: now,
    kind: 'fixture',
    ready: { state: 'ok', file: { id: 'demo-content', title: 'DEMO Content' } },
    dayFolder: { id: 'demo-day', title: date, modifiedTime: new Date(now - 3 * 60 * 60 * 1000).toISOString() },
    dayFiles: [
      { id: 'demo-1', title: 'post-01.mp4' },
      { id: 'demo-2', title: 'post-02.mp4' },
      { id: 'demo-m', title: 'manifest.json', modifiedTime: new Date(now - 50 * 60 * 1000).toISOString() },
    ],
    calendar: { state: 'access-denied', why: 'DEMO: the Work account cannot read contentCalendarDocId (Entity not found)' },
    manifest: {
      schemaVersion: 1,
      publishDate: date,
      timezone: 'America/Edmonton',
      handoffStatus: 'ready',
      posts: [
        {
          id: `BR-${compact}-01`,
          slot: 1,
          content: { workingTitle: 'DEMO Three boring automations' },
          media: { file: 'post-01.mp4' },
          approval: { status: 'approved' },
          targets: { instagram: { enabled: true }, tiktok: { enabled: true }, youtubeShorts: { enabled: false } },
          schedule: { publishAt: new Date(now - 2 * 60 * 60 * 1000).toISOString() },
          publishing: {
            status: 'partially_published',
            attempts: [{ at: hourAgo }],
            receipts: {
              instagram: receipt('published', {
                postId: 'DEMO-ig-778899',
                publishedAt: new Date(now - 100 * 60 * 1000).toISOString(),
                url: 'https://www.instagram.com/reel/DEMO01/',
              }),
              tiktok: receipt('failed', { error: 'DEMO: upload rejected, video too long for this account' }),
            },
          },
        },
        {
          id: `BR-${compact}-02`,
          slot: 2,
          media: { file: 'post-02.mp4' },
          approval: { status: 'approved' },
          targets: { instagram: { enabled: true }, tiktok: { enabled: true }, youtubeShorts: { enabled: true } },
          schedule: { publishAt: hourAgo },
          publishing: { status: 'scheduled', attempts: [], receipts: { instagram: receipt('not_started'), tiktok: receipt('not_started'), youtubeShorts: receipt('not_started') } },
        },
      ],
    },
  })
  content.source = { ...content.source, label: `DEMO ${content.source.label}` }
  if (content.ideas) content.ideas.source = { ...content.ideas.source, label: `DEMO ${content.ideas.source.label}` }

  // Social media: today's receipts, with an Instagram account set and the
  // others not.
  const social = [
    ...socialRows({ days: [content], accounts: { instagram: '@demo_account' }, checkedAt: now, kind: 'fixture' }),
    // Audience numbers as Zernio would report them: two accounts, follower
    // growth, and views and engagement for the week's posts.
    ...zernioRows(
      {
        state: 'ok',
        server: 'plugin:zernio:zernio',
        accounts: [
          { id: 'demo-ig', platform: 'instagram', username: '@demo_account' },
          { id: 'demo-tt', platform: 'tiktok', username: '@demo_tiktok' },
        ],
        followers: { ok: true, value: { 'demo-ig': { followers: 1250, growth: 50, growthPct: 4.17 }, 'demo-tt': { followers: 310, growth: -4, growthPct: -1.27 } } },
        posts: {
          ok: true,
          value: [
            { platform: 'instagram', accountId: 'demo-ig', account: '@demo_account', publishedAt: now - 2 * 60 * 60 * 1000, url: 'https://www.instagram.com/reel/demo01/', views: 1840, likes: 96, comments: 12, shares: 7, engagementRate: 6.2 },
            { platform: 'tiktok', accountId: 'demo-tt', account: '@demo_tiktok', publishedAt: now - 26 * 60 * 60 * 1000, url: 'https://www.tiktok.com/@demo_tiktok/video/1', views: 620, likes: 41, comments: 3, shares: 2, engagementRate: 7.4 },
          ],
        },
      },
      now,
      'fixture',
    ),
  ]

  // Website: the latest deployment failed, there is no analytics script and no
  // public URL is set.
  const websiteChecks = [
    deploymentRow(
      [
        { environment: 'Preview', createdAt: now - 5 * 60 * 60 * 1000, state: 'failure', url: 'https://demo-site-abc123.vercel.app' },
        { environment: 'Preview', createdAt: now - 26 * 60 * 60 * 1000, state: 'success', url: 'https://demo-site-def456.vercel.app' },
      ],
      'repo',
      now,
      'fixture',
    ),
    trafficRow('<html><head><title>DEMO</title></head></html>', 'GitHub repo@main/index.html', now, 'fixture'),
    liveSiteRow('', undefined, now, 'fixture'),
    ...posthogRows(
      {
        state: 'ok',
        project: 'Demo project',
        ingested: true,
        overview: { visitors: 42, views: 120, sessions: 50, durationS: 65, bounce: 0.41 },
        pages: [['/', 30], ['/#services', 8], ['/#contact', 5]],
        channels: [['Direct', 25], ['Organic Search', 12], ['Referral', 5]],
      },
      now,
      'fixture',
    ),
  ]

  // Conflict: the CURRENT_STATE document is older than a verified commit.
  const rows = [website, ...websiteChecks, ...social, ...bridgerow, ...palios, dance, decisions]
  const conflicts = detectConflicts(
    rows,
    [{ project: 'website', at: commitAt, what: 'DEMO commit "update contact email"', source: website.source }],
  ).map(c => ({
    ...c,
    title: c.title.startsWith('DEMO') ? c.title : `DEMO ${c.title}`,
    source: { ...c.source, kind: 'fixture' as const },
  }))

  return {
    mode: 'demo',
    refreshedAt: now,
    isCached: false,
    rows: [...conflicts, ...rows],
    agents: [
      {
        id: 'demo-a1',
        task: 'DEMO Draft Week 2 scripts',
        project: 'content',
        state: 'working',
        lastUpdate: now - 4 * 60 * 1000,
        source: demo('this session · general-purpose', now - 4 * 60 * 1000),
      },
      {
        id: 'demo-a2',
        task: 'DEMO PR #12 Add services page',
        project: 'website',
        state: 'waiting',
        lastUpdate: now - 3 * 60 * 60 * 1000,
        result: 'awaiting review',
        source: demo('GitHub pull requests', now - 3 * 60 * 60 * 1000),
      },
      {
        id: 'demo-a3',
        task: 'DEMO Render post-02',
        project: 'content',
        state: 'blocked',
        lastUpdate: now - 40 * 60 * 1000,
        result: 'tool error: render failed',
        source: demo('this session · general-purpose', now - 40 * 60 * 1000),
      },
    ],
    content,
    usage: {
      model: 'demo-model',
      contextPercent: 41,
      contextWindow: 1_000_000,
      tokens: 410_000,
      limits: [
        { kind: 'five_hour', percentUsed: 23.5, resetsAt: new Date(now + 2 * 60 * 60 * 1000).toISOString() },
        { kind: 'seven_day', percentUsed: 8, resetsAt: new Date(now + 4 * DAY_MS).toISOString() },
      ],
      checkedAt: now,
    },
    problems: [],
  }
}

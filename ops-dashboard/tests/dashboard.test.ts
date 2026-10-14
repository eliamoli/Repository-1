// The pane and its hooks against fake Drive, GitHub and engine answers. Each
// live case is a regression for a review finding.

import { describe, expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'

type Engine = Parameters<TestBody>[0]

const NOW = Date.parse('2026-10-08T15:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const DATE = '2026-10-08'
const SURFACES = ['terminal', 'desktop'] as const
const PLUGIN = 'bridgerow-ops-dashboard'
const WORK = 'info@gustogrp.com'
const FOLDER = 'application/vnd.google-apps.folder'
const DOC = 'application/vnd.google-apps.document'
const STORE_KEY = 'lastLiveSnapshot'
const START = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as const

// ---- Engine stand-ins ---------------------------------------------------------

// Pass a `store` to record writes instead of the kit's in-memory store.
function engineBottom(on: On, store?: Map<string, unknown>, clock = true) {
  if (clock) mock.clock(on, { now: NOW })
  if (store) {
    on('store.get', (_$, e) => ({ value: store.get(e.key) }))
    on('store.set', (_$, e) => {
      store.set(e.key, JSON.parse(JSON.stringify(e.value)))
      return { value: undefined }
    })
    on('store.delete', (_$, e) => {
      store.delete(e.key)
      return { value: undefined }
    })
  } else {
    mock.store(on)
  }
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.model', () => ({ value: 'test-model' }))
  on('session.usage', () => ({
    value: {
      startedAt: NOW - DAY,
      context: { tokens: 120_000, window: 1_000_000, percent: 12 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 30, resetsAt: '2026-10-08T18:00:00Z' }],
    },
  }))
  on('agent.list', () => ({ value: [] }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
}

type FakeDrive = {
  // The account the connector is signed in as ('' answers nothing for "me").
  me?: string
  meta: Record<string, Record<string, unknown>>
  children: Record<string, Record<string, unknown>[]>
  docs: Record<string, string>
  posthog?: FakePosthog
  zernio?: FakeZernio
}

// What the Zernio connector answers. Without one, the connector is not
// connected.
type FakeZernio = {
  accounts?: string
  followers?: unknown
  followersError?: string
  posts?: unknown
}

function fakeZernio(e: { tool: string; args: Record<string, unknown> }, z?: FakeZernio) {
  if (!z) return text('MCP server "plugin:zernio:zernio" is not connected', true)
  if (e.tool === 'accounts_list') return text(z.accounts ?? 'No connected accounts found.')
  if (e.tool === 'accounts_get_follower_stats') return z.followersError ? text(z.followersError, true) : text(z.followers ?? { accounts: [] })
  if (e.tool === 'analytics_get_analytics') return text(z.posts ?? { posts: [] })
  return text(`unexpected tool ${e.tool}`, true)
}

// What the PostHog connector answers. By default: the configured project,
// with no events yet.
type FakePosthog = {
  down?: boolean
  projectId?: number
  ingested?: boolean
  overview?: Record<string, number | null>
  pages?: [string, number][]
  channels?: [string, number][]
}

function fakePosthog(e: { tool: string; args: Record<string, unknown> }, ph: FakePosthog = {}) {
  if (ph.down) throw new Error('MCP server "claude.ai PostHog" is not connected')
  const command = String(e.args.command)
  if (e.tool !== 'exec') return text(`unexpected tool ${e.tool}`, true)
  if (command.startsWith('call --json project-get')) return text({ id: ph.projectId ?? 657204, name: 'Default project', ingested_event: ph.ingested ?? false })
  if (command.startsWith('call --json query-web-overview')) {
    const o = ph.overview ?? {}
    return text({ _posthogUrl: 'https://us.posthog.com/project/657204/web', results: Object.entries(o).map(([key, value]) => ({ key, value })) })
  }
  if (command.startsWith('call --json query-web-stats')) {
    const rows = command.includes('"InitialChannelType"') ? ph.channels ?? [] : ph.pages ?? []
    return text({
      columns: ['context.columns.breakdown_value', 'context.columns.visitors', 'context.columns.views', 'context.columns.ui_fill_fraction'],
      results: rows.map(([name, n]) => [name, [n, null], [n * 2, null], 0.5]),
    })
  }
  return text(`unexpected command ${command}`, true)
}

const text = (value: unknown, isError = false) => ({
  value: { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }], isError },
})

function fakeDrive(on: On, drive: FakeDrive, calls: string[]) {
  on('mcp.call', (_$, e) => {
    calls.push(`${e.tool}:${JSON.stringify(e.args)}`)
    if (e.server === 'claude.ai PostHog') return fakePosthog(e, drive.posthog)
    if (e.server === 'plugin:zernio:zernio') return fakeZernio(e, drive.zernio)
    if (e.tool === 'get_file_metadata') {
      const meta = drive.meta[String(e.args.fileId)]
      return meta ? text(meta) : text('Entity not found.', true)
    }
    if (e.tool === 'search_files') {
      const query = String(e.args.query)
      const parent = /parentId = '([^']+)'/.exec(query)?.[1] ?? ''
      if (!(parent in drive.children)) return text('Entity not found.', true)
      let list = drive.children[parent] ?? []
      const me = drive.me ?? WORK
      if (query.includes("owner = 'me'")) list = me ? list.filter(f => f.owner === me) : []
      const quoted = (field: string) => {
        const m = new RegExp(`${field} = '((?:[^'\\\\]|\\\\.)*)'`).exec(query)
        return m ? m[1]!.replace(/\\(.)/g, '$1') : undefined
      }
      const title = quoted('title')
      const mime = quoted('mimeType')
      if (title !== undefined) list = list.filter(f => f.title === title)
      if (mime !== undefined) list = list.filter(f => f.mimeType === mime)
      const size = Number(e.args.pageSize ?? 100)
      const start = Number(e.args.pageToken ?? 0)
      const page = list.slice(start, start + size)
      const next = start + size < list.length ? String(start + size) : undefined
      return text(next ? { files: page, nextPageToken: next } : { files: page })
    }
    if (e.tool === 'download_file_content') {
      return text({ content: btoa(drive.docs[String(e.args.fileId)] ?? '') })
    }
    return text(`unexpected tool ${e.tool}`, true)
  })
}

type FakePull = { number: number; title: string; base: string; updated: string }

// What the website routes answer: deployments with their latest status, the
// branch's index.html, and the public site when websiteUrl is set.
type FakeSite = {
  deployments?: { id: number; environment: string; created_at: string; state: string; url?: string }[]
  html?: string
  live?: { status: number; text: string } | 'down'
  // Every URL fetched, when given.
  calls?: string[]
}

const json = (value: unknown, status = 200) => ({ value: { status, ok: status < 400, headers: {}, text: JSON.stringify(value) } })

function fakeGithub(on: On, commitDate: string, commitMessage = 'Fix footer', pulls: FakePull[] = [], site: FakeSite = {}) {
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: 'no gh', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('http.fetch', (_$, e) => {
    const url = String(e.url)
    site.calls?.push(url)
    if (!url.startsWith('https://api.github.com/')) {
      if (site.live === 'down') throw new Error('getaddrinfo ENOTFOUND')
      const live = site.live ?? { status: 404, text: '' }
      return { value: { status: live.status, ok: live.status < 400, headers: {}, text: live.text } }
    }
    if (url.includes('/statuses')) {
      const id = Number(/deployments\/(\d+)\/statuses/.exec(url)?.[1])
      const d = site.deployments?.find(x => x.id === id)
      return json(d ? [{ state: d.state, environment_url: d.url }] : [])
    }
    if (url.includes('/deployments')) {
      return json((site.deployments ?? []).map(d => ({ id: d.id, environment: d.environment, created_at: d.created_at })))
    }
    if (url.includes('/contents/index.html')) {
      return json({ content: btoa(site.html ?? '<html><head><title>Bridgerow</title></head><body></body></html>') })
    }
    if (url.includes('/commits')) {
      return json([{ sha: 'a', html_url: 'https://github.com/x/y/commit/a', commit: { message: commitMessage, committer: { date: commitDate } } }])
    }
    return json(
      pulls.map(p => ({
        number: p.number,
        title: p.title,
        html_url: `https://github.com/x/y/pull/${p.number}`,
        state: 'open',
        draft: false,
        merged_at: null,
        updated_at: p.updated,
        base: { ref: p.base },
      })),
    )
  })
}

function ops($: Engine, args: string) {
  return $.command.run({
    command: 'ops',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 220 },
  })
}

// The pane's text, one line per outermost Text element.
async function paneLines($: Engine, surface: (typeof SURFACES)[number]): Promise<string[]> {
  const ui = await $.ui.mount({
    plugin: PLUGIN,
    surface,
    component: 'Pane',
    requestId: 'bridgerow-ops',
    props: { title: 'Bridgerow Ops', isFocused: false, bodyColumns: 220, placement: 'dock', scroll: { offset: 0, bodyRows: 400 }, view: {} },
    viewport: { columns: 220, rows: 400 },
  })
  const all = await ui.findAll({ type: 'Text' })
  await ui.unmount()
  const lines: string[] = []
  let covered = ''
  for (const t of all) {
    if (covered.includes(t.text) && t.text.length < covered.length) continue
    lines.push(t.text)
    covered = t.text
  }
  return lines
}

const pane = async ($: Engine) => (await paneLines($, 'terminal')).join('\n')

// Every badge line drawn for a status is followed by its source line.
function expectSourceUnderEveryStatus(lines: readonly string[]) {
  const badge =
    /^\s{2}\S.*\[(OK|STALE|SOURCE NOT CONFIGURED|ACCESS DENIED|MISSING|VERIFIED ZERO|BLOCKED|CONFLICT|SOURCE ERROR|NOT APPROVED)\]/
  let checked = 0
  lines.forEach((line, i) => {
    if (!badge.test(line)) return
    checked += 1
    expect(lines[i + 1] ?? '').toMatch(/↳ (OBSERVED|SNAPSHOT|REPORTED|DEMO FIXTURE) · .+ · checked /)
  })
  expect(checked).toBeGreaterThan(0)
}

// ---- Fixtures for the live pane ---------------------------------------------------

const BR_FILES = [
  { id: 'br-state', title: 'CURRENT_STATE', mimeType: DOC, owner: WORK, modifiedTime: '2026-10-06T10:00:00Z' },
  { id: 'br-dec', title: 'DECISIONS', mimeType: DOC, owner: 'someone@else.com', modifiedTime: '2026-10-06T10:00:00Z' },
  { id: 'br-login', title: 'Access & Login Information', mimeType: DOC, owner: WORK },
]

function workDrive(overrides: Partial<FakeDrive> = {}): FakeDrive {
  return {
    me: overrides.me,
    meta: {
      BR: { id: 'BR', title: 'Bridgerow', mimeType: FOLDER, owner: WORK, modifiedTime: '2026-09-27T15:10:31Z' },
      ...overrides.meta,
    },
    children: { BR: BR_FILES, ...overrides.children },
    docs: {
      'br-state': 'BR-S-009 | VERIFIED ARTIFACT | Rate card. Owner: user review.\nBR-Q-003 | UNKNOWN | Name/domain status for the website.',
      'br-dec': 'BR-P-001 | PROPOSED | from another account',
      ...overrides.docs,
    },
  }
}

const manifestFile = { id: 'MAN', title: 'manifest.json', mimeType: 'application/json', owner: WORK, modifiedTime: '2026-10-08T13:00:00Z' }

// Social Ops manifest schema 1, in the shape frozen packaging V1 writes.
const COMPACT = DATE.replace(/-/g, '')
const receipt = (status = 'not_started', over: Record<string, unknown> = {}) => ({ status, postId: null, publishedAt: null, url: null, error: null, ...over })
const post = (n: string, over: Record<string, unknown> = {}, receipts: Record<string, unknown> = {}) => ({
  id: `BR-${COMPACT}-${n}`,
  slot: Number(n),
  content: { workingTitle: `Post ${n}` },
  media: { file: `post-${n}.mp4`, mimeType: 'video/mp4' },
  approval: { status: 'pending' },
  targets: { instagram: { enabled: true }, tiktok: { enabled: true }, youtubeShorts: { enabled: true } },
  schedule: { publishAt: null },
  publishing: { status: 'not_scheduled', attempts: [], receipts: { instagram: receipt(), tiktok: receipt(), youtubeShorts: receipt(), ...receipts } },
  ...over,
})
const igPublished = (n: string, at = '2026-10-08T14:30:00Z') =>
  post(n, { approval: { status: 'approved' } }, { instagram: receipt('published', { postId: `ig-${n}-778899`, publishedAt: at, url: `https://www.instagram.com/reel/abc${n}/` }) })
const manifestText = (posts: unknown[]) => JSON.stringify({ schemaVersion: 1, publishDate: DATE, timezone: 'America/Edmonton', handoffStatus: 'ready', posts })
const videos = [
  { id: 'v1', title: 'post-01.mp4', mimeType: 'video/mp4', owner: WORK },
  { id: 'v2', title: 'post-02.mp4', mimeType: 'video/mp4', owner: WORK },
]

// Content → Publishing → 2026 → 10 → 2026-10-08, all owned by the Work account.
const publishingDrive = (dayFiles: Record<string, unknown>[], manifest: string, extra: Partial<FakeDrive> = {}) =>
  workDrive({
    ...extra,
    meta: { CONTENT: { id: 'CONTENT', title: 'Content', mimeType: FOLDER, owner: WORK }, ...extra.meta },
    children: {
      CONTENT: [{ id: 'PUB', title: 'Publishing', mimeType: FOLDER, owner: WORK }],
      PUB: [{ id: 'Y', title: '2026', mimeType: FOLDER, owner: WORK }],
      Y: [{ id: 'M', title: '10', mimeType: FOLDER, owner: WORK }],
      M: [{ id: 'DAY', title: DATE, mimeType: FOLDER, owner: WORK }],
      DAY: dayFiles,
      ...extra.children,
    },
    docs: { MAN: manifest, ...extra.docs },
  })

// ---- Demo ---------------------------------------------------------------------

describe('demo fixtures', () => {
  for (const surface of SURFACES) {
    test(`are labeled and show every state on ${surface}`, async ($, on) => {
      engineBottom(on)
      const ran = await ops($, 'demo')
      expect(ran.text).toContain('DEMO')
      const lines = await paneLines($, surface)
      const all = lines.join('\n')
      expect(lines[0]).toContain('DEMO FIXTURES · NOT LIVE DATA')
      for (const state of ['SOURCE NOT CONFIGURED', 'ACCESS DENIED', 'STALE', 'MISSING', 'CONFLICT', 'BLOCKED']) {
        expect(all).toContain(`[${state}]`)
      }
      expect(all).toContain('Content BLOCKED: 1 of 2 reported published. TikTok failed: DEMO: upload rejected')
      expect(all).toContain('scheduled time passed with no reported publication on every target')
      expect(all).toMatch(/Social media \[BLOCKED\]/)
      expect(all).toMatch(/Website deployments \[BLOCKED\] LATEST FAILED/)
      expect(all).toMatch(/Audience metrics \[OK\] 2 ACCOUNTS 2 connected accounts, 1,560 followers in total, 2 posts published in the last 7 days/)
      expect(all).toMatch(/Instagram @demo_account \[OK\] 1,250 FOLLOWERS \+50 \(\+4\.2%\) over 30 days/)
      expect(all).not.toMatch(/↳ (OBSERVED|SNAPSHOT|REPORTED) /)
      expect(all).not.toContain('DEMO DEMO')
      for (const line of lines.filter(l => l.includes('↳'))) expect(line).toContain('↳ DEMO FIXTURE · DEMO ')
      expectSourceUnderEveryStatus(lines)
    })
  }
})

// ---- Live sources and scope ---------------------------------------------------------

describe('live sources and scope', () => {
  test(
    'distinguish not configured, access denied, not approved and conflict, read-only',
    { options: { bridgerowFolderId: 'BR', paliosFolderId: 'PAL_DENIED', contentCalendarDocId: '', danceAlchemyFolderId: '' } },
    async ($, on) => {
      engineBottom(on)
      const calls: string[] = []
      fakeDrive(on, workDrive(), calls)
      fakeGithub(on, '2026-10-07T19:43:53Z')
      await ops($, 'refresh')
      const lines = await paneLines($, 'terminal')
      const all = lines.join('\n')

      expect(calls.every(c => /^(search_files|get_file_metadata|download_file_content|exec|accounts_list|accounts_get_follower_stats|analytics_get_analytics):/.test(c))).toBe(true)
      expect(calls.some(c => c.includes('br-login'))).toBe(false)
      expect(calls.some(c => c.includes('download_file_content') && c.includes('br-dec'))).toBe(false)

      expect(all).toContain(`Drive account ${WORK} (verified Oct 8, 09:00)`)
      expect(all).toMatch(/Dance Alchemy automation \[SOURCE NOT CONFIGURED\]/)
      expect(all).toMatch(/Palios inventory \[ACCESS DENIED\]/)
      expect(all).toContain('cannot read paliosFolderId')
      // Another owner is "not approved", never "access denied".
      expect(all).toMatch(/Bridgerow\/DECISIONS \[NOT APPROVED\]/)
      expect(all).toContain('owned by another account and is not in approvedSharedIds')
      expect(all).toMatch(/CURRENT_STATE \[CONFLICT\]/)
      expect(all).toContain('newer activity: commit "Fix footer"')
      expect(all).toContain('— / 2 (no verifiable count)')
      expect(all).toContain('five-hour: 30%')
      expect(all).not.toContain('DEMO')
      expectSourceUnderEveryStatus(lines)
    },
  )

  test('an approved shared document from another owner is read', { options: { bridgerowFolderId: 'BR', approvedSharedIds: 'br-dec' } }, async ($, on) => {
    engineBottom(on)
    const calls: string[] = []
    fakeDrive(on, workDrive(), calls)
    fakeGithub(on, '2026-10-01T00:00:00Z')
    await ops($, 'refresh')
    const all = await pane($)
    expect(calls.some(c => c.includes('download_file_content') && c.includes('br-dec'))).toBe(true)
    expect(all).toContain('BR-P-001')
    expect(all).toContain('approved shared document')
    expect(all).not.toContain('[NOT APPROVED]')
  })

  test('a file that reports no owner is not approved and not read', { options: { bridgerowFolderId: 'BR' } }, async ($, on) => {
    engineBottom(on)
    const calls: string[] = []
    const noOwner = { id: 'br-dec', title: 'DECISIONS', mimeType: DOC, modifiedTime: '2026-10-06T10:00:00Z' }
    fakeDrive(on, workDrive({ children: { BR: [BR_FILES[0]!, noOwner] } }), calls)
    fakeGithub(on, '2026-10-01T00:00:00Z')
    await ops($, 'refresh')
    const all = await pane($)
    expect(all).toMatch(/Bridgerow\/DECISIONS \[NOT APPROVED\]/)
    expect(all).toContain('reports no owner')
    expect(calls.some(c => c.includes('download_file_content') && c.includes('br-dec'))).toBe(false)
  })

  test('a connector signed in as another account reads nothing and caches nothing', { options: { bridgerowFolderId: 'BR' } }, async ($, on) => {
    const store = new Map<string, unknown>([[STORE_KEY, { earlier: true }]])
    engineBottom(on, store)
    const calls: string[] = []
    fakeDrive(on, workDrive({ me: 'someone@else.com' }), calls)
    fakeGithub(on, '2026-10-01T00:00:00Z')
    await ops($, 'refresh')
    const all = await pane($)
    expect(all).toContain(`signed in as another account, not ${WORK}`)
    expect(all).toContain('Drive account NOT VERIFIED')
    expect(all).not.toContain('someone@else.com')
    expect(all).toMatch(/Bridgerow website \[ACCESS DENIED\]/)
    expect(all).not.toContain('Rate card')
    expect(calls.some(c => c.startsWith('download_file_content'))).toBe(false)
    expect(store.has(STORE_KEY)).toBe(false)
  })

  test('an unverifiable connector account reads nothing', { options: { bridgerowFolderId: 'BR' } }, async ($, on) => {
    engineBottom(on)
    fakeDrive(on, workDrive({ me: '' }), [])
    fakeGithub(on, '2026-10-01T00:00:00Z')
    await ops($, 'refresh')
    const all = await pane($)
    expect(all).toContain('could not verify which account the Drive connector is signed in as')
    expect(all).not.toContain('Rate card')
  })

  test('an old document is stale and an absent document is missing', { options: { bridgerowFolderId: 'BR' } }, async ($, on) => {
    engineBottom(on)
    fakeDrive(on, workDrive({ children: { BR: [{ ...BR_FILES[0]!, modifiedTime: '2026-09-20T10:00:00Z' }] } }), [])
    fakeGithub(on, '2026-09-01T00:00:00Z')
    await ops($, 'refresh')
    const lines = await paneLines($, 'terminal')
    const all = lines.join('\n')
    expect(all).toMatch(/BR-Q-003 \[STALE\]/)
    expect(all).toMatch(/Bridgerow\/DECISIONS \[MISSING\]/)
    expect(all).toContain('DECISIONS not found in the configured folder')
    expect(all).not.toContain('[CONFLICT]')
    expectSourceUnderEveryStatus(lines)
  })

})

// ---- Exact-title search ---------------------------------------------------------------

describe('exact-title search', () => {
  const filler = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `f${i}`, title: `note ${i}`, mimeType: DOC, owner: WORK, modifiedTime: '2026-10-06T10:00:00Z' }))

  test('finds a document by exact title among many unrelated items', { options: { bridgerowFolderId: 'BR' } }, async ($, on) => {
    engineBottom(on)
    const calls: string[] = []
    fakeDrive(on, workDrive({ children: { BR: [...filler(250), BR_FILES[0]!] } }), calls)
    fakeGithub(on, '2026-10-01T00:00:00Z')
    await ops($, 'refresh')
    const all = await pane($)
    expect(all).toContain('BR-S-009')
    expect(all).toMatch(/Bridgerow\/DECISIONS \[MISSING\]/)
    expect(calls.some(c => c.includes("parentId = 'BR' and title = 'CURRENT_STATE'"))).toBe(true)
  })

  test('a title search that never finishes is a source error, not a unique match', { options: { bridgerowFolderId: 'BR' } }, async ($, on) => {
    engineBottom(on)
    const copies = Array.from({ length: 600 }, (_, i) => ({ ...BR_FILES[0]!, id: `copy${i}` }))
    fakeDrive(on, workDrive({ children: { BR: [...copies, BR_FILES[1]!] } }), [])
    fakeGithub(on, '2026-10-01T00:00:00Z')
    await ops($, 'refresh')
    const all = await pane($)
    expect(all).toMatch(/Bridgerow\/CURRENT_STATE \[SOURCE ERROR\]/)
    expect(all).toContain('the search for CURRENT_STATE in the configured folder stopped after 5 pages, so a unique match cannot be claimed')
    expect(all).not.toContain('BR-S-009')
    expect(all).not.toMatch(/CURRENT_STATE \[MISSING\]/)
  })

  test('two documents with the same title are a source error', { options: { bridgerowFolderId: 'BR' } }, async ($, on) => {
    engineBottom(on)
    fakeDrive(on, workDrive({ children: { BR: [...BR_FILES, { ...BR_FILES[0]!, id: 'br-state2' }] } }), [])
    fakeGithub(on, '2026-10-01T00:00:00Z')
    await ops($, 'refresh')
    const all = await pane($)
    expect(all).toContain('2 items titled CURRENT_STATE in the configured folder; cannot tell which is current')
    expect(all).not.toContain('BR-S-009')
  })

  test('a title with a quote is escaped in the search', { options: { paliosFolderId: 'PA', paliosDocTitles: "Bob's inventory" } }, async ($, on) => {
    engineBottom(on)
    const calls: string[] = []
    fakeDrive(
      on,
      workDrive({
        meta: { PA: { id: 'PA', title: 'Palios', mimeType: FOLDER, owner: WORK } },
        children: { PA: [{ id: 'pa-inv', title: "Bob's inventory", mimeType: DOC, owner: WORK, modifiedTime: '2026-10-06T10:00:00Z' }] },
        docs: { 'pa-inv': 'PA-I-001 | IN PROGRESS | Count the stock.' },
      }),
      calls,
    )
    fakeGithub(on, '2026-10-01T00:00:00Z')
    await ops($, 'refresh')
    expect(calls.some(c => c.includes("title = 'Bob\\\\'s inventory'"))).toBe(true)
    expect(await pane($)).toContain('PA-I-001')
  })

  const contentOptions = { bridgerowFolderId: 'BR', contentFolderId: 'CONTENT' }
  const PATH = `Publishing/2026/10/${DATE}`

  test("two folders titled with today's date are a source error", { options: contentOptions }, async ($, on) => {
    engineBottom(on)
    const drive = publishingDrive([manifestFile], manifestText([post('01')]))
    drive.children.M = [...drive.children.M!, { id: 'DAY2', title: DATE, mimeType: FOLDER, owner: WORK }]
    fakeDrive(on, drive, [])
    fakeGithub(on, '2026-10-01T00:00:00Z')
    await ops($, 'refresh')
    const all = await pane($)
    expect(all).toContain(`2 items titled ${DATE} in Content/Publishing/2026/10; cannot tell which is current`)
    expect(all).toContain('— / 2 (no verifiable count) [SOURCE ERROR]')
  })

  test("a file titled with today's date is not taken for the day folder", { options: contentOptions }, async ($, on) => {
    engineBottom(on)
    const calls: string[] = []
    const drive = publishingDrive([manifestFile], manifestText([post('01')]))
    drive.children.M = [{ id: 'DAYDOC', title: DATE, mimeType: DOC, owner: WORK }]
    fakeDrive(on, drive, calls)
    fakeGithub(on, '2026-10-01T00:00:00Z')
    await ops($, 'refresh')
    const all = await pane($)
    expect(calls.some(c => c.includes(`parentId = 'M' and title = '${DATE}' and mimeType = '${FOLDER}'`))).toBe(true)
    expect(all).toContain(`No Content/${PATH} folder`)
  })

  test('two manifests in the day folder are a source error', { options: contentOptions }, async ($, on) => {
    engineBottom(on)
    fakeDrive(on, publishingDrive([manifestFile, { ...manifestFile, id: 'MAN2' }], manifestText([post('01')])), [])
    fakeGithub(on, '2026-10-01T00:00:00Z')
    await ops($, 'refresh')
    const all = await pane($)
    expect(all).toContain(`2 items titled manifest.json in Content/${PATH}; cannot tell which is current`)
    expect(all).not.toContain('reported published: 0 / 2')
  })
})

// ---- Content, live --------------------------------------------------------------------

describe('content, live', () => {
  const options = { bridgerowFolderId: 'BR', contentFolderId: 'CONTENT' }

  test('a Content folder with no Publishing folder is missing, not zero', { options }, async ($, on) => {
    engineBottom(on)
    fakeDrive(on, workDrive({ meta: { CONTENT: { id: 'CONTENT', title: 'Content', mimeType: FOLDER, owner: WORK } }, children: { CONTENT: [] } }), [])
    fakeGithub(on, '2026-10-01T00:00:00Z')
    await ops($, 'refresh')
    const all = await pane($)
    expect(all).toContain('— / 2 (no verifiable count) [MISSING]')
    expect(all).toContain('Content/Publishing does not exist yet, so nothing has been packaged for publishing')
    expect(all).not.toContain('0 / 2')
  })

  test('a Publishing folder with no folder for today is missing, not zero', { options }, async ($, on) => {
    engineBottom(on)
    const drive = publishingDrive([], '')
    drive.children.M = [{ id: 'old', title: '2026-10-07', mimeType: FOLDER, owner: WORK }]
    drive.children.old = []
    fakeDrive(on, drive, [])
    fakeGithub(on, '2026-10-01T00:00:00Z')
    await ops($, 'refresh')
    const all = await pane($)
    expect(all).toContain('— / 2 (no verifiable count)')
    expect(all).toContain('No Content/Publishing/2026/10/2026-10-08 folder')
    expect(all).not.toContain('0 / 2')
  })

  test('a valid manifest with nothing published is a verified zero', { options }, async ($, on) => {
    engineBottom(on)
    fakeDrive(on, publishingDrive([manifestFile, ...videos], manifestText([post('01'), post('02')])), [])
    fakeGithub(on, '2026-10-01T00:00:00Z')
    await ops($, 'refresh')
    const all = await pane($)
    expect(all).toContain('reported published: 0 / 2')
    expect(all).toContain('[VERIFIED ZERO]')
    expect(all).toContain('↳ REPORTED · Drive: Content/Publishing/2026/10/2026-10-08/manifest.json')
  })

  test('a malformed manifest shows a source error, not a count', { options }, async ($, on) => {
    engineBottom(on)
    fakeDrive(on, publishingDrive([manifestFile], JSON.stringify({ posts: [{ status: 'published', published_url: 'https://x' }] })), [])
    fakeGithub(on, '2026-10-01T00:00:00Z')
    await ops($, 'refresh')
    const all = await pane($)
    expect(all).toContain('— / 2 (no verifiable count) [SOURCE ERROR]')
    expect(all).toContain('manifest.json is invalid')
  })

  test('a manifest owned by another account is not approved and not read', { options }, async ($, on) => {
    engineBottom(on)
    const calls: string[] = []
    fakeDrive(on, publishingDrive([{ ...manifestFile, owner: 'muse@vendor.example' }], manifestText([post('01')])), calls)
    fakeGithub(on, '2026-10-01T00:00:00Z')
    await ops($, 'refresh')
    const all = await pane($)
    expect(all).toContain('— / 2 (no verifiable count) [NOT APPROVED]')
    expect(calls.some(c => c.includes('download_file_content') && c.includes('MAN'))).toBe(false)
  })

  test('a calendarSlot from another day is flagged on the post', { options: { ...options, contentCalendarDocId: 'CAL', contentCalendarStartDate: '2026-10-07' } }, async ($, on) => {
    engineBottom(on)
    const calendar = ['Status: APPROVED.', 'Slot: Day 1, Video A (use AI).', 'Slot: Day 1, Video B (apply AI).', 'Slot: Day 2, Video A (use AI).', 'Slot: Day 2, Video B (apply AI).'].join('\n')
    const drive = publishingDrive(
      [manifestFile, ...videos],
      manifestText([post('01', { content: { calendarSlot: 'Day 1A' } }), post('02', { content: { calendarSlot: 'Day 2, Video B' } })]),
      { meta: { CAL: { id: 'CAL', title: 'Week 1 calendar', mimeType: DOC, owner: WORK, modifiedTime: '2026-10-05T00:00:00Z' } }, docs: { CAL: calendar } },
    )
    fakeDrive(on, drive, [])
    fakeGithub(on, '2026-10-01T00:00:00Z')
    await ops($, 'refresh')
    const all = await pane($)
    expect(all).toContain('reported published: 0 / 2')
    expect(all).toContain('[CONFLICT]')
    expect(all).toContain('IDEA: calendarSlot Day 1A is not scheduled for 2026-10-08 (today: Day 2A, Day 2B)')
    expect(all).toContain(`Content CONFLICT: 0 of 2 reported published. post-01: calendarSlot Day 1A is not scheduled`)
    expect(all).toMatch(/^post-01 ✕/m)
    expect(all).toMatch(/^post-02 ●/m)
  })

  test('conflicts use the receipt time, not the manifest file time', { options }, async ($, on) => {
    engineBottom(on)
    // CURRENT_STATE was edited at 14:00Z and the manifest file at 13:00Z
    // (older); the receipt says the post went live at 14:30Z (newer).
    const drive = publishingDrive([manifestFile, ...videos], manifestText([igPublished('01'), post('02')]), {
      children: { BR: [{ ...BR_FILES[0]!, modifiedTime: '2026-10-08T14:00:00Z' }] },
      docs: { 'br-state': 'BR-A-008 | PROPOSED / NOT ACTIVATED | Validate the Muse publishing route; no publishing is activated.' },
    })
    fakeDrive(on, drive, [])
    fakeGithub(on, '2026-10-01T00:00:00Z')
    await ops($, 'refresh')
    const all = await pane($)
    expect(all).toContain('reported published: 1 / 2')
    expect(all).toContain(`says publishing is not live, but reported publication of BR-${COMPACT}-01 on instagram is dated 2026-10-08T14:30:00.000Z`)
  })
})

// ---- Social media ----------------------------------------------------------------------

describe('social media', () => {
  const options = { bridgerowFolderId: 'BR', contentFolderId: 'CONTENT', socialAccounts: 'instagram=@bridgerow_solutions' }

  test('per-platform reported posts come from the manifests, metrics are not connected', { options: { ...options, zernioServer: '' } }, async ($, on) => {
    engineBottom(on)
    fakeDrive(on, publishingDrive([manifestFile, ...videos], manifestText([igPublished('01'), post('02')])), [])
    fakeGithub(on, '2026-10-01T00:00:00Z')
    await ops($, 'refresh')
    const lines = await paneLines($, 'terminal')
    const all = lines.join('\n')
    expect(all).toMatch(/Instagram \[OK\] 1 REPORTED POST 1 reported published of 2 targeted \(1 of 7 days had a valid manifest\)/)
    expect(all).toContain('account @bridgerow_solutions (from settings, not verified with Instagram)')
    expect(all).toMatch(/TikTok \[VERIFIED ZERO\] 0 REPORTED POSTS/)
    expect(all).toMatch(/Facebook \[SOURCE NOT CONFIGURED\] NOT TARGETED/)
    expect(all).toMatch(/Audience metrics \[SOURCE NOT CONFIGURED\] NOT CONNECTED no Zernio connector set \(setting zernioServer\)/)
    expect(all).toContain('No numbers are shown or estimated.')
    expect(all).toContain('↳ REPORTED · Drive: Content/Publishing manifests, last 7 days')
    expect(all).not.toContain('Social media VERIFIED ZERO')
    expect(all).not.toContain('Social media SOURCE NOT CONFIGURED')
    expectSourceUnderEveryStatus(lines)
  })

  test('no Publishing folder means no count on any platform', { options }, async ($, on) => {
    engineBottom(on)
    fakeDrive(on, workDrive({ meta: { CONTENT: { id: 'CONTENT', title: 'Content', mimeType: FOLDER, owner: WORK } }, children: { CONTENT: [] } }), [])
    fakeGithub(on, '2026-10-01T00:00:00Z')
    await ops($, 'refresh')
    const all = await pane($)
    expect(all).toMatch(/Instagram \[MISSING\] NO COUNT/)
    expect(all).not.toContain('REPORTED POST')
  })

  test('a failed upload is listed under Needs you', { options }, async ($, on) => {
    engineBottom(on)
    const failed = post('01', { approval: { status: 'approved' } }, { tiktok: receipt('failed', { error: 'video too long' }) })
    fakeDrive(on, publishingDrive([manifestFile, ...videos], manifestText([failed, post('02')])), [])
    fakeGithub(on, '2026-10-01T00:00:00Z')
    await ops($, 'refresh')
    const all = await pane($)
    expect(all).toMatch(/Social media BLOCKED: TikTok: .*1 failed or not counted/)
  })
})

// ---- Zernio ----------------------------------------------------------------------------

describe('zernio', () => {
  const options = { bridgerowFolderId: 'BR' }
  const accounts = 'Found 2 connected account(s):\n\n- instagram: bridgerow_solutions (ID: ig1)\n- tiktok: bridgerow (ID: tt1)'
  const followers = {
    accounts: [
      { _id: 'ig1', platform: 'instagram', username: 'bridgerow_solutions', currentFollowers: 1250, growth: 50, growthPercentage: 4.17, dataPoints: 30 },
      { _id: 'tt1', platform: 'tiktok', username: 'bridgerow', currentFollowers: 300, growth: -3, growthPercentage: -0.99, dataPoints: 30 },
    ],
  }
  const posts = {
    posts: [
      {
        postId: 'p1',
        status: 'published',
        publishedAt: '2026-10-07T18:00:00Z',
        platformAnalytics: [
          { platform: 'instagram', status: 'published', accountId: 'ig1', accountUsername: 'bridgerow_solutions', platformPostUrl: 'https://www.instagram.com/reel/abc/?igsh=x', analytics: { views: 1200, likes: 80, comments: 9, shares: 4, engagementRate: 7.8 } },
          { platform: 'tiktok', status: 'published', accountId: 'tt1', accountUsername: 'bridgerow', platformPostUrl: 'https://www.tiktok.com/@bridgerow/video/1', analytics: { views: 400, likes: 20, comments: 1, shares: 0, engagementRate: 5.4 } },
        ],
      },
      { postId: 'p2', status: 'scheduled', platform: 'instagram', accountId: 'ig1', analytics: { views: 999 } },
    ],
  }

  test('accounts, followers and post numbers are read with read-only tools', { options }, async ($, on) => {
    engineBottom(on)
    const calls: string[] = []
    fakeDrive(on, { ...workDrive(), zernio: { accounts, followers, posts } }, calls)
    fakeGithub(on, '2026-10-01T00:00:00Z')
    await ops($, 'refresh')
    const lines = await paneLines($, 'terminal')
    const all = lines.join('\n')
    expect(all).toContain('Audience metrics [OK] 2 ACCOUNTS 2 connected accounts, 1,550 followers in total, 2 posts published in the last 7 days, 1,600 views, 100 likes, 10 comments, 4 shares, average engagement 6.6%')
    expect(all).toContain('Instagram bridgerow_solutions [OK] 1,250 FOLLOWERS +50 (+4.2%) over 30 days; 1 post in the last 7 days, 1,200 views, 80 likes, 9 comments, 4 shares, average engagement 7.8%')
    expect(all).toContain('TikTok bridgerow [OK] 300 FOLLOWERS -3 (-1.0%) over 30 days')
    expect(all).toContain('Instagram post 2026-10-07 [OK] 1,200 VIEWS account bridgerow_solutions, 80 likes, 9 comments, 4 shares, average engagement 7.8%')
    expect(all).not.toContain('999')
    expect(all).toContain('↳ OBSERVED · Zernio (plugin:zernio:zernio), followers last 30 days, posts last 7 days')
    expect(all).not.toContain('Audience metrics:')
    const zernio = calls.filter(c => /^(accounts_|analytics_)/.test(c))
    expect(zernio.map(c => c.split(':')[0])).toEqual(['accounts_list', 'accounts_get_follower_stats', 'analytics_get_analytics'])
    expect(zernio[1]).toContain('"from_date":"2026-09-08"')
    expect(zernio[2]).toContain('"from_date":"2026-10-02"')
    expectSourceUnderEveryStatus(lines)
  })

  test('follower counts without the Analytics add-on say why, and post numbers still show', { options }, async ($, on) => {
    engineBottom(on)
    fakeDrive(on, { ...workDrive(), zernio: { accounts, followersError: '403 Requires analytics add-on subscription', posts } }, [])
    fakeGithub(on, '2026-10-01T00:00:00Z')
    await ops($, 'refresh')
    const all = await pane($)
    expect(all).toMatch(/Audience metrics \[SOURCE ERROR\] 2 ACCOUNTS .*follower counts not available \(Zernio's Analytics add-on is needed: 403/)
    expect(all).toContain('Instagram bridgerow_solutions [SOURCE ERROR] FOLLOWERS UNKNOWN follower count not available; 1 post in the last 7 days, 1,200 views')
    expect(all).not.toContain('FOLLOWERS +')
  })

  test('a connector that is not connected shows no numbers', { options }, async ($, on) => {
    engineBottom(on)
    const calls: string[] = []
    fakeDrive(on, workDrive(), calls)
    fakeGithub(on, '2026-10-01T00:00:00Z')
    await ops($, 'refresh')
    const all = await pane($)
    expect(all).toMatch(/Audience metrics \[ACCESS DENIED\] NOT CONNECTED the Zernio connector \(plugin:zernio:zernio\) could not be read/)
    expect(all).toContain('No numbers are shown or estimated.')
    expect(all).not.toContain('FOLLOWERS')
    expect(calls.filter(c => /^(accounts_|analytics_)/.test(c)).map(c => c.split(':')[0])).toEqual(['accounts_list'])
  })

  test('no connected accounts is said plainly', { options }, async ($, on) => {
    engineBottom(on)
    fakeDrive(on, { ...workDrive(), zernio: {} }, [])
    fakeGithub(on, '2026-10-01T00:00:00Z')
    await ops($, 'refresh')
    const all = await pane($)
    expect(all).toMatch(/Audience metrics \[SOURCE NOT CONFIGURED\] NO ACCOUNTS Zernio answered, but no social account is connected to it yet/)
  })
})

// ---- Website ---------------------------------------------------------------------------

describe('website', () => {
  const failing = {
    deployments: [
      { id: 2, environment: 'Preview', created_at: '2026-10-08T12:00:00Z', state: 'failure', url: 'https://bar-inventory-abc.vercel.app' },
      { id: 1, environment: 'Preview', created_at: '2026-10-07T12:00:00Z', state: 'failure' },
    ],
  }

  test('failed deployments, no production and no analytics are shown from GitHub', { options: { bridgerowFolderId: 'BR', websiteUrl: '' } }, async ($, on) => {
    engineBottom(on)
    fakeDrive(on, workDrive(), [])
    fakeGithub(on, '2026-10-01T00:00:00Z', 'Fix footer', [], failing)
    await ops($, 'refresh')
    const lines = await paneLines($, 'terminal')
    const all = lines.join('\n')
    expect(all).toMatch(/Website deployments \[BLOCKED\] LATEST FAILED/)
    expect(all).toContain('2 of the last 2 failed; no production deployment is recorded on GitHub (the public site may be hosted elsewhere')
    expect(all).toContain('Bridgerow website BLOCKED: Website deployments:')
    expect(all).toMatch(/Website traffic \[SOURCE NOT CONFIGURED\] NO ANALYTICS/)
    expect(all).toMatch(/Public site \[SOURCE NOT CONFIGURED\] NOT SET/)
    expect(all).not.toContain('Bridgerow website SOURCE NOT CONFIGURED')
    expectSourceUnderEveryStatus(lines)
  })

  test('an analytics script without read access is not connected, never a number', { options: { bridgerowFolderId: 'BR', websiteUrl: '' } }, async ($, on) => {
    engineBottom(on)
    fakeDrive(on, workDrive(), [])
    fakeGithub(on, '2026-10-01T00:00:00Z', 'Fix footer', [], { html: '<script defer src="/_vercel/insights/script.js"></script>' })
    await ops($, 'refresh')
    const all = await pane($)
    expect(all).toMatch(/Website traffic \[SOURCE NOT CONFIGURED\] NOT CONNECTED Vercel Web Analytics is on the page/)
  })

  test('the public site is checked when a URL is set', { options: { bridgerowFolderId: 'BR', websiteUrl: 'https://bridgerow.example' } }, async ($, on) => {
    engineBottom(on)
    const calls: string[] = []
    fakeDrive(on, workDrive(), [])
    const live = '<title>Bridgerow Solutions</title><script async src="https://bridgerow.ca/.netlify/scripts/hud"></script>'
    fakeGithub(on, '2026-10-01T00:00:00Z', 'Fix footer', [], { live: { status: 200, text: live }, calls, html: '<script src="/_vercel/insights/script.js"></script>' })
    await ops($, 'refresh')
    const all = await pane($)
    expect(all).toMatch(/Public site \[OK\] HTTP 200/)
    expect(all).toContain('page title "Bridgerow Solutions", served by Netlify')
    // Analytics are judged from the live page, not the repository's copy.
    expect(all).toMatch(/Website traffic \[SOURCE NOT CONFIGURED\] NO ANALYTICS/)
    expect(all).toContain('↳ OBSERVED · https://bridgerow.example')
    expect(calls.some(u => u.includes('/contents/index.html'))).toBe(false)
    expect(calls.filter(u => u.startsWith('https://bridgerow.example'))).toHaveLength(1)
  })

  test('an unreachable public site is blocked', { options: { bridgerowFolderId: 'BR', websiteUrl: 'https://bridgerow.example' } }, async ($, on) => {
    engineBottom(on)
    fakeDrive(on, workDrive(), [])
    fakeGithub(on, '2026-10-01T00:00:00Z', 'Fix footer', [], { live: 'down' })
    await ops($, 'refresh')
    expect(await pane($)).toMatch(/Public site \[BLOCKED\] UNREACHABLE/)
  })
})

// ---- PostHog ------------------------------------------------------------------

describe('posthog', () => {
  const options = { bridgerowFolderId: 'BR', websiteUrl: 'https://bridgerow.example' }
  const page = (html: string) => ({ live: { status: 200, text: html } })

  test('an empty project says no data yet and shows no numbers', { options }, async ($, on) => {
    engineBottom(on)
    const calls: string[] = []
    fakeDrive(on, workDrive(), calls)
    fakeGithub(on, '2026-10-01T00:00:00Z', 'Fix footer', [], page('<title>Bridgerow</title>'))
    await ops($, 'refresh')
    const all = await pane($)
    expect(all).toMatch(/PostHog \[SOURCE NOT CONFIGURED\] NO DATA YET PostHog project Default project has received no events, and the PostHog snippet is not on the public page yet/)
    expect(all).not.toContain('PostHog:')
    expect(calls.filter(c => c.startsWith('exec:'))).toHaveLength(1)
  })

  test('visitors, top pages and sources are read with read-only commands', { options }, async ($, on) => {
    engineBottom(on)
    const calls: string[] = []
    const posthog = {
      ingested: true,
      overview: { visitors: 42, views: 120, sessions: 50, 'session duration': 65, 'bounce rate': 0.41 },
      pages: [['/', 30], ['/#services', 8]] as [string, number][],
      channels: [['Direct', 25], ['Organic Search', 12]] as [string, number][],
    }
    fakeDrive(on, { ...workDrive(), posthog }, calls)
    fakeGithub(on, '2026-10-01T00:00:00Z', 'Fix footer', [], page('<script>posthog.init("phc_x",{api_host:"https://us.i.posthog.com"})</script>'))
    await ops($, 'refresh')
    const lines = await paneLines($, 'terminal')
    const all = lines.join('\n')
    expect(all).toContain('Website visitors [OK] 42 VISITORS 42 visitors, 120 pageviews, 50 sessions, average session 65 s, bounce rate 41%')
    expect(all).toContain('Top pages [OK] VISITORS BY PAGE / 30, /#services 8')
    expect(all).toContain('Traffic sources [OK] VISITORS BY CHANNEL Direct 25, Organic Search 12')
    expect(all).toContain('↳ OBSERVED · PostHog project Default project, last 7 days')
    expect(all).toMatch(/Website traffic \[OK\] CONNECTED PostHog is on the page/)
    const commands = calls.filter(c => c.startsWith('exec:')).map(c => JSON.parse(c.slice(5)).command as string)
    expect(commands).toHaveLength(4)
    for (const command of commands) expect(command).toMatch(/^call --json (project-get|query-web-overview|query-web-stats) \{/)
    expectSourceUnderEveryStatus(lines)
  })

  test('another active project is not read', { options }, async ($, on) => {
    engineBottom(on)
    const calls: string[] = []
    fakeDrive(on, { ...workDrive(), posthog: { projectId: 999, ingested: true } }, calls)
    fakeGithub(on, '2026-10-01T00:00:00Z')
    await ops($, 'refresh')
    const all = await pane($)
    expect(all).toMatch(/PostHog \[SOURCE ERROR\]/)
    expect(all).toContain("the PostHog connector's active project is not 657204")
    expect(calls.filter(c => c.startsWith('exec:'))).toHaveLength(1)
  })

  test('a missing connector is access denied', { options }, async ($, on) => {
    engineBottom(on)
    fakeDrive(on, { ...workDrive(), posthog: { down: true } }, [])
    fakeGithub(on, '2026-10-01T00:00:00Z')
    await ops($, 'refresh')
    expect(await pane($)).toMatch(/PostHog \[ACCESS DENIED\] ACCESS DENIED the PostHog connector \(claude\.ai PostHog\) could not be read/)
  })
})

// ---- Needs you ---------------------------------------------------------------------

describe('needs you', () => {
  test('an approval request from a healthy document is listed', { options: { bridgerowFolderId: 'BR' } }, async ($, on) => {
    engineBottom(on)
    fakeDrive(on, workDrive({ children: { BR: [{ ...BR_FILES[0]!, modifiedTime: '2026-10-08T14:00:00Z' }] } }), [])
    fakeGithub(on, '2026-10-01T00:00:00Z')
    await ops($, 'refresh')
    const all = await pane($)
    expect(all).toMatch(/BR-S-009 \[OK\]/)
    expect(all).toContain('Sales & offers NEEDS YOUR DECISION: BR-S-009 Rate card. Owner: user review.')
  })
})

// ---- Secrets and the cache ---------------------------------------------------------------

describe('secrets and cache', () => {
  const SECRET_DOC = [
    'BR-A-010 | READY password=hunter2 | Rotate {"api_key": "AbCd1234EfGh5678"} for the site.',
    'BR-A-011 | READY | Login at https://elia:pa55word@example.com/admin?access_token=zzzTOPSECRETzzz now.',
    'BR-A-012 | READY | Keys AKIAABCDEFGHIJKLMNOP and eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.abcdefghijk_lmn.',
    'BR-A-013 | READY | Set {"password": "my secret pass, v2!"} and api_key=\'a b\\\'c\' today.',
  ].join('\n')
  const SECRETS = [
    'hunter2',
    'AbCd1234EfGh5678',
    'pa55word',
    'zzzTOPSECRETzzz',
    'AKIAABCDEFGHIJKLMNOP',
    'eyJzdWIiOiIxMjM0NSJ9',
    'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    'abcdef123456',
    'secret pass',
    'v2!',
    'a b',
  ]

  test('secrets never reach the pane or the cache, and the cache holds no record text', { options: { bridgerowFolderId: 'BR' } }, async ($, on) => {
    const store = new Map<string, unknown>()
    engineBottom(on, store)
    fakeDrive(on, workDrive({ docs: { 'br-state': SECRET_DOC } }), [])
    fakeGithub(on, '2026-10-07T19:43:53Z', 'Use ghp_abcdefghijklmnopqrstuvwxyz0123456789 temporarily', [
      { number: 7, title: 'Add token=abcdef123456 to config', base: 'bridgerow-website', updated: '2026-10-08T12:00:00Z' },
    ])
    await ops($, 'refresh')
    const all = await pane($)
    const cached = JSON.stringify(store.get(STORE_KEY))
    for (const secret of SECRETS) {
      expect(all).not.toContain(secret)
      expect(cached).not.toContain(secret)
    }
    expect(all).toContain('[redacted]')
    expect(cached).not.toContain('Rotate')
    expect(cached).not.toContain('"detail"')
    expect(cached).not.toContain('"url"')
    expect(cached).not.toContain('"agents"')
    expect(cached).toContain(`"account":"${WORK}"`)
  })

  test('a cache from other settings or another account is dropped at session start', async ($, on) => {
    const store = new Map<string, unknown>()
    engineBottom(on, store)
    store.set(STORE_KEY, { version: 3, fingerprint: 'other settings', account: 'someone@else.com', refreshedAt: NOW - DAY, rows: [], content: { posts: [] } })
    await $.session.start(START)
    expect(store.has(STORE_KEY)).toBe(false)
    expect(await pane($)).toContain('No live data yet')
  })

  // GitHub answers at once until armed; once armed it waits for release, so
  // the pane can be read in the middle of a refresh.
  function gatedGithub(on: On) {
    let armed: { reached: () => void; gate: Promise<void> } | undefined
    on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: 'no gh', isStdoutTruncated: false, isStderrTruncated: false } }))
    on('http.fetch', async (_$, e) => {
      if (armed) {
        armed.reached()
        await armed.gate
      }
      const body = String(e.url).includes('/commits')
        ? [{ sha: 'a', html_url: 'https://github.com/x/y/commit/a', commit: { message: 'Fix footer', committer: { date: '2026-10-01T00:00:00Z' } } }]
        : []
      return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(body) } }
    })
    return {
      arm() {
        let reached = () => {}
        let release = () => {}
        const hit = new Promise<void>(r => (reached = r))
        armed = { reached, gate: new Promise<void>(r => (release = r)) }
        return { hit, release: () => { armed = undefined; release() } }
      },
    }
  }

  test('a cache is held back at session start until the connector is verified', { options: { bridgerowFolderId: 'BR' } }, async ($, on) => {
    const store = new Map<string, unknown>()
    engineBottom(on, store)
    fakeDrive(on, workDrive(), [])
    fakeGithub(on, '2026-10-01T00:00:00Z')
    await ops($, 'refresh')
    expect(await pane($)).toContain('Rate card')
    await $.session.start(START)
    const all = await pane($)
    expect(all).toContain('held back until a refresh verifies the Drive connector account')
    expect(all).not.toContain('BR-S-009')
    expect(all).not.toContain('CACHED')
    expect(store.has(STORE_KEY)).toBe(true)
  })

  test('a held cache shows only after the connector is re-verified, never as verified', { options: { bridgerowFolderId: 'BR' } }, async ($, on) => {
    const store = new Map<string, unknown>()
    engineBottom(on, store)
    fakeDrive(on, workDrive(), [])
    const github = gatedGithub(on)
    await ops($, 'refresh')
    await $.session.start(START)

    const gate = github.arm()
    const running = ops($, 'refresh')
    await gate.hit
    const during = await pane($)
    gate.release()
    await running
    // While the refresh runs: the cached statuses, the account they were
    // cached under, and when the connector was checked again.
    expect(during).toContain(`CACHED from Oct 8, 09:00 (0s ago) under ${WORK} · connector re-verified Oct 8, 09:00`)
    expect(during).toContain('BR-S-009')
    expect(during).not.toContain('Rate card')
    expect(during).not.toContain('(verified')
    const after = await pane($)
    expect(after).toContain(`Drive account ${WORK} (verified Oct 8, 09:00)`)
    expect(after).toContain('Rate card')
    expect(after).not.toContain('CACHED')
  })

  test('a held cache is deleted unseen when the connector is another account', { options: { bridgerowFolderId: 'BR' } }, async ($, on) => {
    const store = new Map<string, unknown>()
    engineBottom(on, store)
    const drive = workDrive()
    fakeDrive(on, drive, [])
    const github = gatedGithub(on)
    await ops($, 'refresh')
    await $.session.start(START)

    drive.me = 'someone@else.com'
    const gate = github.arm()
    const running = ops($, 'refresh')
    await gate.hit
    const during = await pane($)
    gate.release()
    await running
    expect(during).not.toContain('BR-S-009')
    expect(during).not.toContain('CACHED')
    expect(store.has(STORE_KEY)).toBe(false)
    const after = await pane($)
    expect(after).toContain('Drive account NOT VERIFIED')
    expect(after).not.toContain('BR-S-009')
  })

  test('/ops clear-cache deletes the cache and the held view', { options: { bridgerowFolderId: 'BR' } }, async ($, on) => {
    const store = new Map<string, unknown>()
    engineBottom(on, store)
    fakeDrive(on, workDrive(), [])
    fakeGithub(on, '2026-10-01T00:00:00Z')
    await ops($, 'refresh')
    await $.session.start(START)
    const ran = await ops($, 'clear-cache')
    expect(ran.text).toContain('cache cleared')
    expect(store.has(STORE_KEY)).toBe(false)
    const all = await pane($)
    expect(all).toContain('No live data yet')
    expect(all).not.toContain('held back')
  })

  test('demo never leaks into live data or the live cache', { options: { bridgerowFolderId: 'BR' } }, async ($, on) => {
    const store = new Map<string, unknown>()
    engineBottom(on, store)
    fakeDrive(on, workDrive(), [])
    fakeGithub(on, '2026-10-01T00:00:00Z')
    await ops($, 'refresh')
    await ops($, 'demo')
    expect([...store.keys()]).toEqual([STORE_KEY])
    expect(JSON.stringify(store.get(STORE_KEY))).not.toContain('DEMO')
    await ops($, 'live')
    const all = await pane($)
    expect(all).toContain('LIVE ·')
    expect(all).not.toContain('DEMO')
  })
})

// ---- GitHub and agents ----------------------------------------------------------------

const agentCall = ($: Engine, id = 'tu-9', description = 'Check the build') =>
  $.tool.call({ tool: 'Agent', tool_use_id: id, description, prompt: 'x', subagent_type: 'general-purpose' } as never)

describe('github and agents', () => {
  test('only pull requests into the configured branch count', { options: { bridgerowFolderId: 'BR' } }, async ($, on) => {
    engineBottom(on)
    fakeDrive(on, workDrive(), [])
    fakeGithub(on, '2026-10-01T00:00:00Z', 'Fix footer', [
      { number: 11, title: 'Website services page', base: 'bridgerow-website', updated: '2026-10-08T12:00:00Z' },
      { number: 12, title: 'Unrelated main change', base: 'main', updated: '2026-10-08T13:00:00Z' },
    ])
    await ops($, 'refresh')
    const all = await pane($)
    expect(all).toContain('PR #11 Website services page')
    expect(all).not.toContain('PR #12')
  })

  test('agent activity shows without a manual refresh', { options: { bridgerowFolderId: 'BR' } }, async ($, on) => {
    engineBottom(on)
    fakeDrive(on, workDrive(), [])
    fakeGithub(on, '2026-10-01T00:00:00Z')
    on('tool.call', () => ({ result: { status: 'completed' }, text: 'done' }) as never)
    await ops($, 'refresh')
    expect(await pane($)).not.toContain('Draft week 2 scripts')
    await agentCall($, 'tu-1', 'Draft week 2 scripts')
    const all = await pane($)
    expect(all).toContain('Draft week 2 scripts')
    expect(all).toContain('returned a result')
  })
})

// ---- The Agent/Task interception ---------------------------------------------------

describe('agent interception', () => {
  test('runs the call once when bookkeeping after it fails', async ($, on) => {
    engineBottom(on, undefined, false)
    let clockCalls = 0
    on('clock.now', () => {
      clockCalls += 1
      if (clockCalls >= 2) throw new Error('clock down')
      return { value: NOW }
    })
    let runs = 0
    on('tool.call', () => {
      runs += 1
      return { result: { status: 'completed' }, text: 'done' } as never
    })
    const result = await agentCall($)
    expect(runs).toBe(1)
    expect((result as { text?: string }).text).toBe('done')
  })

  test('runs the call once when bookkeeping before it fails', async ($, on) => {
    engineBottom(on, undefined, false)
    on('clock.now', () => {
      throw new Error('clock down')
    })
    let runs = 0
    on('tool.call', () => {
      runs += 1
      return { result: { status: 'completed' }, text: 'done' } as never
    })
    const result = await agentCall($)
    expect(runs).toBe(1)
    expect((result as { text?: string }).text).toBe('done')
  })

  test('a failing call runs once and its error result stands', async ($, on) => {
    engineBottom(on)
    let runs = 0
    on('tool.call', () => {
      runs += 1
      return { result: { status: 'failed' }, text: 'subagent crashed', isError: true } as never
    })
    const result = await agentCall($)
    expect(runs).toBe(1)
    expect((result as { isError?: boolean }).isError).toBe(true)
  })

  // The test engine turns a throwing tool into its own error ("no
  // implementation"); that error is what the hook receives from next, so the
  // caller must get exactly it back, and the pane must name it.
  test('a call that throws is shown blocked and the original error is rethrown', { options: { bridgerowFolderId: 'BR' } }, async ($, on) => {
    engineBottom(on)
    fakeDrive(on, workDrive(), [])
    fakeGithub(on, '2026-10-01T00:00:00Z')
    let runs = 0
    on('tool.call', () => {
      runs += 1
      throw new Error('boom')
    })
    await ops($, 'refresh')
    let caught: unknown
    try {
      await agentCall($, 'tu-boom', 'Render post-02')
    } catch (error) {
      caught = error
    }
    expect(runs).toBe(1)
    expect(caught).toBeInstanceOf(Error)
    const original = (caught as Error).message
    expect(original).toBe('no implementation for tool.call')
    const all = await pane($)
    expect(all).toContain(`blocked   Render post-02 · this session`)
    expect(all).toContain(`threw: ${original}`)
    expect(all).toContain(`Agent BLOCKED: Render post-02 (threw: ${original})`)
  })

  test('other tools pass straight through', async ($, on) => {
    engineBottom(on)
    let runs = 0
    on('tool.call', () => {
      runs += 1
      return { result: { stdout: 'ok' }, text: 'ok' } as never
    })
    await $.tool.call({ tool: 'Bash', command: 'true' } as never)
    expect(runs).toBe(1)
  })
})

// ---- Filter ---------------------------------------------------------------------------

describe('filter', () => {
  test('narrows the pane to one project', async ($, on) => {
    engineBottom(on)
    await ops($, 'demo')
    await ops($, 'palios')
    const all = await pane($)
    expect(all).toContain('Palios inventory')
    expect(all).not.toContain('Content pipeline')
    expect(all).not.toContain('Dance Alchemy automation')
  })

  test('/ops social shows only social media', async ($, on) => {
    engineBottom(on)
    await ops($, 'demo')
    await ops($, 'social')
    const all = await pane($)
    expect(all).toContain('Social media')
    expect(all).toContain('Audience metrics')
    expect(all).not.toContain('Content pipeline')
    expect(all).not.toContain('Palios inventory')
  })
})

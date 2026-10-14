// The pure rules: records, redaction, publication evidence, manifests, ideas
// and conflicts. No engine; each case is a regression for a review finding.

import { describe, expect, test } from 'claude-code/testing'

import type { Activity, StatusRow } from '../types'
import {
  deploymentRow,
  detectConflicts,
  evaluateContentDay,
  liveSiteRow,
  parseAccounts,
  socialRows,
  parseZernioAccounts,
  parseZernioFollowers,
  parseZernioPosts,
  thousands,
  zernioRows,
  trafficRow,
  freshness,
  isDeniedTitle,
  parseCalendar,
  parseRecords,
  publicationUrlProblem,
  receiptProblem,
  redact,
  sanitizeDeep,
  sanitizeText,
  validateManifest,
  type ContentInputs,
  type DriveFile,
} from '../hooks/model'

const NOW = Date.parse('2026-10-08T15:00:00Z') // 09:00 in Edmonton
const DAY = 24 * 60 * 60 * 1000
const DATE = '2026-10-08'

const COMPACT = DATE.replace(/-/g, '')
const manifest = (posts: unknown[], extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  publishDate: DATE,
  timezone: 'America/Edmonton',
  handoffStatus: 'ready',
  posts,
  ...extra,
})
const receipt = (status = 'not_started', over: Record<string, unknown> = {}) => ({
  status,
  postId: null,
  publishedAt: null,
  url: null,
  error: null,
  ...over,
})
const igReceipt = (n: string, over: Record<string, unknown> = {}) =>
  receipt('published', { postId: `ig-${n}-778899`, publishedAt: '2026-10-08T14:30:00Z', url: `https://www.instagram.com/reel/abc${n}/`, ...over })
// The shape of the TEST-001 manifest written by frozen packaging V1.
const draft = (n: string, over: Record<string, unknown> = {}) => ({
  id: `BR-${COMPACT}-${n}`,
  slot: Number(n),
  content: { workingTitle: `Post ${n}`, pillar: 'Automate' },
  media: { file: `post-${n}.mp4`, mimeType: 'video/mp4', width: 1080, height: 1920 },
  approval: { status: 'pending', approvedAt: null, approvedBy: null },
  copy: { masterCaption: 'caption', masterTitle: null, hashtags: ['#smallbusiness'] },
  targets: { instagram: { enabled: true, caption: null }, tiktok: { enabled: true, caption: null }, youtubeShorts: { enabled: true, title: null, description: null } },
  schedule: { publishAt: null },
  publishing: { status: 'not_scheduled', attempts: [], lastAttemptAt: null, receipts: { instagram: receipt(), tiktok: receipt(), youtubeShorts: receipt() } },
  ...over,
})
const published = (n: string, ig: Record<string, unknown> = {}) =>
  draft(n, {
    approval: { status: 'approved' },
    publishing: { status: 'published', attempts: [{}], lastAttemptAt: null, receipts: { instagram: igReceipt(n, ig), tiktok: receipt(), youtubeShorts: receipt() } },
  })

const files: DriveFile[] = [
  { id: '1', title: 'post-01.mp4' },
  { id: '2', title: 'post-02.mp4' },
  { id: 'm', title: 'manifest.json', modifiedTime: '2026-10-08T14:00:00Z' },
]
const ready = { state: 'ok' as const, file: { id: 'r', title: 'Content' } }
const base: ContentInputs = { date: DATE, now: NOW, checkedAt: NOW, ready, dayFolder: { id: 'd', title: DATE }, dayFiles: files }
const day = (m: unknown, extra: Partial<ContentInputs> = {}) => evaluateContentDay({ ...base, manifest: m, ...extra })

// ---- Records, redaction and sanitizing -----------------------------------------

describe('records and redaction', () => {
  test('parses ELIA OS records and redacts secrets', () => {
    const records = parseRecords(
      'Intro\r\nBR-S-009 | VERIFIED ARTIFACT | Rate card. Owner: user review.\r\n# BR-A-001 | READY | User: talk. password: hunter2 sk-abcdefghijklmnop1234\r\n',
    )
    expect(records).toHaveLength(2)
    expect(records[0]?.id).toBe('BR-S-009')
    expect(records[1]?.text).toContain('password: [redacted]')
    expect(records[1]?.text).not.toContain('hunter2')
    expect(records[1]?.text).not.toContain('sk-abcdefghijklmnop1234')
  })

  test('the record label is sanitized too', () => {
    const [record] = parseRecords('BR-A-002 | READY token=abc123def456 | Do the thing.')
    expect(record?.label).toContain('token=[redacted]')
    expect(record?.label).not.toContain('abc123def456')
  })

  test('redacts the formats the review found missing', () => {
    const secrets: [string, string][] = [
      ['{"api_key": "AbCd1234EfGh5678"}', 'AbCd1234EfGh5678'],
      ["client_secret='s3cr3tValue99'", 's3cr3tValue99'],
      ['the password is hunter2', 'hunter2'],
      ['see https://elia:pa55word@example.com/admin', 'pa55word'],
      ['https://api.example.com/v1?access_token=zzzTOPSECRETzzz&x=1', 'zzzTOPSECRETzzz'],
      ['key AKIAABCDEFGHIJKLMNOP here', 'AKIAABCDEFGHIJKLMNOP'],
      ['jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.abcdefghijk_lmn', 'eyJzdWIiOiIxMjM0NSJ9'],
      ['-----BEGIN PRIVATE KEY----- MIIEvQIBADANBgkqhkiG9w0BAQEFAASC -----END PRIVATE KEY-----', 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASC'],
      ['ghp_abcdefghijklmnopqrstuvwxyz0123456789', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789'],
      ['xoxb-1234567890-abcdefghij', 'xoxb-1234567890-abcdefghij'],
      ['Authorization: Basic ZWxpYTpodW50ZXIyMjI=', 'ZWxpYTpodW50ZXIyMjI='],
      ['ya29.a0AfH6SMBabcdefghijklmnopqrst', 'ya29.a0AfH6SMBabcdefghijklmnopqrst'],
    ]
    for (const [input, secret] of secrets) expect(redact(input)).not.toContain(secret)
    expect(redact('Authorization: Bearer abc.def')).toBe('Authorization: Bearer [redacted]')
  })

  test('redacts complete quoted values: spaces, punctuation and escapes', () => {
    const cases: [string, string, string[]][] = [
      ['{"password": "my secret pass!"}', '{"password": "[redacted]"}', ['my', 'secret pass!']],
      ["api_key='a b\\'c' then more", "api_key='[redacted]' then more", ['a b', "\\'c"]],
      ['{"token": "x\\"y z", "ok": 1}', '{"token": "[redacted]", "ok": 1}', ['x\\"y', 'y z']],
      ['secret = "p@ss, word; more" end', 'secret = "[redacted]" end', ['p@ss', 'word; more']],
      ['client_secret: `tick tock, boom`', 'client_secret: `[redacted]`', ['tick tock', 'boom']],
      ['password is "two words"', 'password is "[redacted]"', ['two words']],
      // JSON carried inside a JSON string: the quotes themselves are escaped.
      ['{"note": "{\\"api_key\\": \\"k 1;2,3\\"}"}', '{"note": "{\\"api_key\\": \\"[redacted]\\"}"}', ['k 1;2,3', '1;2']],
      // Never closed: everything to the end of the line goes.
      ['password: "open ended value\nnext line', 'password: "[redacted]\nnext line', ['open ended value']],
    ]
    for (const [input, expected, leaks] of cases) {
      const out = redact(input)
      expect(out).toBe(expected)
      for (const leak of leaks) expect(out).not.toContain(leak)
    }
  })

  test('a quoted secret with spaces is redacted inside a record', () => {
    const [record] = parseRecords('BR-A-020 | READY | Use {"password": "correct horse, battery; staple!"} and "token": "a\\"b c" for the site.')
    const shown = `${record?.label} ${record?.text}`
    for (const leak of ['correct', 'horse', 'battery', 'staple', 'a\\"b', 'b c']) expect(shown).not.toContain(leak)
    expect(shown).toContain('"password": "[redacted]"')
    expect(shown).toContain('for the site.')
  })

  test('sanitizes every string and link in a value, labels included', () => {
    const clean = sanitizeDeep({
      label: 'Doc password: hunter2',
      nested: [{ detail: 'line one\nline two‮evil' }],
      url: 'https://user:pw@example.com/doc?token=abc#frag',
      link: 'javascript:alert(1)',
      count: 3,
    })
    expect(clean.label).toBe('Doc password: [redacted]')
    expect(clean.nested[0]?.detail).toBe('line one line two evil')
    expect(clean.url).toBe('https://example.com/doc')
    expect('link' in clean).toBe(false)
    expect(clean.count).toBe(3)
    expect(sanitizeText('x'.repeat(500)).length).toBe(400)
  })

  test('denies credential-looking files and judges freshness', () => {
    expect(isDeniedTitle('Access & Login Information')).toBe(true)
    expect(isDeniedTitle('CURRENT_STATE')).toBe(false)
    expect(freshness(NOW - 11 * DAY, NOW, 7).health).toBe('stale')
    expect(freshness(NOW - DAY, NOW, 7).health).toBe('ok')
    expect(freshness(undefined, NOW, 7).health).toBe('stale')
  })
})

// ---- Publication evidence ---------------------------------------------------------

describe('publication evidence', () => {
  test('rejects malformed and non-public URLs', () => {
    const bad = [
      undefined,
      '',
      'not a url',
      'javascript:alert(1)',
      'http://www.instagram.com/reel/1/',
      'https://localhost/reel/1',
      'https://127.0.0.1/reel/1',
      'https://intranet/reel/1',
      'https://drive.google.com/file/d/abc/view',
      'https://www.instagram.com/',
      'https://u:p@www.instagram.com/reel/1/',
    ]
    for (const url of bad) expect(publicationUrlProblem(url)).toBeDefined()
    expect(publicationUrlProblem('https://www.instagram.com/reel/abc/')).toBeUndefined()
  })

  test("limits URLs to each platform's hosts", () => {
    const hosts = ['instagram.com']
    expect(publicationUrlProblem('https://www.instagram.com/reel/abc/', hosts)).toBeUndefined()
    expect(publicationUrlProblem('https://instagram.com.evil.example/reel/abc/', hosts)).toContain('is not instagram.com')
    expect(publicationUrlProblem('https://example.com/p/1', hosts)).toContain('is not instagram.com')
  })

  test('rejects empty and placeholder receipts', () => {
    const at = '2026-10-08T14:30:00Z'
    const url = 'https://www.instagram.com/reel/abc/'
    const check = (r: unknown, platform: 'instagram' | 'tiktok' = 'instagram') => receiptProblem(r, platform, DATE, NOW)
    expect(check(undefined).problem).toBe('no receipt')
    expect(check([]).problem).toBe('no receipt')
    expect(check({}).problem).toContain('postId')
    expect(check({ postId: 'n/a', publishedAt: at, url }).problem).toContain('postId')
    expect(check({ postId: 'ig-1-2', publishedAt: '', url }).problem).toContain('publishedAt')
    expect(check({ postId: 'ig-1-2', publishedAt: '2026-10-08T14:30:00', url }).problem).toContain('time zone')
    expect(check({ postId: 'ig-1-2', publishedAt: '2026-10-07T12:00:00Z', url }).problem).toContain('not on 2026-10-08')
    expect(check({ postId: 'ig-1-2', publishedAt: '2026-10-08T20:00:00Z', url }).problem).toContain('future')
    expect(check({ postId: 'ig-1-2', publishedAt: at, url: null }).problem).toBe('no url')
    expect(check({ postId: 'tt-1-2', publishedAt: at, url }, 'tiktok').problem).toContain('is not tiktok.com')
    expect(check({ postId: 'ig-1-2', publishedAt: at, url })).toEqual({ postId: 'ig-1-2', at: Date.parse(at), url })
  })

  test('a receipt marked published with bad evidence is not counted', () => {
    const result = day(manifest([published('01', { url: 'https://drive.google.com/file/d/x/view' }), published('02', { postId: null })]))
    expect(result.published).toBe(0)
    expect(result.health).toBe('blocked')
    expect(result.posts[0]?.blockedReason).toBe('Instagram marked published but not counted: url is a Drive or storage link, which is a handoff, not a publication')
    expect(result.posts[1]?.blockedReason).toContain('Instagram marked published but not counted: receipt has no usable postId')
    expect(result.posts[0]?.stages.instagram).toBe('blocked')
    expect(result.posts[0]?.failedOn).toEqual(['instagram'])
  })

  test('good evidence counts once per post, labeled as reported, with the receipt time', () => {
    const both = draft('02', {
      approval: { status: 'approved' },
      publishing: {
        status: 'published',
        attempts: [{}],
        receipts: {
          instagram: igReceipt('02'),
          tiktok: receipt('published', { postId: 'tt-02-1234', publishedAt: '2026-10-08T14:40:00Z', url: 'https://www.tiktok.com/@bridgerow/video/1234' }),
          youtubeShorts: receipt(),
        },
      },
    })
    const result = day(manifest([published('01'), both]))
    expect(result.published).toBe(2)
    expect(result.health).toBe('ok')
    expect(result.source.kind).toBe('reported')
    expect(result.note).toContain('reported published')
    expect(result.posts[0]?.publishedAt).toBe(Date.parse('2026-10-08T14:30:00Z'))
    expect(result.posts[1]?.receipts.map(r => r.platform)).toEqual(['instagram', 'tiktok'])
    expect(result.posts[1]?.stages.youtubeShorts).toBe('pending')
  })
})

// ---- Manifest schema ------------------------------------------------------------------

describe('manifest schema', () => {
  const invalid = (m: unknown, expected: string) => {
    const result = day(m)
    expect(result.health).toBe('source-error')
    expect(result.published).toBeNull()
    expect(result.note).toContain(expected)
  }

  test('the TEST-001 shape from frozen packaging V1 is accepted', () => {
    const result = day(manifest([draft('01'), draft('02')]))
    expect(result.health).toBe('verified-zero')
    expect(result.posts.map(p => p.id)).toEqual([`BR-${COMPACT}-01`, `BR-${COMPACT}-02`])
    expect(result.posts[0]?.stages.facebook).toBe('off')
  })

  test('version, date and time zone must match', () => {
    invalid(manifest([draft('01')], { schemaVersion: 2 }), 'schemaVersion 2 is not supported')
    invalid(manifest([draft('01')], { publishDate: '2026-10-07' }), 'does not match folder')
    invalid({ schemaVersion: 1, timezone: 'America/Edmonton', posts: [draft('01')] }, 'manifest has no publishDate')
    invalid(manifest([draft('01')], { timezone: 'UTC' }), 'timezone must be America/Edmonton')
  })

  test('duplicate post IDs, slots, files, post URLs and platform post IDs are rejected', () => {
    invalid(manifest([draft('01'), draft('01')]), 'repeats id')
    invalid(manifest([draft('01'), { ...draft('02'), slot: 1 }]), 'repeats slot 1')
    invalid(manifest([draft('01'), { ...draft('02'), media: { file: 'post-01.mp4' } }]), 'repeats media file')
    invalid(manifest([published('01'), published('02', { url: 'https://www.instagram.com/reel/abc01/' })]), 'repeats a post url')
    invalid(manifest([published('01'), published('02', { postId: 'ig-01-778899' })]), 'repeats the instagram postId')
  })

  test('malformed entries give an error state and never throw', () => {
    invalid('just text', 'not a JSON object')
    invalid(null, 'not a JSON object')
    invalid(manifest(['post', null, 3]), 'entry 1 is not an object')
    invalid({ ...manifest([]), posts: 'none' }, 'no posts list')
    invalid(manifest([]), 'posts list is empty')
    invalid(manifest([{ ...draft('01'), id: 'a' }]), 'no id of the form BR-YYYYMMDD-NN')
    invalid(manifest([{ ...draft('01'), id: 'BR-20261007-01' }]), 'is not for 2026-10-08')
    invalid(manifest([{ ...draft('01'), slot: 0 }]), 'no slot from 1 to 10')
    invalid(manifest([{ ...draft('01'), media: {} }]), 'no media.file')
    invalid(manifest([{ ...draft('01'), approval: 'yes' }]), 'no approval.status')
    invalid(manifest([{ ...draft('01'), targets: { threads: { enabled: true } } }]), 'unknown target threads')
    invalid(manifest([{ ...draft('01'), targets: { instagram: { enabled: 'yes' } } }]), 'malformed targets.instagram')
    invalid(manifest([{ ...draft('01'), schedule: { publishAt: 'tomorrow' } }]), 'malformed schedule.publishAt')
    invalid(manifest([{ ...draft('01'), publishing: undefined }]), 'malformed publishing block')
    invalid(manifest([{ ...draft('01'), publishing: { status: 'x', attempts: [], receipts: { instagram: 'ok' } } }]), 'malformed receipts.instagram')
    invalid(manifest(Array.from({ length: 11 }, (_, i) => draft(String(i + 1).padStart(2, '0')))), 'at most 10')
  })

  test('two manifest files in one day folder are ambiguous', () => {
    const result = day(manifest([draft('01')]), { dayFiles: [...files, { id: 'm2', title: 'manifest.json' }] })
    expect(result.health).toBe('source-error')
    expect(result.published).toBeNull()
  })

  test('an unparseable manifest is a source error with no count', () => {
    const result = evaluateContentDay({ ...base, manifestError: 'Unexpected token' })
    expect(result.health).toBe('source-error')
    expect(result.note).toContain('could not be read')
  })
})

// ---- Content states -----------------------------------------------------------------

describe('content states', () => {
  test('source not configured gives no count and no invented block', () => {
    const result = evaluateContentDay({ date: DATE, now: NOW, checkedAt: NOW, ready: { state: 'not-configured', why: 'no ID set' }, dayFiles: [] })
    expect(result.health).toBe('not-configured')
    expect(result.published).toBeNull()
    expect(result.posts.every(p => p.blockedReason === undefined && p.stages.instagram === 'unknown')).toBe(true)
  })

  test('access denied gives no count', () => {
    const result = evaluateContentDay({ date: DATE, now: NOW, checkedAt: NOW, ready: { state: 'access-denied', why: 'Entity not found' }, dayFiles: [] })
    expect(result.health).toBe('access-denied')
    expect(result.published).toBeNull()
  })

  test('an absent day folder is missing, never a production count', () => {
    const result = evaluateContentDay({ date: DATE, now: NOW, checkedAt: NOW, ready, dayFiles: [] })
    expect(result.health).toBe('missing')
    expect(result.published).toBeNull()
    expect(result.note).toContain('No Content/Publishing/2026/10/2026-10-08 folder')
    expect(result.posts.every(p => p.stages.media === 'unknown' && p.stages.approval === 'unknown')).toBe(true)
    const noRoot = evaluateContentDay({ date: DATE, now: NOW, checkedAt: NOW, ready, dayFiles: [], dayMissingWhy: 'Content/Publishing does not exist yet' })
    expect(noRoot.note).toBe('Content/Publishing does not exist yet')
  })

  test('a day folder without a manifest is blocked with no count', () => {
    const result = evaluateContentDay({ ...base, dayFiles: files.filter(f => f.title !== 'manifest.json') })
    expect(result.health).toBe('blocked')
    expect(result.published).toBeNull()
    expect(result.posts[0]?.stages.media).toBe('done')
  })

  test('an incomplete or unapproved day folder gives no count', () => {
    const cut = evaluateContentDay({ ...base, dayFilesProblem: { health: 'source-error', why: 'listing stopped' } })
    expect(cut.health).toBe('source-error')
    expect(cut.published).toBeNull()
    const foreign = evaluateContentDay({ ...base, dayFilesProblem: { health: 'not-approved', why: 'owned by another account' } })
    expect(foreign.health).toBe('not-approved')
    expect(foreign.published).toBeNull()
  })

  test('a valid manifest with nothing published is a verified zero', () => {
    const result = day(manifest([draft('01'), draft('02')]))
    expect(result.health).toBe('verified-zero')
    expect(result.published).toBe(0)
  })

  test('approved, scheduled and uploaded is not published, and is blocked once overdue', () => {
    const result = day(manifest([draft('01', { approval: { status: 'approved' }, schedule: { publishAt: '2026-10-08T14:00:00Z' } }), draft('02')]))
    expect(result.published).toBe(0)
    expect(result.health).toBe('blocked')
    const post = result.posts[0]!
    expect([post.stages.approval, post.stages.media, post.stages.scheduled, post.stages.instagram]).toEqual(['done', 'done', 'done', 'pending'])
    expect(post.blockedReason).toBe('scheduled time passed with no reported publication on every target')
    expect(result.posts[1]?.stages.approval).toBe('pending')
  })

  test('a failed platform upload is blocked with its error, and disabled targets are off', () => {
    const failed = draft('01', {
      approval: { status: 'approved' },
      targets: { instagram: { enabled: false }, tiktok: { enabled: true } },
      publishing: { status: 'failed', attempts: [{}], receipts: { tiktok: receipt('failed', { error: { message: 'upload timed out' } }) } },
    })
    const result = day(manifest([failed]))
    expect(result.posts[0]?.blockedReason).toBe('TikTok failed: upload timed out')
    expect(result.posts[0]?.stages.instagram).toBe('off')
    expect(result.posts[0]?.stages.youtubeShorts).toBe('off')
    expect(result.posts[0]?.stages.tiktok).toBe('blocked')
  })

  test('an approved post whose video is missing is blocked', () => {
    const result = day(manifest([draft('01', { approval: { status: 'approved' } })]), { dayFiles: files.filter(f => f.title !== 'post-01.mp4') })
    expect(result.posts[0]?.blockedReason).toBe('post-01.mp4 is missing from the day folder')
  })
})

// ---- Social media -------------------------------------------------------------------

describe('social media', () => {
  const row = (rows: StatusRow[], id: string) => rows.find(r => r.id === id)!

  test('counts reported posts per platform from the window, with the account as set', () => {
    const today = day(manifest([published('01'), draft('02')]))
    const rows = socialRows({ days: [today], accounts: { instagram: '@bridgerow_solutions' }, checkedAt: NOW })
    const ig = row(rows, 'social-instagram')
    expect(ig.status).toBe('1 REPORTED POST')
    expect(ig.health).toBe('ok')
    expect(ig.detail).toContain('1 reported published of 2 targeted (1 of 7 days had a valid manifest)')
    expect(ig.detail).toContain('account @bridgerow_solutions (from settings, not verified with Instagram)')
    expect(ig.source.kind).toBe('reported')
    const tt = row(rows, 'social-tiktok')
    expect(tt.health).toBe('verified-zero')
    expect(tt.isInfo).toBe(true)
    expect(tt.detail).toContain('no account set (setting socialAccounts)')
    expect(row(rows, 'social-facebook').status).toBe('NOT TARGETED')
    const latest = row(rows, `BR-${COMPACT}-01-instagram`)
    expect(latest.status).toBe('REPORTED PUBLISHED')
    expect(latest.source.url).toBe('https://www.instagram.com/reel/abc01/')
    expect(rows.some(r => r.id === 'social-metrics')).toBe(false)
  })

  test('no valid manifest in the window is no count, and a failure is blocked', () => {
    const missing = evaluateContentDay({ date: DATE, now: NOW, checkedAt: NOW, ready, dayFiles: [] })
    const none = socialRows({ days: [missing], accounts: {}, checkedAt: NOW })
    expect(row(none, 'social-instagram').status).toBe('NO COUNT')
    expect(row(none, 'social-instagram').health).toBe('missing')
    const failed = day(manifest([draft('01', { publishing: { status: 'failed', attempts: [], receipts: { tiktok: receipt('failed', { error: 'rejected' }) } } })]))
    const rows = socialRows({ days: [failed], accounts: {}, checkedAt: NOW })
    expect(row(rows, 'social-tiktok').health).toBe('blocked')
    expect(row(rows, 'social-tiktok').isInfo).toBeFalsy()
  })

  test('accounts are parsed from platform=handle pairs', () => {
    expect(parseAccounts('instagram=@a, YouTube = @b, fb=page, bogus=x, tiktok=')).toEqual({ instagram: '@a', youtubeShorts: '@b', facebook: 'page' })
  })
})

// ---- Website ---------------------------------------------------------------------------

describe('website', () => {
  const at = (h: number) => NOW - h * 60 * 60 * 1000

  test('deployments: none is missing, a failed latest is blocked, no production is said', () => {
    expect(deploymentRow([], 'x/y', NOW).health).toBe('missing')
    const failed = deploymentRow(
      [
        { environment: 'Preview', createdAt: at(30), state: 'success', url: 'https://a.vercel.app' },
        { environment: 'Preview', createdAt: at(2), state: 'failure', url: 'https://bar-inventory-x-gusto-group.vercel.app' },
      ],
      'x/y',
      NOW,
    )
    expect(failed.health).toBe('blocked')
    expect(failed.status).toBe('LATEST FAILED')
    expect(failed.detail).toContain('(bar-inventory-x-gusto-group.vercel.app)')
    expect(failed.detail).toContain('1 of the last 2 failed')
    expect(failed.detail).toContain('no production deployment is recorded on GitHub (the public site may be hosted elsewhere')
    expect(failed.detail).not.toContain('not published')
    // A preview-only repository is not a problem on its own: the site may be hosted elsewhere.
    expect(deploymentRow([{ environment: 'Preview', createdAt: at(1), state: 'success' }], 'x/y', NOW).health).toBe('ok')
    const live = deploymentRow([{ environment: 'Production', createdAt: at(1), state: 'success' }], 'x/y', NOW)
    expect(live.health).toBe('ok')
  })

  test('traffic needs an analytics script and read access', () => {
    const none = trafficRow('<html><title>Bridgerow</title></html>', 'index.html', NOW)
    expect(none.status).toBe('NO ANALYTICS')
    expect(none.health).toBe('not-configured')
    expect(none.isInfo).toBe(true)
    const ga = trafficRow('<script src="https://www.googletagmanager.com/gtag/js?id=G-1"></script>', 'index.html', NOW)
    expect(ga.detail).toContain('Google Analytics is on the page, but this dashboard has no read access')
    expect(trafficRow(undefined, 'index.html', NOW, 'observed', 'GitHub answered 404').health).toBe('source-error')
  })

  test('the public site is checked only when a URL is set', () => {
    expect(liveSiteRow('', undefined, NOW).health).toBe('not-configured')
    const up = liveSiteRow('https://bridgerow.example/', { status: 200, ms: 120, title: 'Bridgerow' }, NOW)
    expect(up.health).toBe('ok')
    expect(up.detail).toBe('answered HTTP 200 in 120 ms, page title "Bridgerow"')
    expect(liveSiteRow('https://bridgerow.example/', { status: 404 }, NOW).health).toBe('blocked')
    expect(liveSiteRow('https://bridgerow.example/', { error: 'ENOTFOUND' }, NOW).status).toBe('UNREACHABLE')
  })
})

// ---- Ideas ------------------------------------------------------------------------

describe('ideas', () => {
  const CALENDAR = [
    'Bridge Row Content Calendar — Week 1',
    'Status: PROPOSED. Awaiting approval.',
    'Slot: Day 1, Video A (understand or use AI). Evergreen.',
    'Slot: Day 1, Video B (apply AI). Evergreen.',
    'Slot: Day 2, Video A (understand or use AI). Timely.',
    'Slot: Day 2, Video B (apply AI). Evergreen.',
    'Slot: Day 10, Video A (later). Evergreen.',
  ].join('\n')
  const calendar = { state: 'ok' as const, file: { id: 'cal', title: 'Week 1 calendar', modifiedTime: '2026-10-05T00:00:00Z' } }
  const withCalendar = (text: string, start = '') =>
    evaluateContentDay({ ...base, manifest: manifest([draft('01'), draft('02')]), calendar, calendarIdeas: parseCalendar(text) }, start)

  test('parses status and slots from the calendar text', () => {
    const parsed = parseCalendar(CALENDAR)
    expect(parsed.status).toBe('PROPOSED')
    expect(parsed.slots).toEqual(['Day 1A', 'Day 1B', 'Day 2A', 'Day 2B', 'Day 10A'])
  })

  test('a calendar that exists is not proof of today\'s ideas', () => {
    const result = withCalendar(CALENDAR)
    expect(result.ideas?.health).toBe('missing')
    expect(result.ideas?.note).toContain("Today's ideas are unknown")
    expect(result.posts.every(p => p.stages.idea === 'unknown')).toBe(true)
  })

  test('with a start date, today\'s entries are found; unapproved ideas stay pending', () => {
    const proposed = withCalendar(CALENDAR, '2026-10-07')
    expect(proposed.ideas?.today).toEqual(['Day 2A', 'Day 2B'])
    expect(proposed.posts.every(p => p.stages.idea === 'pending')).toBe(true)
    const approved = withCalendar(CALENDAR.replace('PROPOSED', 'APPROVED'), '2026-10-07')
    expect(approved.posts.every(p => p.stages.idea === 'done')).toBe(true)
    const day10 = withCalendar(CALENDAR.replace('PROPOSED', 'APPROVED'), '2026-09-29')
    expect(day10.ideas?.today).toEqual(['Day 10A'])
    expect(day10.posts[1]?.stages.idea).toBe('pending')
  })

  const slotted = (slots: string[], text: string, start = '') =>
    evaluateContentDay(
      {
        ...base,
        manifest: manifest(slots.map((slot, i) => draft(String(i + 1).padStart(2, '0'), { content: { calendarSlot: slot } }))),
        calendar,
        calendarIdeas: parseCalendar(text),
      },
      start,
    )

  test('a calendarSlot must be scheduled for the manifest date', () => {
    const approvedText = CALENDAR.replace('PROPOSED', 'APPROVED')
    // 2026-10-08 is Day 2 when the calendar starts 2026-10-07.
    const right = slotted(['Day 2A', 'Day 2, Video B'], approvedText, '2026-10-07')
    expect(right.posts.map(p => p.stages.idea)).toEqual(['done', 'done'])
    expect(right.posts.some(p => p.ideaProblem)).toBe(false)
    expect(right.health).toBe('verified-zero')

    const wrong = slotted(['Day 1A', 'Day 2B'], approvedText, '2026-10-07')
    expect(wrong.posts[0]?.stages.idea).toBe('blocked')
    expect(wrong.posts[0]?.ideaProblem).toBe('calendarSlot Day 1A is not scheduled for 2026-10-08 (today: Day 2A, Day 2B)')
    expect(wrong.posts[1]?.stages.idea).toBe('done')
    expect(wrong.health).toBe('conflict')
    expect(wrong.published).toBe(0)
    expect(wrong.note).toContain('post-01: calendarSlot Day 1A is not scheduled for 2026-10-08')

    // A slot that exists in the calendar but on no day matching this date.
    const off = slotted(['Day 10A', 'Day 2B'], approvedText, '2026-10-07')
    expect(off.posts[0]?.stages.idea).toBe('blocked')
    // A date with no calendar entry at all.
    const none = slotted(['Day 2A', 'Day 2B'], approvedText, '2026-10-01')
    expect(none.posts[0]?.ideaProblem).toBe('calendarSlot Day 2A is not scheduled for 2026-10-08 (no calendar entry that day)')
  })

  test('without a start date, a named calendarSlot is unknown, not done', () => {
    const result = slotted(['Day 2A', 'Day 1A'], CALENDAR.replace('PROPOSED', 'APPROVED'))
    expect(result.posts.every(p => p.stages.idea === 'unknown')).toBe(true)
    expect(result.posts.some(p => p.ideaProblem)).toBe(false)
  })

  test('a calendar with no entries is a source error', () => {
    const result = withCalendar('Status: APPROVED.\nNothing planned.', '2026-10-07')
    expect(result.ideas?.health).toBe('source-error')
    expect(result.posts.every(p => p.stages.idea === 'unknown')).toBe(true)
  })
})

// ---- Conflicts ------------------------------------------------------------------

describe('conflicts', () => {
  const doc = (detail: string, updatedAt: number): StatusRow => ({
    id: 'BR-A-008',
    project: 'content',
    title: 'BR-A-008',
    status: 'PROPOSED / NOT ACTIVATED',
    detail,
    source: { label: 'ELIA OS Bridgerow/CURRENT_STATE', kind: 'snapshot', checkedAt: NOW, updatedAt },
    health: 'ok',
    needsElia: false,
    kind: 'action',
  })
  const activity = (at: number, isPublication = false): Activity => ({
    project: 'content',
    at,
    what: isPublication ? 'reported publication of post-01' : 'Ready handoff',
    source: { label: 'Drive manifest', kind: 'reported', checkedAt: NOW, updatedAt: at },
    isPublication,
  })

  test('newer activity than the document is a conflict', () => {
    const found = detectConflicts([doc('Validate Muse', NOW - 2 * DAY)], [activity(NOW - DAY)])
    expect(found).toHaveLength(1)
    expect(found[0]?.health).toBe('conflict')
    expect(found[0]?.detail).toContain('may not reflect it')
  })

  test('a document newer than the activity is not a conflict', () => {
    expect(detectConflicts([doc('Validate Muse', NOW - DAY)], [activity(NOW - 2 * DAY)])).toHaveLength(0)
  })

  test('a document saying publishing is not live contradicts a newer publication', () => {
    const found = detectConflicts([doc('No publishing queue is activated', NOW - 2 * DAY)], [activity(NOW - DAY, true)])
    expect(found[0]?.detail).toContain('says publishing is not live')
  })
})

describe('zernio', () => {
  const row = (rows: StatusRow[], id: string) => rows.find(r => r.id === id)!

  test('accounts are read from the text answer or JSON, inactive ones left out', () => {
    expect(parseZernioAccounts('Found 2 connected account(s):\n\n- instagram: acmecorp (ID: 66b2e19d)\n- linkedin: acme (ID: 66b2e19e)')).toEqual([
      { platform: 'instagram', username: 'acmecorp', id: '66b2e19d' },
      { platform: 'linkedin', username: 'acme', id: '66b2e19e' },
    ])
    expect(parseZernioAccounts(JSON.stringify({ accounts: [{ _id: 'a1', platform: 'tiktok', username: 'x' }, { _id: 'a2', platform: 'facebook', isActive: false }] }))).toEqual([
      { id: 'a1', platform: 'tiktok', username: 'x' },
    ])
    expect(parseZernioAccounts('No connected accounts found.')).toEqual([])
    expect(() => parseZernioAccounts('Unauthorized')).toThrow()
  })

  test('follower stats and posts are parsed without guessing missing numbers', () => {
    const f = parseZernioFollowers({ accounts: [{ _id: 'a1', platform: 'instagram', username: 'x', currentFollowers: 10 }, { _id: 'a2', platform: 'tiktok' }] })
    expect(f.followers).toEqual({ a1: { followers: 10, growth: undefined, growthPct: undefined }, a2: { followers: undefined, growth: undefined, growthPct: undefined } })
    expect(() => parseZernioFollowers({ error: 'x' })).toThrow()
    const posts = parseZernioPosts({ posts: [{ platform: 'instagram', status: 'published', publishedAt: '2026-10-08T10:00:00Z', analytics: { views: 5, likes: 'many' } }, { platform: 'x', status: 'failed' }] })
    expect(posts).toHaveLength(1)
    expect(posts[0]!.views).toBe(5)
    expect(posts[0]!.likes).toBeUndefined()
    expect(() => parseZernioPosts({})).toThrow()
    expect(thousands(1234567)).toBe('1,234,567')
    expect(thousands(-1200)).toBe('-1,200')
  })

  test('not configured and not connected show no numbers', () => {
    const off = row(zernioRows({ state: 'not-configured', why: 'no Zernio connector set (setting zernioServer)' }, NOW), 'social-metrics')
    expect(off.status).toBe('NOT CONNECTED')
    expect(off.health).toBe('not-configured')
    expect(off.isInfo).toBe(true)
    expect(off.detail).toContain('No numbers are shown or estimated')
    const down = row(zernioRows({ state: 'access-denied', why: 'not connected' }, NOW), 'social-metrics')
    expect(down.health).toBe('access-denied')
    expect(down.isInfo).toBe(false)
  })

  test('accounts carry their own followers and posts; a missing part says why', () => {
    const rows = zernioRows(
      {
        state: 'ok',
        server: 'plugin:zernio:zernio',
        accounts: [{ id: 'a1', platform: 'instagram', username: '@x' }],
        followers: { ok: false, why: "Zernio's Analytics add-on is needed" },
        posts: { ok: true, value: [{ platform: 'instagram', accountId: 'a1', views: 1500, likes: 30, url: 'https://www.instagram.com/reel/a/' }] },
      },
      NOW,
    )
    const summary = row(rows, 'social-metrics')
    expect(summary.status).toBe('1 ACCOUNT')
    expect(summary.health).toBe('source-error')
    expect(summary.detail).toContain("follower counts not available (Zernio's Analytics add-on is needed)")
    const account = row(rows, 'zernio-a1')
    expect(account.title).toBe('Instagram @x')
    expect(account.status).toBe('FOLLOWERS UNKNOWN')
    expect(account.detail).toBe('follower count not available; 1 post in the last 7 days, 1,500 views, 30 likes')
    const post = row(rows, 'zernio-post-1')
    expect(post.status).toBe('1,500 VIEWS')
    expect(post.title).toBe('Instagram post date not reported')
    expect(post.source.url).toBe('https://www.instagram.com/reel/a/')
    expect(rows.every(r => r.project === 'social' && r.isInfo)).toBe(true)
  })
})

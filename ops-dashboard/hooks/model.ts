// Pure rules: parse ELIA OS records, classify them, judge each source's state,
// turn a daily content manifest into pipeline stages, and find conflicts
// between documents and newer dated activity. No I/O here, so tests run it.

import type {
  Activity,
  ContentDay,
  ContentPost,
  Health,
  Platform,
  PostReceipt,
  ProjectKey,
  Source,
  Stage,
  StageState,
  StatusRow,
} from '../types'

export const DAY_MS = 24 * 60 * 60 * 1000
export const PLATFORMS: readonly Platform[] = ['instagram', 'tiktok', 'youtubeShorts', 'facebook']
export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtubeShorts: 'YouTube Shorts',
  facebook: 'Facebook',
}
// The hosts each platform's post URLs are on.
export const PLATFORM_HOSTS: Record<Platform, readonly string[]> = {
  instagram: ['instagram.com'],
  tiktok: ['tiktok.com'],
  youtubeShorts: ['youtube.com', 'youtu.be'],
  facebook: ['facebook.com', 'fb.watch'],
}
export const STAGES: readonly Stage[] = ['idea', 'approval', 'media', 'scheduled', ...PLATFORMS]
export const DAILY_TARGET = 2

export const PROJECT_LABELS: Record<ProjectKey, string> = {
  website: 'Bridgerow website',
  social: 'Social media',
  content: 'Content engine',
  offers: 'Sales & offers',
  palios: 'Palios inventory',
  dance: 'Dance Alchemy automation',
}

export const HEALTH_LABEL: Record<Health, string> = {
  ok: 'OK',
  stale: 'STALE',
  'not-configured': 'SOURCE NOT CONFIGURED',
  'access-denied': 'ACCESS DENIED',
  missing: 'MISSING',
  'verified-zero': 'VERIFIED ZERO',
  blocked: 'BLOCKED',
  conflict: 'CONFLICT',
  'source-error': 'SOURCE ERROR',
  'not-approved': 'NOT APPROVED',
}

// Which state wins when one line sums up several.
const HEALTH_RANK: Record<Health, number> = {
  ok: 0,
  'verified-zero': 1,
  stale: 2,
  conflict: 3,
  missing: 4,
  blocked: 5,
  'source-error': 6,
  'not-approved': 7,
  'not-configured': 8,
  'access-denied': 9,
}

export function worst(healths: readonly Health[]): Health {
  return healths.reduce<Health>((a, b) => (HEALTH_RANK[b] > HEALTH_RANK[a] ? b : a), 'ok')
}

// Files whose title looks like credentials are never opened.
const DENIED_TITLE = /log\s*-?in|password|credential|secret|api[\s_-]?key|token/i

export function isDeniedTitle(title: string): boolean {
  return DENIED_TITLE.test(title)
}

// Best-effort secret redaction. It catches common formats (keyword: value
// pairs, quoted JSON fields, bearer tokens, keys with known prefixes, JWTs,
// private key blocks, credentials and secret parameters in URLs); a secret in
// a format it does not know can still get through.
const SECRET_WORD =
  'password|passwd|passcode|pwd|pin|otp|api[\\s_-]?key|apikey|access[\\s_-]?key|secret[\\s_-]?key|client[\\s_-]?secret|access[\\s_-]?token|refresh[\\s_-]?token|auth[\\s_-]?token|id[\\s_-]?token|session[\\s_-]?(?:id|token)|private[\\s_-]?key|cookie|secret|token'
// A secret word, an optional quote around it, a separator, then the whole
// value: a quoted value runs to its closing quote (escaped quotes, spaces and
// punctuation included) or to the end of the line if it is never closed; an
// escaped-quoted value (\"…\" inside a JSON string) likewise; otherwise the
// value runs to whitespace or a delimiter.
const QUOTED_VALUE = [
  String.raw`\\"(?:(?!\\")[^\n])*(?:\\"|(?=\n)|$)`,
  String.raw`\\'(?:(?!\\')[^\n])*(?:\\'|(?=\n)|$)`,
  String.raw`"(?:[^"\\\n]|\\.)*(?:"|(?=\n)|$)`,
  String.raw`'(?:[^'\\\n]|\\.)*(?:'|(?=\n)|$)`,
  String.raw`\x60(?:[^\x60\\\n]|\\.)*(?:\x60|(?=\n)|$)`,
].join('|')
const SECRET_PAIR = new RegExp(
  String.raw`(\\?["'\x60]?)\b(${SECRET_WORD})\1(\s*(?:[:=]|=>|\bis\b)\s*)(${QUOTED_VALUE}|[^\s"'\x60,;]+)`,
  'gi',
)

function redactPair(_match: string, keyQuote: string, key: string, separator: string, value: string): string {
  const quote = /^\\?["'\x60]/.exec(value)?.[0]
  if (!quote) return `${keyQuote}${key}${keyQuote}${separator}[redacted]`
  const closed = value.length >= quote.length * 2 && value.endsWith(quote)
  return `${keyQuote}${key}${keyQuote}${separator}${quote}[redacted]${closed ? quote : ''}`
}
const KNOWN_KEY =
  /\b(?:sk|pk|rk)[-_](?:live[-_]|test[-_])?[A-Za-z0-9]{12,}|\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\bxox[abprs]-[A-Za-z0-9-]{10,}|\bAIza[0-9A-Za-z_-]{20,}|\bya29\.[0-9A-Za-z_-]{20,}|\b(?:AKIA|ASIA)[0-9A-Z]{16}\b|\bglpat-[A-Za-z0-9_-]{20,}|\bshp(?:at|ss|ca|pa)_[A-Fa-f0-9]{32}\b|\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g

export function redact(text: string): string {
  return text
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[redacted key]')
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1[redacted]@')
    .replace(
      /([?&](?:token|access_token|id_token|api_key|apikey|key|sig|signature|secret|client_secret|password|auth|code)=)[^&\s#]+/gi,
      '$1[redacted]',
    )
    .replace(SECRET_PAIR, redactPair)
    .replace(KNOWN_KEY, '[redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[redacted]')
    .replace(/\bBearer\s+[-._~+/A-Za-z0-9]+=*/g, 'Bearer [redacted]')
    .replace(/\bBasic\s+[A-Za-z0-9+/]{12,}={0,2}/g, 'Basic [redacted]')
}

// Every text the dashboard shows or stores goes through this: redaction,
// no control or direction-override characters, one line, bounded length.
export function sanitizeText(text: string, max = 400): string {
  const clean = redact(text)
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

// Links keep only scheme, host and path: no credentials, query or fragment.
export function sanitizeUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
    return `${url.protocol}//${url.host}${url.pathname}`
  } catch {
    return undefined
  }
}

// Applies sanitizeText to every string in a value, and sanitizeUrl to every
// `url` or `link` field.
export function sanitizeDeep<T>(value: T): T {
  const walk = (v: unknown, key?: string): unknown => {
    if (typeof v === 'string') return key === 'url' || key === 'link' ? sanitizeUrl(v) : sanitizeText(v)
    if (Array.isArray(v)) return v.map(item => walk(item))
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, item] of Object.entries(v)) {
        const next = walk(item, k)
        if (next !== undefined) out[k] = next
      }
      return out
    }
    return v
  }
  return walk(value) as T
}

// A Drive or GitHub failure that means "this account cannot see it" rather
// than a transient fault. Drive answers "Entity not found" both for a missing
// item and for one the account has no access to.
export function isAccessError(message: string): boolean {
  return /not found|entity not found|permission|forbidden|unauthori[sz]ed|insufficient|access denied|\b40[134]\b|not connected|no such server|unknown server/i.test(
    message,
  )
}

// ---- Records ----------------------------------------------------------------

export type DocRecord = { id: string; label: string; text: string }

const RECORD_LINE = /^[\s#*]*([A-Z]{2,4}-[A-Z]-\d{3})\s*\|\s*([^|]+?)\s*\|\s*(.+)$/

export function parseRecords(text: string): DocRecord[] {
  const records: DocRecord[] = []
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.replace(/\\([_*#[\]|-])/g, '$1').trim()
    const match = RECORD_LINE.exec(line)
    if (match && match[1] && match[2] && match[3]) {
      records.push({ id: match[1], label: sanitizeText(match[2]), text: sanitizeText(match[3]) })
    }
  }
  return records
}

const CONTENT_WORDS =
  /\b(video|videos|muse|narration|elevenlabs|remotion|content engine|content calendar|content playbook|publishing|two posts|instagram|branding kit|brand kit)\b/i
const WEBSITE_WORDS = /\b(website|web site|domain|landing page)\b/i

export function classifyBridgerow(record: DocRecord): ProjectKey {
  const all = `${record.label} ${record.text}`
  if (CONTENT_WORDS.test(all)) return 'content'
  if (WEBSITE_WORDS.test(all)) return 'website'
  return 'offers'
}

export function kindOf(id: string): StatusRow['kind'] {
  const letter = id.split('-')[1]
  if (letter === 'A') return 'action'
  if (letter === 'Q' || letter === 'C') return 'question'
  if (letter === 'D') return 'decision'
  if (letter === 'P') return 'proposal'
  return 'state'
}

const SETTLED = /\b(COMPLETE|SUPERSEDED|ACCEPTED|IMPLEMENTED)\b/i
const ASKS_ELIA =
  /(^user:|owner:\s*user\b|user review|user reviews|user approves|seek approval|approval of|needs? (your|user) (decision|approval)|decider:\s*user[^.]*\bopen\b)/i

export function needsElia(record: DocRecord): boolean {
  if (SETTLED.test(record.label)) return false
  return ASKS_ELIA.test(record.text)
}

export function isBlocked(record: DocRecord): boolean {
  return /\bBLOCKED\b|WAITING ON/i.test(record.label) || /\bblocked\b/i.test(record.text)
}

export function freshness(
  updatedAt: number | undefined,
  now: number,
  staleDays: number,
): { health: Health; note?: string } {
  if (updatedAt === undefined || Number.isNaN(updatedAt)) {
    return { health: 'stale', note: 'source has no last-updated time' }
  }
  if (now - updatedAt > staleDays * DAY_MS) {
    const days = Math.floor((now - updatedAt) / DAY_MS)
    return { health: 'stale', note: `source last updated ${days} days ago (limit ${staleDays})` }
  }
  return { health: 'ok' }
}

export function rowsFromRecords(
  records: readonly DocRecord[],
  project: ProjectKey | ((r: DocRecord) => ProjectKey),
  source: Source,
  now: number,
  staleDays: number,
): StatusRow[] {
  const fresh = freshness(source.updatedAt, now, staleDays)
  return records.map(record => {
    const blocked = isBlocked(record) && !SETTLED.test(record.label)
    return {
      id: record.id,
      project: typeof project === 'function' ? project(record) : project,
      title: record.id,
      status: record.label,
      detail: record.text,
      source,
      health: blocked && fresh.health === 'ok' ? 'blocked' : fresh.health,
      healthNote: blocked && fresh.health === 'ok' ? 'the record says blocked or waiting' : fresh.note,
      needsElia: needsElia(record),
      kind: kindOf(record.id),
    }
  })
}

// One line standing for a source that could not be used: not configured,
// access denied, not approved, malformed, or read but missing what was expected.
export function sourceRow(
  project: ProjectKey,
  health: Exclude<Health, 'ok' | 'verified-zero' | 'stale' | 'blocked'>,
  what: string,
  why: string,
  source: Source,
): StatusRow {
  return {
    id: `${project}-${health}-${what.replace(/\W+/g, '-').toLowerCase()}`,
    project,
    title: what,
    status: HEALTH_LABEL[health],
    detail: why,
    source,
    health,
    healthNote: why,
    needsElia: true,
    kind: 'source',
  }
}

// ---- Conflicts --------------------------------------------------------------

const SAYS_NOT_LIVE = /not activated|nothing is live|no (launch|posting|publishing)|not live/i

// A document is in conflict when verified activity for its project is newer
// than the document's last update. A stronger conflict: the document says
// publishing is not live while a verified publication exists.
export function detectConflicts(rows: readonly StatusRow[], activity: readonly Activity[]): StatusRow[] {
  const conflicts: StatusRow[] = []
  const docs = new Map<string, { project: ProjectKey; source: Source; rows: StatusRow[] }>()
  for (const row of rows) {
    if (row.source.kind === 'observed' || row.kind === 'source' || row.kind === 'summary') continue
    if (row.source.updatedAt === undefined) continue
    const key = `${row.project}|${row.source.label}`
    const doc = docs.get(key) ?? { project: row.project, source: row.source, rows: [] }
    doc.rows.push(row)
    docs.set(key, doc)
  }
  for (const doc of docs.values()) {
    const docAt = doc.source.updatedAt ?? 0
    const newer = activity
      .filter(a => a.project === doc.project && a.at > docAt)
      .sort((a, b) => b.at - a.at)
    const latest = newer[0]
    if (!latest) continue
    const publication = newer.find(a => a.isPublication)
    const denies = doc.rows.find(r => SAYS_NOT_LIVE.test(`${r.status} ${r.detail}`))
    const strong = publication && denies
    conflicts.push({
      id: `conflict-${doc.project}-${doc.source.label}`,
      project: doc.project,
      title: doc.source.label,
      status: 'CONFLICT',
      detail: strong
        ? `${denies.id} says publishing is not live, but ${publication.what} is dated ${new Date(publication.at).toISOString()} (${publication.source.label}), after the document's last update.`
        : `Document last updated ${new Date(docAt).toISOString()}; newer activity: ${latest.what} at ${new Date(latest.at).toISOString()} (${latest.source.label}). The document may not reflect it.`,
      source: (strong ? publication : latest).source,
      health: 'conflict',
      healthNote: `document ${doc.source.label} is older than verified activity`,
      needsElia: true,
      kind: 'source',
    })
  }
  return conflicts
}

// ---- Content pipeline --------------------------------------------------------

export const CONTENT_TIMEZONE = 'America/Edmonton'

export type DriveFile = {
  id: string
  title: string
  mimeType?: string
  modifiedTime?: string
  owner?: string
}

export type SourceState =
  | { state: 'not-configured'; why: string }
  | { state: 'access-denied'; why: string }
  | { state: 'not-approved'; why: string }
  | { state: 'source-error'; why: string }
  | { state: 'ok'; file: DriveFile; note?: string }

// What a calendar document says, parsed from its text.
export type CalendarIdeas = {
  status?: string
  startDate?: string
  // Each `Slot: Day N, Video X` entry, as `Day NX`.
  slots: string[]
}

export type ContentInputs = {
  date: string
  now: number
  checkedAt: number
  kind?: Source['kind']
  // The Content folder; the day folder is Publishing/YYYY/MM/YYYY-MM-DD in it.
  ready: SourceState
  dayFolder?: DriveFile
  dayFiles: readonly DriveFile[]
  // Set when the day folder's file list was cut short or a file there is out
  // of the approved scope; either makes its contents unreliable.
  dayFilesProblem?: { health: 'source-error' | 'not-approved'; why: string }
  manifest?: unknown
  manifestError?: string
  // Why there is no day folder, when a folder above it is already missing.
  dayMissingWhy?: string
  calendar?: SourceState
  calendarIdeas?: CalendarIdeas
  calendarError?: string
}

// The Social Ops manifest, schema version 1 (frozen packaging V1): one per
// Content/Publishing/YYYY/MM/YYYY-MM-DD folder. Facebook is accepted as a
// target and receipt (proposed in V1.1) but not required.
type Receipt = { status: string; postId: string | null; publishedAt: string | null; url: string | null; error: unknown }

export type ManifestPost = {
  id: string
  slot: number
  content?: { calendarSlot?: string; workingTitle?: string }
  media: { file: string }
  approval: { status: string }
  targets: Partial<Record<Platform, { enabled: boolean }>>
  schedule: { publishAt: string | null }
  publishing: { status: string; attempts: unknown[]; receipts: Partial<Record<Platform, Receipt>> }
}

const MAX_POSTS = 10
const PLACEHOLDER = /^(n\/?a|none|null|undefined|tbd|todo|pending|test|unknown|x+|-+|0+|\?+)$/i
const HANDOFF_HOSTS = /(^|\.)(drive\.google\.com|docs\.google\.com|storage\.googleapis\.com|googleusercontent\.com)$/i
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const isPlatform = (key: string): key is Platform => (PLATFORMS as readonly string[]).includes(key)

function isoTime(value: unknown): number | undefined {
  if (typeof value !== 'string' || !ISO_WITH_OFFSET.test(value)) return undefined
  const at = Date.parse(value)
  return Number.isNaN(at) ? undefined : at
}

// Why a post URL is not acceptable evidence for this platform, or undefined.
export function publicationUrlProblem(value: unknown, hosts: readonly string[] = []): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return 'no url'
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return 'url is not a valid URL'
  }
  if (url.protocol !== 'https:') return 'url is not https'
  const host = url.hostname.toLowerCase()
  if (!host.includes('.') || host === 'localhost' || /^[\d.]+$/.test(host) || host.includes(':')) {
    return 'url has no public host'
  }
  if (HANDOFF_HOSTS.test(host)) return 'url is a Drive or storage link, which is a handoff, not a publication'
  if (hosts.length > 0 && !hosts.some(h => host === h || host.endsWith(`.${h}`))) {
    return `url host ${host} is not ${hosts.join(' or ')}`
  }
  if (url.pathname.replace(/\/+$/, '') === '') return 'url points at a home page, not a post'
  if (url.username || url.password) return 'url carries credentials'
  return undefined
}

// A receipt marked published counts only with the platform's post ID, an
// explicit publishedAt on the manifest's date (America/Edmonton, not in the
// future) and a post URL on that platform.
export function receiptProblem(
  receipt: unknown,
  platform: Platform,
  date: string,
  now: number,
): { problem?: string; postId?: string; at?: number; url?: string } {
  if (!isObject(receipt)) return { problem: 'no receipt' }
  const postId = typeof receipt.postId === 'string' ? receipt.postId.trim() : ''
  if (postId.length < 3 || PLACEHOLDER.test(postId)) return { problem: 'receipt has no usable postId' }
  const at = isoTime(receipt.publishedAt)
  if (at === undefined) return { problem: 'receipt has no publishedAt with a time zone', postId }
  if (at > now + 5 * 60 * 1000) return { problem: 'receipt publishedAt is in the future', postId }
  if (edmontonDate(at) !== date) return { problem: `receipt publishedAt is not on ${date} (${CONTENT_TIMEZONE})`, postId }
  const urlProblem = publicationUrlProblem(receipt.url, PLATFORM_HOSTS[platform])
  if (urlProblem) return { problem: urlProblem, postId, at }
  return { postId, at, url: String(receipt.url).trim() }
}

export type ManifestCheck = { ok: true; posts: ManifestPost[] } | { ok: false; errors: string[] }

const nullOr = (check: (v: unknown) => boolean) => (v: unknown) => v === null || check(v)
const isString = (v: unknown) => typeof v === 'string'

// Checks a manifest against schema version 1. Any structural fault rejects the
// whole manifest, so its count is never shown.
export function validateManifest(raw: unknown, date: string): ManifestCheck {
  const errors: string[] = []
  if (!isObject(raw)) return { ok: false, errors: ['manifest is not a JSON object'] }
  if (raw.schemaVersion !== 1) errors.push(`schemaVersion ${JSON.stringify(raw.schemaVersion ?? null)} is not supported (expected 1)`)
  if (typeof raw.publishDate !== 'string') errors.push('manifest has no publishDate')
  else if (raw.publishDate !== date) errors.push(`manifest publishDate ${raw.publishDate} does not match folder ${date}`)
  if (raw.timezone !== CONTENT_TIMEZONE) errors.push(`manifest timezone must be ${CONTENT_TIMEZONE}`)
  if (!Array.isArray(raw.posts)) return { ok: false, errors: [...errors, 'manifest has no posts list'] }
  if (raw.posts.length === 0) errors.push('manifest posts list is empty')
  if (raw.posts.length > MAX_POSTS) errors.push(`manifest lists ${raw.posts.length} posts (at most ${MAX_POSTS})`)

  const compact = date.replace(/-/g, '')
  const ids = new Set<string>()
  const slots = new Set<number>()
  const files = new Set<string>()
  const postIds = new Set<string>()
  const urls = new Set<string>()
  raw.posts.slice(0, MAX_POSTS).forEach((entry, i) => {
    const at = `entry ${i + 1}`
    if (!isObject(entry)) {
      errors.push(`${at} is not an object`)
      return
    }
    const id = typeof entry.id === 'string' ? /^BR-(\d{8})-\d{2}$/.exec(entry.id) : null
    if (!id) errors.push(`${at} has no id of the form BR-YYYYMMDD-NN`)
    else if (id[1] !== compact) errors.push(`${at} id ${entry.id} is not for ${date}`)
    else if (ids.has(entry.id as string)) errors.push(`${at} repeats id ${entry.id}`)
    else ids.add(entry.id as string)
    if (typeof entry.slot !== 'number' || !Number.isInteger(entry.slot) || entry.slot < 1 || entry.slot > MAX_POSTS) {
      errors.push(`${at} has no slot from 1 to ${MAX_POSTS}`)
    } else if (slots.has(entry.slot)) errors.push(`${at} repeats slot ${entry.slot}`)
    else slots.add(entry.slot)
    if (entry.content !== undefined) {
      if (!isObject(entry.content)) errors.push(`${at} has a malformed content`)
      else if (entry.content.calendarSlot !== undefined && !isString(entry.content.calendarSlot)) errors.push(`${at} has a malformed content.calendarSlot`)
    }
    if (!isObject(entry.media) || typeof entry.media.file !== 'string' || entry.media.file.trim() === '') errors.push(`${at} has no media.file`)
    else if (files.has(entry.media.file)) errors.push(`${at} repeats media file ${entry.media.file}`)
    else files.add(entry.media.file)
    if (!isObject(entry.approval) || !isString(entry.approval.status)) errors.push(`${at} has no approval.status`)
    if (!isObject(entry.targets)) errors.push(`${at} has no targets`)
    else {
      for (const [key, target] of Object.entries(entry.targets)) {
        if (!isPlatform(key)) errors.push(`${at} has an unknown target ${sanitizeText(key, 40)}`)
        else if (!isObject(target) || typeof target.enabled !== 'boolean') errors.push(`${at} has a malformed targets.${key}`)
      }
    }
    if (!isObject(entry.schedule) || !nullOr(v => isoTime(v) !== undefined)(entry.schedule.publishAt)) {
      errors.push(`${at} has a malformed schedule.publishAt`)
    }
    const publishing = entry.publishing
    if (!isObject(publishing) || !isString(publishing.status) || !Array.isArray(publishing.attempts) || !isObject(publishing.receipts)) {
      errors.push(`${at} has a malformed publishing block`)
      return
    }
    for (const [key, receipt] of Object.entries(publishing.receipts)) {
      if (!isPlatform(key)) {
        errors.push(`${at} has a receipt for an unknown target ${sanitizeText(key, 40)}`)
        continue
      }
      const shaped =
        isObject(receipt) &&
        isString(receipt.status) &&
        nullOr(isString)(receipt.postId) &&
        nullOr(isString)(receipt.publishedAt) &&
        nullOr(isString)(receipt.url) &&
        nullOr(v => isString(v) || isObject(v))(receipt.error)
      if (!shaped) {
        errors.push(`${at} has a malformed receipts.${key}`)
        continue
      }
      if (typeof receipt.postId === 'string' && receipt.postId.trim() !== '') {
        const postId = `${key}:${receipt.postId.trim()}`
        if (postIds.has(postId)) errors.push(`${at} repeats the ${key} postId`)
        postIds.add(postId)
      }
      if (typeof receipt.url === 'string' && receipt.url.trim() !== '') {
        if (urls.has(receipt.url.trim())) errors.push(`${at} repeats a post url`)
        urls.add(receipt.url.trim())
      }
    }
  })
  return errors.length ? { ok: false, errors } : { ok: true, posts: raw.posts as ManifestPost[] }
}

function receiptError(receipt: Receipt): string | undefined {
  const error = receipt.error
  if (typeof error === 'string' && error.trim() !== '') return sanitizeText(error, 160)
  if (isObject(error)) return sanitizeText(String(error.message ?? error.reason ?? error.code ?? 'error recorded'), 160)
  return undefined
}

const PENDING_RECEIPT = new Set(['not_started', 'pending', 'queued', 'scheduled', 'publishing', 'in_progress'])

export function evaluatePost(
  post: ManifestPost,
  files: readonly DriveFile[],
  idea: StageState,
  rules: { date: string; now: number },
): ContentPost {
  const slot = String(post.slot).padStart(2, '0')
  const hasVideo = files.some(f => f.title === post.media.file)
  const approval = post.approval.status.toLowerCase()
  const isApproved = approval === 'approved'
  const stages = {} as Record<Stage, StageState>
  stages.idea = idea
  stages.approval = isApproved ? 'done' : /^(rejected|changes_requested|declined)$/.test(approval) ? 'blocked' : 'pending'
  stages.media = hasVideo ? 'done' : 'pending'
  stages.scheduled = post.schedule.publishAt ? 'done' : 'pending'

  const receipts: PostReceipt[] = []
  const reasons: string[] = []
  let enabled = 0
  for (const platform of PLATFORMS) {
    const target = post.targets[platform]
    if (!target?.enabled) {
      stages[platform] = 'off'
      continue
    }
    enabled += 1
    const receipt = post.publishing.receipts[platform]
    const status = receipt?.status.toLowerCase()
    const error = receipt ? receiptError(receipt) : undefined
    if (receipt && status === 'published') {
      const check = receiptProblem(receipt, platform, rules.date, rules.now)
      if (check.problem === undefined && check.at !== undefined && check.url && check.postId) {
        stages[platform] = 'done'
        receipts.push({ platform, at: check.at, url: check.url, postId: check.postId })
      } else {
        stages[platform] = 'blocked'
        reasons.push(`${PLATFORM_LABEL[platform]} marked published but not counted: ${check.problem}`)
      }
    } else if (receipt && (status === 'failed' || error)) {
      stages[platform] = 'blocked'
      reasons.push(`${PLATFORM_LABEL[platform]} ${status === 'failed' ? 'failed' : `reports an error (${sanitizeText(receipt.status, 30)})`}${error ? `: ${error}` : ''}`)
    } else if (!receipt || PENDING_RECEIPT.has(status ?? '')) {
      stages[platform] = 'pending'
    } else {
      stages[platform] = 'unknown'
    }
  }

  const publishAt = isoTime(post.schedule.publishAt)
  let blockedReason = reasons[0]
  if (!blockedReason && publishAt !== undefined && publishAt < rules.now && receipts.length < enabled) {
    blockedReason = isApproved ? 'scheduled time passed with no reported publication on every target' : 'scheduled time passed without approval'
  }
  if (!blockedReason && !hasVideo && isApproved) blockedReason = `${post.media.file} is missing from the day folder`
  const isPublished = receipts.length > 0
  return {
    id: post.id,
    slot,
    stages,
    status: sanitizeText(post.publishing.status, 40),
    isPublished,
    publishedAt: isPublished ? Math.min(...receipts.map(r => r.at)) : undefined,
    receipts,
    failedOn: PLATFORMS.filter(p => stages[p] === 'blocked'),
    blockedReason,
  }
}

// A slot nothing can be said about: every stage after the idea is unknown, and
// there is no blocked reason, because absence is not evidence of a block.
function unknownPost(slot: string, idea: StageState): ContentPost {
  const stages = {} as Record<Stage, StageState>
  for (const stage of STAGES) stages[stage] = 'unknown'
  stages.idea = idea
  return { id: `post-${slot}`, slot, stages, status: 'unknown', isPublished: false, receipts: [], failedOn: [] }
}

// ---- Ideas ------------------------------------------------------------------

const APPROVED_STATUS = /^(APPROVED|ACTIVE|FINAL|IN PRODUCTION|LIVE)\b/i

export function parseCalendar(text: string): CalendarIdeas {
  const status = /^\s*Status:\s*([A-Za-z][A-Za-z /-]*?)\s*(?:[.;:]|$)/m.exec(text)?.[1]?.trim().toUpperCase()
  const startDate = /^\s*Start date:\s*(\d{4}-\d{2}-\d{2})\b/im.exec(text)?.[1]
  const slots = [...text.matchAll(/Slot:\s*Day\s+(\d+),\s*Video\s+([A-Z])\b/g)].map(m => `Day ${m[1]}${m[2]}`)
  return { status, startDate, slots: [...new Set(slots)] }
}

// The calendar slots planned for `date`, or why that cannot be known.
export function slotsForDate(
  calendar: CalendarIdeas,
  date: string,
  startSetting: string,
): { slots?: string[]; why?: string } {
  const start = startSetting || calendar.startDate
  if (!start) return { why: 'no start date (setting contentCalendarStartDate), so the day cannot be matched' }
  const day = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / DAY_MS) + 1
  if (Number.isNaN(day)) return { why: `start date ${start} is not a date` }
  if (day < 1) return { slots: [], why: `the calendar starts ${start}` }
  const today = new RegExp(`^Day ${day}[A-Z]$`)
  return { slots: calendar.slots.filter(s => today.test(s)) }
}

type IdeaStage = { stage: StageState; problem?: string }

// "Day 2A", "Day 2, Video A" and "day 2 a" all name the slot "Day 2A".
function slotName(value: string): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  const match = /^Day ?(\d+) ?,? ?(?:Video ?)?([A-Z])$/i.exec(clean)
  return match ? `Day ${Number(match[1])}${match[2]!.toUpperCase()}` : sanitizeText(clean, 40)
}

function ideasView(input: ContentInputs, startSetting: string): {
  ideas?: ContentDay['ideas']
  stageFor: (slotIndex: number, post?: ManifestPost) => IdeaStage
} {
  const calendar = input.calendar
  const unknown = (): IdeaStage => ({ stage: 'unknown' })
  if (!calendar) return { stageFor: unknown }
  const kind = input.kind === 'fixture' ? 'fixture' : 'snapshot'
  if (calendar.state !== 'ok') {
    return {
      ideas: { health: calendar.state, note: calendar.why, source: { label: 'Drive: content calendar', kind, checkedAt: input.checkedAt } },
      stageFor: unknown,
    }
  }
  const updatedAt = calendar.file.modifiedTime ? Date.parse(calendar.file.modifiedTime) : undefined
  const source: Source = {
    label: `Drive: ${calendar.file.title}`,
    url: `https://docs.google.com/document/d/${calendar.file.id}/edit`,
    kind,
    checkedAt: input.checkedAt,
    updatedAt: Number.isNaN(updatedAt) ? undefined : updatedAt,
  }
  const parsed = input.calendarIdeas
  if (!parsed || input.calendarError) {
    return {
      ideas: { health: 'source-error', note: `calendar could not be read (${input.calendarError ?? 'no text'})`, source },
      stageFor: unknown,
    }
  }
  if (parsed.slots.length === 0) {
    return { ideas: { health: 'source-error', note: 'no "Slot: Day N, Video X" entries found in the calendar', source }, stageFor: unknown }
  }
  const approved = parsed.status !== undefined && APPROVED_STATUS.test(parsed.status)
  const statusNote = `calendar status ${parsed.status ?? 'not stated'}${approved ? '' : ', not approved'}`
  const today = slotsForDate(parsed, input.date, startSetting)
  if (!today.slots) {
    return {
      ideas: { planned: parsed.slots.length, health: 'missing', note: `${parsed.slots.length} ideas planned; ${today.why}. Today's ideas are unknown. ${statusNote}`, source },
      stageFor: unknown,
    }
  }
  const todays = today.slots
  // A manifest's calendarSlot (content.calendarSlot) must be one of the slots scheduled for its
  // date; a slot from another day blocks the idea stage and says why.
  const stageFor = (i: number, post?: ManifestPost): IdeaStage => {
    const named = post?.content?.calendarSlot === undefined ? undefined : slotName(post.content.calendarSlot)
    if (named) {
      if (!todays.includes(named)) {
        const scheduled = todays.length > 0 ? `today: ${todays.join(', ')}` : 'no calendar entry that day'
        return { stage: 'blocked', problem: `calendarSlot ${named} is not scheduled for ${input.date} (${scheduled})` }
      }
      return { stage: approved ? 'done' : 'pending' }
    }
    if (!todays[i]) return { stage: 'pending' }
    return { stage: approved ? 'done' : 'pending' }
  }
  return {
    ideas: {
      planned: parsed.slots.length,
      today: todays,
      health: todays.length === 0 ? 'missing' : 'ok',
      note: todays.length === 0 ? `no calendar entry for ${input.date}${today.why ? ` (${today.why})` : ''}. ${statusNote}` : `today: ${todays.join(', ')}. ${statusNote}`,
      source,
    },
    stageFor,
  }
}

// ---- The day ----------------------------------------------------------------

export const publishingPath = (date: string) => `Publishing/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}`

export function evaluateContentDay(input: ContentInputs, startSetting = ''): ContentDay {
  const kind = input.kind ?? 'observed'
  const path = publishingPath(input.date)
  const { ideas, stageFor } = ideasView(input, startSetting)
  const slots = ['01', '02']
  const unknown = () => slots.map((s, i) => unknownPost(s, stageFor(i).stage))
  const day = (rest: Omit<ContentDay, 'date' | 'target' | 'ideas'>): ContentDay => ({
    date: input.date,
    target: DAILY_TARGET,
    ideas,
    ...rest,
  })

  if (input.ready.state !== 'ok') {
    return day({
      published: null,
      posts: unknown(),
      health: input.ready.state,
      note: input.ready.why,
      source: { label: 'Drive: Content folder', kind, checkedAt: input.checkedAt },
    })
  }

  const readyUrl = `https://drive.google.com/drive/folders/${input.ready.file.id}`
  const readySource: Source = {
    label: `Drive: ${input.ready.file.title}/`,
    url: readyUrl,
    kind,
    checkedAt: input.checkedAt,
    updatedAt: input.ready.file.modifiedTime ? Date.parse(input.ready.file.modifiedTime) : undefined,
  }
  if (!input.dayFolder) {
    return day({
      published: null,
      posts: unknown(),
      health: 'missing',
      note: input.dayMissingWhy ?? `No Content/${path} folder, so nothing can be counted for today`,
      source: readySource,
    })
  }

  const manifestFiles = input.dayFiles.filter(f => f.title === 'manifest.json')
  const manifestFile = manifestFiles[0]
  const updated = Date.parse((manifestFile ?? input.dayFolder).modifiedTime ?? '')
  const source: Source = {
    label: manifestFile ? `Drive: Content/${path}/manifest.json` : `Drive: Content/${path}/`,
    url: `https://drive.google.com/drive/folders/${input.dayFolder.id}`,
    kind: manifestFile && kind !== 'fixture' ? 'reported' : kind,
    checkedAt: input.checkedAt,
    updatedAt: Number.isNaN(updated) ? undefined : updated,
  }
  const failed = (health: Health, note: string) => day({ published: null, posts: unknown(), health, note, source })

  if (input.dayFilesProblem) return failed(input.dayFilesProblem.health, input.dayFilesProblem.why)
  if (manifestFiles.length > 1) {
    return failed('source-error', `${manifestFiles.length} files named manifest.json in Content/${path}; cannot tell which is current`)
  }
  if (!manifestFile) {
    const why = 'manifest.json is missing from the day folder'
    const posts = slots.map((slot, i) => {
      const post = unknownPost(slot, stageFor(i).stage)
      post.stages.media = input.dayFiles.some(f => f.title === `post-${slot}.mp4`) ? 'done' : 'pending'
      post.blockedReason = why
      return post
    })
    return day({ published: null, posts, health: 'blocked', note: why, source })
  }
  if (input.manifestError) return failed('source-error', `manifest.json could not be read: ${sanitizeText(input.manifestError, 160)}`)

  const check = validateManifest(input.manifest, input.date)
  if (!check.ok) {
    const shown = check.errors.slice(0, 4).join('; ')
    return failed('source-error', `manifest.json is invalid, so nothing is counted: ${shown}${check.errors.length > 4 ? ` (+${check.errors.length - 4} more)` : ''}`)
  }

  const rules = { date: input.date, now: input.now }
  const ordered = [...check.posts].sort((a, b) => a.slot - b.slot)
  const posts = ordered.map(post => {
    const idea = stageFor(post.slot - 1, post)
    const evaluated = evaluatePost(post, input.dayFiles, idea.stage, rules)
    return idea.problem ? { ...evaluated, ideaProblem: idea.problem } : evaluated
  })
  const published = posts.filter(p => p.isPublished).length
  const anyBlocked = posts.some(p => p.blockedReason)
  const ideaProblems = posts.filter(p => p.ideaProblem).map(p => `post-${p.slot}: ${p.ideaProblem}`)
  // A post planned for another day's slot is flagged; the count still stands.
  const health: Health = anyBlocked ? 'blocked' : ideaProblems.length > 0 ? 'conflict' : published === 0 ? 'verified-zero' : 'ok'
  return day({
    published,
    posts,
    health,
    note: ideaProblems.length > 0
      ? `${published} of ${DAILY_TARGET} reported published; ${ideaProblems.join('; ')}`
      : anyBlocked
      ? `${published} of ${DAILY_TARGET} reported published; publishing is blocked`
      : published === 0
        ? `Valid manifest read: 0 of ${DAILY_TARGET} reported published so far`
        : `${published} of ${DAILY_TARGET} reported published`,
    source,
  })
}

// ---- Dates ------------------------------------------------------------------

export function edmontonDate(now: number): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: CONTENT_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(now))
    if (/^\d{4}-\d{2}-\d{2}$/.test(parts)) return parts
  } catch {
    // fall through to a fixed offset
  }
  return new Date(now - 6 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function ago(then: number | undefined, now: number): string {
  if (then === undefined || Number.isNaN(then)) return 'unknown'
  const s = Math.max(0, Math.round((now - then) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

export function clock(ms: number | undefined): string {
  if (ms === undefined || Number.isNaN(ms)) return '?'
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: CONTENT_TIMEZONE,
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(ms))
  } catch {
    return `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`
  }
}

export function decodeBase64(b64: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '')
  const bytes: number[] = []
  let buffer = 0
  let bits = 0
  for (const ch of clean) {
    buffer = ((buffer << 6) | alphabet.indexOf(ch)) & 0xffffff
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 0xff)
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes))
}

// ---- Social media -------------------------------------------------------------
//
// Built from the Social Ops manifests of recent days: what each platform's
// receipts report. Nothing here is confirmed with the platforms. Audience
// numbers (followers, views, engagement) come from Zernio; see zernioRows.

export const SOCIAL_WINDOW_DAYS = 7

export function parseAccounts(text: string): Partial<Record<Platform, string>> {
  const accounts: Partial<Record<Platform, string>> = {}
  const aliases: Record<string, Platform> = {
    instagram: 'instagram',
    ig: 'instagram',
    tiktok: 'tiktok',
    youtube: 'youtubeShorts',
    youtubeshorts: 'youtubeShorts',
    facebook: 'facebook',
    fb: 'facebook',
  }
  for (const part of text.split(',')) {
    const [key, value] = part.split('=').map(s => s.trim())
    const platform = key ? aliases[key.toLowerCase().replace(/[\s_-]/g, '')] : undefined
    if (platform && value) accounts[platform] = sanitizeText(value, 60)
  }
  return accounts
}

export function socialRows(input: {
  days: readonly ContentDay[]
  accounts: Partial<Record<Platform, string>>
  checkedAt: number
  kind?: Source['kind']
  windowDays?: number
}): StatusRow[] {
  const windowDays = input.windowDays ?? SOCIAL_WINDOW_DAYS
  const counted = input.days.filter(d => d.published !== null)
  const posts = counted.flatMap(d => d.posts)
  const fixture = input.kind === 'fixture'
  const prefix = fixture ? 'DEMO ' : ''
  const latestAt = Math.max(0, ...posts.flatMap(p => p.receipts.map(r => r.at)))
  const source: Source = {
    label: `${prefix}Drive: Content/Publishing manifests, last ${windowDays} days`,
    kind: fixture ? 'fixture' : 'reported',
    checkedAt: input.checkedAt,
    updatedAt: latestAt > 0 ? latestAt : undefined,
  }
  const coverage = `${counted.length} of ${windowDays} days had a valid manifest`
  const rows: StatusRow[] = PLATFORMS.map(platform => {
    const label = PLATFORM_LABEL[platform]
    const published = posts.reduce((n, p) => n + p.receipts.filter(r => r.platform === platform).length, 0)
    const failed = posts.filter(p => p.failedOn.includes(platform)).length
    const targeted = posts.filter(p => p.stages[platform] !== 'off').length
    const account = input.accounts[platform]
    const who = account ? `account ${account} (from settings, not verified with ${label})` : 'no account set (setting socialAccounts)'
    let health: Health
    let status: string
    let detail: string
    if (counted.length === 0) {
      health = 'missing'
      status = 'NO COUNT'
      detail = `no packaged day with a valid manifest in the last ${windowDays} days, so nothing can be counted; ${who}`
    } else if (targeted === 0) {
      health = 'not-configured'
      status = 'NOT TARGETED'
      detail = `no post in the last ${windowDays} days targets ${label}; ${who}`
    } else {
      health = failed > 0 ? 'blocked' : published === 0 ? 'verified-zero' : 'ok'
      status = `${published} REPORTED POST${published === 1 ? '' : 'S'}`
      detail = `${published} reported published of ${targeted} targeted${failed ? `, ${failed} failed or not counted` : ''} (${coverage}); ${who}`
    }
    const isInfo = health === 'not-configured' || health === 'verified-zero' || health === 'missing'
    return { id: `social-${platform}`, project: 'social', title: `${prefix}${label}`, status, detail, source, health, needsElia: false, kind: 'summary', isInfo }
  })
  const latest = posts
    .flatMap(p => p.receipts.map(r => ({ post: p, receipt: r })))
    .sort((a, b) => b.receipt.at - a.receipt.at)
    .slice(0, 5)
  for (const { post, receipt } of latest) {
    rows.push({
      id: `${post.id}-${receipt.platform}`,
      project: 'social',
      title: `${prefix}${PLATFORM_LABEL[receipt.platform]} ${post.id}`,
      status: 'REPORTED PUBLISHED',
      detail: `post ${sanitizeText(receipt.postId, 60)} at ${new Date(receipt.at).toISOString()}`,
      source: { ...source, url: sanitizeUrl(receipt.url), updatedAt: receipt.at },
      health: 'ok',
      needsElia: false,
      kind: 'summary',
    })
  }
  return rows
}

// ---- Zernio -------------------------------------------------------------------
//
// Audience numbers from Zernio, read-only: the connected accounts, follower
// counts and growth, and views and engagement per post. Zernio reports what the
// platforms report; nothing is estimated, and a part Zernio does not answer
// (for example follower counts without its Analytics add-on) says why.

export const ZERNIO_POST_DAYS = 7
export const ZERNIO_FOLLOWER_DAYS = 30

export type ZernioAccount = { id: string; platform: string; username: string }
export type ZernioFollowers = { followers?: number; growth?: number; growthPct?: number }
export type ZernioPost = {
  platform: string
  accountId?: string
  account?: string
  publishedAt?: number
  url?: string
  views?: number
  impressions?: number
  likes?: number
  comments?: number
  shares?: number
  saves?: number
  engagementRate?: number
}
// A part Zernio answered, or why it did not.
export type ZernioPart<T> = { ok: true; value: T } | { ok: false; why: string }

export type ZernioInput =
  | { state: 'not-configured' | 'access-denied' | 'source-error'; why: string }
  | {
      state: 'ok'
      server: string
      accounts: readonly ZernioAccount[]
      followers: ZernioPart<Record<string, ZernioFollowers>>
      posts: ZernioPart<readonly ZernioPost[]>
    }

const ZERNIO_PLATFORM_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  twitter: 'X',
  x: 'X',
  threads: 'Threads',
  pinterest: 'Pinterest',
  bluesky: 'Bluesky',
  reddit: 'Reddit',
  googlebusiness: 'Google Business',
}

export const zernioPlatformLabel = (platform: string) => {
  const key = platform.toLowerCase().replace(/[\s_-]/g, '')
  return ZERNIO_PLATFORM_LABEL[key] ?? sanitizeText(platform.charAt(0).toUpperCase() + platform.slice(1), 30)
}

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)

// 12345 -> "12,345", without relying on Intl.
export function thousands(value: number): string {
  const n = Math.round(value)
  const digits = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return n < 0 ? `-${digits}` : digits
}

const plural = (n: number, word: string) => `${thousands(n)} ${word}${Math.round(n) === 1 ? '' : 's'}`

// accounts_list answers in text ("- instagram: acme (ID: 66b2...)") or JSON.
export function parseZernioAccounts(text: string): ZernioAccount[] {
  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed) as unknown
    const list = Array.isArray(parsed) ? parsed : ((parsed as { accounts?: unknown; data?: unknown }).accounts ?? (parsed as { data?: unknown }).data)
    if (!Array.isArray(list)) throw new Error('no accounts list in the answer')
    return list.flatMap(item => {
      if (!item || typeof item !== 'object') return []
      const a = item as Record<string, unknown>
      const id = String(a._id ?? a.id ?? a.accountId ?? '')
      const platform = String(a.platform ?? '')
      if (!id || !platform) return []
      if (a.isActive === false) return []
      return [{ id: sanitizeText(id, 40), platform: sanitizeText(platform, 30), username: sanitizeText(String(a.username ?? a.displayName ?? ''), 60) }]
    })
  }
  const accounts: ZernioAccount[] = []
  for (const line of trimmed.split('\n')) {
    const m = /^\s*[-*]\s*([A-Za-z_ -]+):\s*(.*?)\s*\(ID:\s*([A-Za-z0-9_-]+)\)\s*$/.exec(line)
    if (m) accounts.push({ platform: sanitizeText(m[1]!, 30), username: sanitizeText(m[2]!, 60), id: sanitizeText(m[3]!, 40) })
  }
  if (!accounts.length && !/\b(no|0)\b[^\n]*accounts?/i.test(trimmed)) throw new Error('the accounts answer could not be read')
  return accounts
}

// accounts_get_follower_stats: { accounts: [{ _id, platform, username, currentFollowers, growth, growthPercentage }] }
export function parseZernioFollowers(value: unknown): { followers: Record<string, ZernioFollowers>; accounts: ZernioAccount[] } {
  const list = (value as { accounts?: unknown })?.accounts
  if (!Array.isArray(list)) throw new Error('no follower accounts in the answer')
  const followers: Record<string, ZernioFollowers> = {}
  const accounts: ZernioAccount[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const a = item as Record<string, unknown>
    const id = sanitizeText(String(a._id ?? a.id ?? a.accountId ?? ''), 40)
    if (!id) continue
    followers[id] = { followers: num(a.currentFollowers), growth: num(a.growth), growthPct: num(a.growthPercentage) }
    if (a.platform) accounts.push({ id, platform: sanitizeText(String(a.platform), 30), username: sanitizeText(String(a.username ?? ''), 60) })
  }
  return { followers, accounts }
}

// analytics_get_analytics list mode: posts with their analytics. A post sent to
// several platforms counts once per platform, each with its own numbers.
export function parseZernioPosts(value: unknown): ZernioPost[] {
  const v = value as Record<string, unknown>
  const list = Array.isArray(value) ? value : (v?.posts ?? v?.data ?? v?.results)
  if (!Array.isArray(list)) throw new Error('no posts in the answer')
  const metrics = (raw: unknown) => {
    const a = (raw ?? {}) as Record<string, unknown>
    return {
      views: num(a.views),
      impressions: num(a.impressions),
      likes: num(a.likes),
      comments: num(a.comments),
      shares: num(a.shares),
      saves: num(a.saves),
      engagementRate: num(a.engagementRate),
    }
  }
  const time = (raw: unknown) => {
    const at = typeof raw === 'string' ? Date.parse(raw) : NaN
    return Number.isNaN(at) ? undefined : at
  }
  const url = (raw: unknown) => (typeof raw === 'string' ? sanitizeUrl(raw) : undefined)
  return list.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const p = item as Record<string, unknown>
    const publishedAt = time(p.publishedAt)
    const per = Array.isArray(p.platformAnalytics) ? (p.platformAnalytics as Record<string, unknown>[]) : []
    if (per.length) {
      return per
        .filter(x => x && typeof x === 'object' && (x.status === undefined || x.status === 'published'))
        .map(x => ({
          platform: sanitizeText(String(x.platform ?? p.platform ?? ''), 30),
          accountId: x.accountId ? sanitizeText(String(x.accountId), 40) : undefined,
          account: x.accountUsername ? sanitizeText(String(x.accountUsername), 60) : undefined,
          publishedAt: time(x.publishedAt) ?? publishedAt,
          url: url(x.platformPostUrl),
          ...metrics(x.analytics),
        }))
    }
    if (p.status !== undefined && p.status !== 'published') return []
    return [
      {
        platform: sanitizeText(String(p.platform ?? ''), 30),
        accountId: p.accountId ? sanitizeText(String(p.accountId), 40) : undefined,
        account: p.accountUsername ? sanitizeText(String(p.accountUsername), 60) : undefined,
        publishedAt,
        url: url(p.platformPostUrl),
        ...metrics(p.analytics),
      },
    ]
  })
}

const sum = (posts: readonly ZernioPost[], key: 'views' | 'likes' | 'comments' | 'shares') => {
  const known = posts.map(p => p[key]).filter((n): n is number => n !== undefined)
  return known.length ? known.reduce((a, b) => a + b, 0) : undefined
}

function engagementParts(posts: readonly ZernioPost[]): string[] {
  const rates = posts.map(p => p.engagementRate).filter((n): n is number => n !== undefined)
  const views = sum(posts, 'views')
  const likes = sum(posts, 'likes')
  const comments = sum(posts, 'comments')
  const shares = sum(posts, 'shares')
  return [
    views !== undefined ? plural(views, 'view') : undefined,
    likes !== undefined ? plural(likes, 'like') : undefined,
    comments !== undefined ? plural(comments, 'comment') : undefined,
    shares !== undefined ? plural(shares, 'share') : undefined,
    rates.length ? `average engagement ${(rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(1)}%` : undefined,
  ].filter((s): s is string => Boolean(s))
}

export function zernioRows(input: ZernioInput, now: number, kind: Source['kind'] = 'observed'): StatusRow[] {
  const prefix = kind === 'fixture' ? 'DEMO ' : ''
  const base = { project: 'social' as const, needsElia: false }
  const NONE = 'No numbers are shown or estimated.'
  if (input.state !== 'ok') {
    const source: Source = { label: `${prefix}Zernio`, kind, checkedAt: now }
    const notSet = input.state === 'not-configured'
    return [
      {
        ...base,
        id: 'social-metrics',
        title: `${prefix}Audience metrics`,
        kind: 'source',
        status: 'NOT CONNECTED',
        detail: `${sanitizeText(input.why, 200)}. Followers, views and engagement come from Zernio. ${NONE}`,
        source,
        health: input.state,
        isInfo: notSet,
      },
    ]
  }
  const server = sanitizeText(input.server, 60)
  const source: Source = { label: `${prefix}Zernio (${server}), followers last ${ZERNIO_FOLLOWER_DAYS} days, posts last ${ZERNIO_POST_DAYS} days`, kind, checkedAt: now }
  if (!input.accounts.length) {
    return [
      {
        ...base,
        id: 'social-metrics',
        title: `${prefix}Audience metrics`,
        kind: 'source',
        status: 'NO ACCOUNTS',
        detail: `Zernio answered, but no social account is connected to it yet. Connect accounts in Zernio to see followers and post numbers. ${NONE}`,
        source,
        health: 'not-configured',
        isInfo: true,
      },
    ]
  }
  const posts = input.posts.ok ? input.posts.value : []
  const followers = input.followers.ok ? input.followers.value : {}
  const known = input.accounts.map(a => followers[a.id]?.followers).filter((n): n is number => n !== undefined)
  const gaps = [
    input.followers.ok ? undefined : `follower counts not available (${sanitizeText(input.followers.why, 160)})`,
    input.posts.ok ? undefined : `post numbers not available (${sanitizeText(input.posts.why, 160)})`,
  ].filter(Boolean)
  const summary = [
    plural(input.accounts.length, 'connected account'),
    known.length ? `${thousands(known.reduce((a, b) => a + b, 0))} followers in total` : undefined,
    input.posts.ok ? `${plural(posts.length, 'post')} published in the last ${ZERNIO_POST_DAYS} days` : undefined,
    ...(input.posts.ok ? engagementParts(posts) : []),
    ...gaps,
  ].filter(Boolean)
  const rows: StatusRow[] = [
    {
      ...base,
      id: 'social-metrics',
      title: `${prefix}Audience metrics`,
      kind: 'summary',
      status: plural(input.accounts.length, 'ACCOUNT').toUpperCase(),
      detail: summary.join(', '),
      source,
      health: gaps.length ? 'source-error' : 'ok',
      isInfo: true,
    },
  ]
  for (const account of input.accounts) {
    const label = zernioPlatformLabel(account.platform)
    const f = followers[account.id]
    const mine = posts.filter(p => (p.accountId ? p.accountId === account.id : p.platform.toLowerCase() === account.platform.toLowerCase()))
    const growth =
      f?.growth !== undefined
        ? `${f.growth >= 0 ? '+' : ''}${thousands(f.growth)}${f.growthPct !== undefined ? ` (${f.growthPct >= 0 ? '+' : ''}${f.growthPct.toFixed(1)}%)` : ''} over ${ZERNIO_FOLLOWER_DAYS} days`
        : undefined
    const postPart = input.posts.ok
      ? [`${plural(mine.length, 'post')} in the last ${ZERNIO_POST_DAYS} days`, ...engagementParts(mine)].join(', ')
      : undefined
    const followerPart = !input.followers.ok ? 'follower count not available' : f?.followers === undefined ? 'Zernio reported no follower count' : undefined
    rows.push({
      ...base,
      id: `zernio-${account.id}`,
      title: `${prefix}${label} ${account.username || account.id}`,
      kind: 'summary',
      status: f?.followers !== undefined ? plural(f.followers, 'FOLLOWER').toUpperCase() : 'FOLLOWERS UNKNOWN',
      detail: [growth, followerPart, postPart].filter(Boolean).join('; '),
      source,
      health: f?.followers !== undefined ? 'ok' : 'source-error',
      isInfo: true,
    })
  }
  const latest = [...posts].sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0)).slice(0, 5)
  latest.forEach((post, i) => {
    const label = zernioPlatformLabel(post.platform)
    const when = post.publishedAt ? edmontonDate(post.publishedAt) : 'date not reported'
    rows.push({
      ...base,
      id: `zernio-post-${i + 1}`,
      title: `${prefix}${label} post ${when}`,
      kind: 'summary',
      status: post.views !== undefined ? plural(post.views, 'VIEW').toUpperCase() : 'VIEWS UNKNOWN',
      detail: [post.account ? `account ${post.account}` : undefined, ...engagementParts([{ ...post, views: undefined }])].filter(Boolean).join(', ') || 'Zernio reported no engagement numbers',
      source: { ...source, url: post.url, updatedAt: post.publishedAt },
      health: 'ok',
      isInfo: true,
    })
  })
  return rows
}

// ---- Website ----------------------------------------------------------------------

export type Deployment = { environment: string; createdAt: number; state: string; url?: string }

// The repository's deployments as GitHub records them (Vercel writes these).
export function deploymentRow(deployments: readonly Deployment[], repo: string, now: number, kind: Source['kind'] = 'observed'): StatusRow {
  const prefix = kind === 'fixture' ? 'DEMO ' : ''
  const sorted = [...deployments].sort((a, b) => b.createdAt - a.createdAt)
  const latest = sorted[0]
  const source: Source = {
    label: `${prefix}GitHub ${repo} deployments`,
    url: `https://github.com/${repo}/deployments`,
    kind,
    checkedAt: now,
    updatedAt: latest?.createdAt,
  }
  const base = { id: 'website-deployments', project: 'website' as const, title: `${prefix}Website deployments`, needsElia: false, kind: 'summary' as const }
  if (!latest) return { ...base, status: 'NONE', detail: 'no deployments are recorded for the repository', source, health: 'missing' }
  const host = latest.url ? safeHost(latest.url) : undefined
  const failures = sorted.filter(d => /^(failure|error)$/i.test(d.state)).length
  const hasProduction = sorted.some(d => /^production$/i.test(d.environment))
  const failed = /^(failure|error)$/i.test(latest.state)
  const detail = [
    `latest ${sanitizeText(latest.environment, 30)} deployment ${sanitizeText(latest.state, 20)} at ${new Date(latest.createdAt).toISOString()}${host ? ` (${host})` : ''}`,
    `${failures} of the last ${sorted.length} failed`,
    hasProduction ? undefined : 'no production deployment is recorded on GitHub (the public site may be hosted elsewhere; see Public site)',
  ]
    .filter(Boolean)
    .join('; ')
  return {
    ...base,
    status: failed ? 'LATEST FAILED' : `LATEST ${sanitizeText(latest.state, 20).toUpperCase()}`,
    detail,
    source: { ...source, url: latest.url ? sanitizeUrl(latest.url) ?? source.url : source.url },
    health: failed ? 'blocked' : 'ok',
  }
}

function safeHost(value: string): string | undefined {
  try {
    return new URL(value).hostname
  } catch {
    return undefined
  }
}

const ANALYTICS: [string, RegExp][] = [
  ['Vercel Web Analytics', /\/_vercel\/insights|@vercel\/analytics|va\.vercel-scripts\.com/i],
  ['Google Analytics', /googletagmanager\.com|gtag\(|google-analytics\.com/i],
  ['Plausible', /plausible\.io/i],
  ['Cloudflare Web Analytics', /static\.cloudflareinsights\.com/i],
  ['Umami', /umami\.(is|dev)|data-website-id/i],
  ['Fathom', /usefathom\.com/i],
  ['PostHog', /posthog\.com|posthog-js|posthog\.init/i],
]

export const hasPosthogSnippet = (html: string) => ANALYTICS.find(([name]) => name === 'PostHog')![1].test(html)

// Visitor numbers need an analytics tool on the page and read access to it.
export function trafficRow(
  html: string | undefined,
  where: string,
  now: number,
  kind: Source['kind'] = 'observed',
  why?: string,
  connected: readonly string[] = [],
): StatusRow {
  const prefix = kind === 'fixture' ? 'DEMO ' : ''
  const source: Source = { label: `${prefix}${where}`, kind, checkedAt: now }
  const base = { id: 'website-traffic', project: 'website' as const, title: `${prefix}Website traffic`, needsElia: false, isInfo: true, kind: 'source' as const }
  if (html === undefined) {
    return { ...base, status: 'UNKNOWN', detail: `the page could not be read (${why ?? 'no page'}), so its analytics are unknown`, source, health: 'source-error' }
  }
  const found = ANALYTICS.filter(([, pattern]) => pattern.test(html)).map(([name]) => name)
  if (found.length === 0) {
    return {
      ...base,
      status: 'NO ANALYTICS',
      detail: 'no analytics script is on the page, so there are no visitor numbers to read; adding one (for example Cloudflare Web Analytics or Google Analytics, both free) and a read-only token would be needed',
      source,
      health: 'not-configured',
    }
  }
  const unread = found.filter(name => !connected.includes(name))
  if (unread.length === 0) {
    return { ...base, status: 'CONNECTED', detail: `${found.join(', ')} is on the page, and its numbers are read below`, source, health: 'ok' }
  }
  return {
    ...base,
    status: 'NOT CONNECTED',
    detail: `${unread.join(', ')} is on the page, but this dashboard has no read access to its numbers; a read-only API token would be needed`,
    source,
    health: 'not-configured',
  }
}

// One check of the public site, if a URL is set.
export function liveSiteRow(
  url: string,
  result: { status?: number; ms?: number; title?: string; host?: string; error?: string } | undefined,
  now: number,
  kind: Source['kind'] = 'observed',
): StatusRow {
  const prefix = kind === 'fixture' ? 'DEMO ' : ''
  const base = { id: 'website-live', project: 'website' as const, title: `${prefix}Public site`, needsElia: false, kind: 'summary' as const }
  const clean = url ? sanitizeUrl(url) : undefined
  const source: Source = { label: `${prefix}${clean ?? 'public site'}`, url: clean, kind, checkedAt: now }
  if (!url) {
    return { ...base, status: 'NOT SET', detail: 'no public website URL is set (setting websiteUrl), so the live site is not checked', source, health: 'not-configured', isInfo: true }
  }
  if (!clean) return { ...base, status: 'BAD URL', detail: 'websiteUrl is not a valid https URL', source, health: 'source-error' }
  if (!result || result.error || result.status === undefined) {
    return { ...base, status: 'UNREACHABLE', detail: `the site could not be reached (${sanitizeText(result?.error ?? 'no answer', 120)})`, source, health: 'blocked' }
  }
  const ok = result.status >= 200 && result.status < 400
  const title = result.title ? `, page title "${sanitizeText(result.title, 80)}"` : ''
  const served = result.host ? `, served by ${sanitizeText(result.host, 30)}` : ''
  return {
    ...base,
    status: `HTTP ${result.status}`,
    detail: `answered HTTP ${result.status}${result.ms !== undefined ? ` in ${result.ms} ms` : ''}${title}${served}`,
    source: { ...source, updatedAt: now },
    health: ok ? 'ok' : 'blocked',
  }
}

// ---- PostHog ------------------------------------------------------------------

export const POSTHOG_WINDOW_DAYS = 7

export type PosthogOverview = {
  visitors?: number | null
  views?: number | null
  sessions?: number | null
  durationS?: number | null
  bounce?: number | null
}

export type PosthogInput =
  | { state: 'not-configured' | 'access-denied' | 'source-error'; why: string }
  | {
      state: 'ok'
      project: string
      url?: string
      ingested: boolean
      snippetOnPage?: boolean
      overview?: PosthogOverview
      pages?: readonly (readonly [string, number])[]
      channels?: readonly (readonly [string, number])[]
    }

const count = (value: number | null | undefined) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : undefined)

// Read-only web analytics from PostHog: aggregates only, never people.
export function posthogRows(input: PosthogInput, now: number, kind: Source['kind'] = 'observed'): StatusRow[] {
  const prefix = kind === 'fixture' ? 'DEMO ' : ''
  const base = { project: 'website' as const, needsElia: false }
  if (input.state !== 'ok') {
    const source: Source = { label: `${prefix}PostHog`, kind, checkedAt: now }
    return [{ ...base, id: 'website-posthog', title: `${prefix}PostHog`, kind: 'source', status: HEALTH_LABEL[input.state], detail: sanitizeText(input.why, 200), source, health: input.state, isInfo: input.state === 'not-configured' }]
  }
  const project = sanitizeText(input.project, 60)
  const source: Source = { label: `${prefix}PostHog project ${project}, last ${POSTHOG_WINDOW_DAYS} days`, url: input.url ? sanitizeUrl(input.url) : undefined, kind, checkedAt: now }
  if (!input.ingested) {
    return [
      {
        ...base,
        id: 'website-posthog',
        title: `${prefix}PostHog`,
        kind: 'source',
        status: 'NO DATA YET',
        detail: `PostHog project ${project} has received no events${input.snippetOnPage === true ? '; the PostHog snippet is on the page, so numbers appear after the first visits' : input.snippetOnPage === false ? ', and the PostHog snippet is not on the public page yet' : ''}. No visitor numbers are shown.`,
        source,
        health: 'not-configured',
        isInfo: true,
      },
    ]
  }
  const o = input.overview ?? {}
  const visitors = count(o.visitors)
  const parts = [
    visitors !== undefined ? `${visitors} visitors` : undefined,
    count(o.views) !== undefined ? `${count(o.views)} pageviews` : undefined,
    count(o.sessions) !== undefined ? `${count(o.sessions)} sessions` : undefined,
    count(o.durationS) !== undefined ? `average session ${count(o.durationS)} s` : undefined,
    typeof o.bounce === 'number' ? `bounce rate ${Math.round(o.bounce <= 1 ? o.bounce * 100 : o.bounce)}%` : undefined,
  ].filter(Boolean)
  const rows: StatusRow[] = [
    {
      ...base,
      id: 'website-visitors',
      title: `${prefix}Website visitors`,
      kind: 'summary',
      status: visitors === undefined ? 'UNKNOWN' : `${visitors} VISITOR${visitors === 1 ? '' : 'S'}`,
      detail: parts.length ? parts.join(', ') : 'PostHog returned no overview numbers',
      source,
      health: visitors === undefined ? 'source-error' : visitors === 0 ? 'verified-zero' : 'ok',
      isInfo: visitors === 0,
    },
  ]
  const list = (items: readonly (readonly [string, number])[] | undefined) =>
    (items ?? []).slice(0, 5).map(([name, n]) => `${sanitizeText(name || '(none)', 60)} ${Math.round(n)}`).join(', ')
  if (input.pages?.length) {
    rows.push({ ...base, id: 'website-top-pages', title: `${prefix}Top pages`, kind: 'summary', status: 'VISITORS BY PAGE', detail: list(input.pages), source, health: 'ok', isInfo: true })
  }
  if (input.channels?.length) {
    rows.push({ ...base, id: 'website-channels', title: `${prefix}Traffic sources`, kind: 'summary', status: 'VISITORS BY CHANNEL', detail: list(input.channels), source, health: 'ok', isInfo: true })
  }
  return rows
}

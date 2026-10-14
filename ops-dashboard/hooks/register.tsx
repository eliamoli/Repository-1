import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type {
  Activity,
  AgentRow,
  ContentDay,
  Health,
  Platform,
  ProjectFilter,
  Stage,
  ProjectKey,
  Snapshot,
  Source,
  StatusRow,
  UsageView,
} from '../types'
import { demoSnapshot } from './fixtures'
import {
  ago,
  classifyBridgerow,
  clock,
  decodeBase64,
  detectConflicts,
  edmontonDate,
  evaluateContentDay,
  HEALTH_LABEL,
  isAccessError,
  isDeniedTitle,
  parseCalendar,
  parseRecords,
  PROJECT_LABELS,
  rowsFromRecords,
  sanitizeDeep,
  sanitizeText,
  sanitizeUrl,
  deploymentRow,
  liveSiteRow,
  hasPosthogSnippet,
  POSTHOG_WINDOW_DAYS,
  posthogRows,
  parseAccounts,
  publishingPath,
  SOCIAL_WINDOW_DAYS,
  socialRows,
  parseZernioAccounts,
  parseZernioFollowers,
  parseZernioPosts,
  zernioRows,
  ZERNIO_FOLLOWER_DAYS,
  ZERNIO_POST_DAYS,
  sourceRow,
  STAGES,
  trafficRow,
  worst,
  type Deployment,
  type CalendarIdeas,
  type ContentInputs,
  type DriveFile,
  type SourceState,
} from './model'

// Read-only data sources. Drive through the connected Google Drive connector
// (three read tools, nothing else) on explicit Work Drive IDs, GitHub through
// `gh api` GETs (or the public API), the session's own usage and agents. Each
// source fails on its own and becomes a line saying why, never a guess.

const DRIVE_READ_TOOLS = new Set(['search_files', 'get_file_metadata', 'download_file_content'])
// The PostHog connector has one tool, exec, taking a command line. Only these
// read-only commands are sent; anything else is refused before the call.
const POSTHOG_READ = /^call --json (project-get|query-web-overview|query-web-stats) \{/
// Zernio can post, schedule and delete. The dashboard only ever sends these
// three reads; any other tool is refused before the call.
const ZERNIO_READ_TOOLS = new Set(['accounts_list', 'accounts_get_follower_stats', 'analytics_get_analytics'])
const FOLDER = 'application/vnd.google-apps.folder'
const PAGE_SIZE = 100
const MAX_PAGES = 5

type Config = {
  driveServer: string
  workAccount: string
  bridgerowFolderId: string
  paliosFolderId: string
  paliosDocTitles: string[]
  danceAlchemyFolderId: string
  danceAlchemyDocTitles: string[]
  contentFolderId: string
  contentCalendarDocId: string
  contentCalendarStartDate: string
  approvedSharedIds: Set<string>
  socialAccounts: Partial<Record<Platform, string>>
  websiteRepo: string
  websiteBranch: string
  websiteUrl: string
  contentEngineDir: string
  posthogServer: string
  posthogProjectId: string
  zernioServer: string
  staleDays: number
}

function configFrom(options: PluginOptions): Config {
  const text = (key: string) => (typeof options[key] === 'string' ? (options[key] as string).trim() : '')
  const list = (key: string) =>
    text(key)
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)
  return {
    driveServer: text('driveServer') || 'claude.ai Google Drive',
    workAccount: text('workAccount').toLowerCase(),
    bridgerowFolderId: text('bridgerowFolderId'),
    paliosFolderId: text('paliosFolderId'),
    paliosDocTitles: list('paliosDocTitles'),
    danceAlchemyFolderId: text('danceAlchemyFolderId'),
    danceAlchemyDocTitles: list('danceAlchemyDocTitles'),
    contentFolderId: text('contentFolderId'),
    contentCalendarDocId: text('contentCalendarDocId'),
    contentCalendarStartDate: /^\d{4}-\d{2}-\d{2}$/.test(text('contentCalendarStartDate')) ? text('contentCalendarStartDate') : '',
    approvedSharedIds: new Set(list('approvedSharedIds')),
    socialAccounts: parseAccounts(text('socialAccounts')),
    websiteRepo: text('websiteRepo'),
    websiteBranch: text('websiteBranch') || 'main',
    websiteUrl: text('websiteUrl'),
    contentEngineDir: text('contentEngineDir'),
    posthogServer: text('posthogServer') || 'claude.ai PostHog',
    posthogProjectId: text('posthogProjectId'),
    zernioServer: typeof options.zernioServer === 'string' ? options.zernioServer.trim() : 'plugin:zernio:zernio',
    staleDays: typeof options.staleDays === 'number' ? options.staleDays : 7,
  }
}

const message = (error: unknown) => sanitizeText(String(error instanceof Error ? error.message : error), 160)
const quoteId = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, '')

// ---- Drive ------------------------------------------------------------------

async function drive($: EngineInterface, config: Config, tool: string, args: Record<string, unknown>) {
  if (!DRIVE_READ_TOOLS.has(tool)) throw new Error(`refused non-read Drive tool ${tool}`)
  const result = await $.mcp.call(config.driveServer, tool, args)
  const text = result.content.find(block => block.type === 'text')?.text ?? ''
  if (result.isError) throw new Error(`${tool}: ${text.slice(0, 160)}`)
  return JSON.parse(text) as Record<string, unknown>
}

// ---- Zernio -----------------------------------------------------------------

async function zernio($: EngineInterface, config: Config, tool: string, args: Record<string, unknown> = {}): Promise<string> {
  if (!ZERNIO_READ_TOOLS.has(tool)) throw new Error(`refused Zernio tool ${tool}, which is not a read`)
  const result = await $.mcp.call(config.zernioServer, tool, args)
  const text = result.content.find(block => block.type === 'text')?.text ?? ''
  if (result.isError) throw new Error(text.slice(0, 160) || `${tool} failed`)
  return text
}

const zernioWhy = (error: unknown) => {
  const why = message(error)
  return /add-?on|\b40[23]\b|payment|subscription/i.test(why) ? `Zernio's Analytics add-on is needed: ${why}` : why
}

async function gatherZernio($: EngineInterface, config: Config, now: number): Promise<StatusRow[]> {
  if (!config.zernioServer) return zernioRows({ state: 'not-configured', why: 'no Zernio connector set (setting zernioServer)' }, now)
  let listed: ReturnType<typeof parseZernioAccounts>
  try {
    listed = parseZernioAccounts(await zernio($, config, 'accounts_list'))
  } catch (error) {
    return zernioRows({ state: 'access-denied', why: `the Zernio connector (${config.zernioServer}) could not be read (${message(error)})` }, now)
  }
  const today = edmontonDate(now)
  const [followers, posts] = await Promise.all([
    zernio($, config, 'accounts_get_follower_stats', { from_date: daysBefore(today, ZERNIO_FOLLOWER_DAYS), to_date: today, granularity: 'daily' })
      .then(text => ({ ok: true as const, value: parseZernioFollowers(JSON.parse(text)) }))
      .catch(error => ({ ok: false as const, why: zernioWhy(error) })),
    zernio($, config, 'analytics_get_analytics', { from_date: daysBefore(today, ZERNIO_POST_DAYS - 1), to_date: today, limit: 100, sort_by: 'date', order: 'desc' })
      .then(text => ({ ok: true as const, value: parseZernioPosts(JSON.parse(text)) }))
      .catch(error => ({ ok: false as const, why: zernioWhy(error) })),
  ])
  // Follower stats also name each account, in case the account list was empty
  // text or left one out.
  const accounts = [...listed]
  if (followers.ok) for (const a of followers.value.accounts) if (!accounts.some(b => b.id === a.id)) accounts.push(a)
  return zernioRows(
    {
      state: 'ok',
      server: config.zernioServer,
      accounts,
      followers: followers.ok ? { ok: true, value: followers.value.followers } : followers,
      posts,
    },
    now,
  )
}

// ---- PostHog ----------------------------------------------------------------

async function posthog($: EngineInterface, config: Config, command: string): Promise<Record<string, unknown>> {
  if (!POSTHOG_READ.test(command)) throw new Error('refused a PostHog command that is not a read')
  const result = await $.mcp.call(config.posthogServer, 'exec', {
    command,
    context: 'Reading aggregate website analytics for a read-only local operations dashboard.',
    llm_model: 'unknown',
  })
  const text = result.content.find(block => block.type === 'text')?.text ?? ''
  if (result.isError) throw new Error(text.slice(0, 160))
  return JSON.parse(text) as Record<string, unknown>
}

async function gatherPosthog($: EngineInterface, config: Config, now: number, livePage: string | undefined): Promise<StatusRow[]> {
  if (!config.posthogProjectId) return posthogRows({ state: 'not-configured', why: 'no PostHog project set (setting posthogProjectId)' }, now)
  let project: Record<string, unknown>
  try {
    project = await posthog($, config, 'call --json project-get {}')
  } catch (error) {
    return posthogRows({ state: 'access-denied', why: `the PostHog connector (${config.posthogServer}) could not be read (${message(error)})` }, now)
  }
  // The connector reads its active project; the dashboard never switches it.
  if (String(project.id ?? project.project_id ?? '') !== config.posthogProjectId) {
    return posthogRows({ state: 'source-error', why: `the PostHog connector's active project is not ${config.posthogProjectId} (posthogProjectId), so nothing is read; switch projects in PostHog` }, now)
  }
  const name = String(project.name ?? config.posthogProjectId)
  const snippetOnPage = livePage === undefined ? undefined : hasPosthogSnippet(livePage)
  if (project.ingested_event !== true) return posthogRows({ state: 'ok', project: name, ingested: false, snippetOnPage }, now)
  const range = `{"date_from":"-${POSTHOG_WINDOW_DAYS}d"}`
  try {
    const overview = await posthog($, config, `call --json query-web-overview {"kind":"WebOverviewQuery","dateRange":${range}}`)
    const metric = (key: string) => {
      const found = (Array.isArray(overview.results) ? overview.results : []).find(r => r && typeof r === 'object' && (r as { key?: unknown }).key === key) as { value?: unknown } | undefined
      return typeof found?.value === 'number' ? found.value : null
    }
    const table = async (breakdownBy: string) => {
      const answer = await posthog($, config, `call --json query-web-stats {"kind":"WebStatsTableQuery","breakdownBy":"${breakdownBy}","limit":5,"dateRange":${range}}`)
      const columns = Array.isArray(answer.columns) ? answer.columns.map(String) : []
      const at = (name: string) => columns.findIndex(c => c.endsWith(`.${name}`))
      const [b, v] = [at('breakdown_value'), at('visitors')]
      return (Array.isArray(answer.results) ? answer.results : []).flatMap(row => {
        if (!Array.isArray(row) || b < 0 || v < 0) return []
        const cell = row[v]
        const n = Array.isArray(cell) ? cell[0] : cell
        return typeof n === 'number' ? [[String(row[b] ?? ''), n] as const] : []
      })
    }
    return posthogRows(
      {
        state: 'ok',
        project: name,
        url: typeof overview._posthogUrl === 'string' ? overview._posthogUrl : undefined,
        ingested: true,
        snippetOnPage,
        overview: { visitors: metric('visitors'), views: metric('views'), sessions: metric('sessions'), durationS: metric('session duration'), bounce: metric('bounce rate') },
        pages: await table('Page'),
        channels: await table('InitialChannelType'),
      },
      now,
    )
  } catch (error) {
    return posthogRows({ state: 'source-error', why: `PostHog answered, but its numbers could not be read (${message(error)})` }, now)
  }
}

function toFile(raw: Record<string, unknown>): DriveFile {
  return {
    id: String(raw.id),
    title: String(raw.title ?? raw.name ?? ''),
    mimeType: typeof raw.mimeType === 'string' ? raw.mimeType : undefined,
    modifiedTime: typeof raw.modifiedTime === 'string' ? raw.modifiedTime : undefined,
    owner: typeof raw.owner === 'string' && raw.owner.trim() !== '' ? raw.owner.trim().toLowerCase() : undefined,
  }
}

// Which account the Drive connector is signed in as: the owner of a file that
// Drive reports as owned by "me" in one of the configured folders.
async function verifyAccount($: EngineInterface, config: Config): Promise<{ account?: string; why?: string }> {
  if (!config.workAccount) return { why: 'no Work account set (setting workAccount)' }
  const folders = [config.bridgerowFolderId, config.paliosFolderId, config.danceAlchemyFolderId, config.contentFolderId]
  for (const id of folders.filter(Boolean)) {
    try {
      const found = await drive($, config, 'search_files', {
        query: `owner = 'me' and parentId = '${quoteId(id)}'`,
        pageSize: 1,
        excludeContentSnippets: true,
      })
      const first = Array.isArray(found.files) ? found.files[0] : undefined
      const owner = first && typeof first === 'object' ? toFile(first as Record<string, unknown>).owner : undefined
      if (owner) return { account: owner }
    } catch {
      // try the next folder
    }
  }
  return { why: 'could not verify which account the Drive connector is signed in as (no file it owns in the configured folders)' }
}

// Explicitly configured IDs are in scope. Anything found by listing a folder is
// in scope only when owned by the verified account or listed in
// approvedSharedIds; another owner, or no owner reported, is not approved.
function scopeOf(config: Config, account: string, file: DriveFile): { ok: true; note?: string } | { ok: false; why: string } {
  if (config.approvedSharedIds.has(file.id)) {
    return { ok: true, note: file.owner && file.owner !== account ? 'approved shared document' : undefined }
  }
  if (!file.owner) return { ok: false, why: `${file.title} reports no owner and is not in approvedSharedIds, so it is not read` }
  if (file.owner === account) return { ok: true }
  return { ok: false, why: `${file.title} is owned by another account and is not in approvedSharedIds, so it is not read` }
}

// A Drive query string value: backslashes and single quotes escaped.
const quoteValue = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

export type TitleSearch = { files: DriveFile[]; complete: boolean; pages: number }

// Every file in a folder with exactly this title, page by page. A match is
// only claimed unique (or absent) when `complete` is true: the search ran to
// its last page. Titles that look like credentials are never searched for.
async function findByTitle(
  $: EngineInterface,
  config: Config,
  folderId: string,
  title: string,
  mimeType?: string,
): Promise<TitleSearch> {
  if (isDeniedTitle(title)) return { files: [], complete: true, pages: 0 }
  const files: DriveFile[] = []
  let pageToken: string | undefined
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const found = await drive($, config, 'search_files', {
      query: `parentId = '${quoteId(folderId)}' and title = '${quoteValue(title)}'${mimeType ? ` and mimeType = '${quoteValue(mimeType)}'` : ''}`,
      excludeContentSnippets: true,
      pageSize: PAGE_SIZE,
      ...(pageToken ? { pageToken } : {}),
    })
    if (Array.isArray(found.files)) {
      // Drive's title match is trusted only when the returned title is exact.
      files.push(...found.files.map(f => toFile(f as Record<string, unknown>)).filter(f => f.title === title))
    }
    const token = found.nextPageToken ?? found.next_page_token
    pageToken = typeof token === 'string' && token !== '' ? token : undefined
    if (!pageToken) return { files, complete: true, pages: page }
  }
  return { files, complete: false, pages: MAX_PAGES }
}

// One file with this title, or why there is not exactly one.
type Unique =
  | { state: 'ok'; file: DriveFile }
  | { state: 'missing' | 'source-error'; why: string }

function uniqueMatch(search: TitleSearch, title: string, where: string): Unique {
  if (!search.complete) {
    return { state: 'source-error', why: `the search for ${title} in ${where} stopped after ${search.pages} pages, so a unique match cannot be claimed` }
  }
  if (search.files.length > 1) return { state: 'source-error', why: `${search.files.length} items titled ${title} in ${where}; cannot tell which is current` }
  const file = search.files[0]
  return file ? { state: 'ok', file } : { state: 'missing', why: `${title} not found in ${where}` }
}

async function readText($: EngineInterface, config: Config, file: DriveFile): Promise<string> {
  if (isDeniedTitle(file.title)) throw new Error(`skipped ${file.title}: looks like credentials`)
  const got = await drive($, config, 'download_file_content', { fileId: file.id, exportMimeType: 'text/plain' })
  return decodeBase64(String(got.content ?? ''))
}

// Resolves one configured Work Drive ID to a usable item, or says why not.
async function resolveItem(
  $: EngineInterface,
  config: Config,
  id: string,
  setting: string,
  isFolder: boolean,
): Promise<SourceState> {
  if (!id) return { state: 'not-configured', why: `no ID set (setting ${setting})` }
  try {
    const file = toFile(await drive($, config, 'get_file_metadata', { fileId: id, excludeContentSnippets: true }))
    if (isDeniedTitle(file.title)) return { state: 'not-approved', why: `${setting} looks like a credentials file; not read` }
    if ((file.mimeType === FOLDER) !== isFolder) {
      return { state: 'source-error', why: `${setting} is not a ${isFolder ? 'folder' : 'document'}; not read` }
    }
    return { state: 'ok', file }
  } catch (error) {
    const why = message(error)
    return {
      state: 'access-denied',
      why: isAccessError(why)
        ? `the Work account cannot read ${setting} (${why})`
        : `${setting} could not be read (${why})`,
    }
  }
}

function driveSource(label: string, checkedAt: number, file?: DriveFile, isDoc = true): Source {
  const updatedAt = file?.modifiedTime ? Date.parse(file.modifiedTime) : undefined
  return {
    label,
    url: file ? (isDoc ? `https://docs.google.com/document/d/${file.id}/edit` : `https://drive.google.com/drive/folders/${file.id}`) : undefined,
    kind: 'snapshot',
    checkedAt,
    updatedAt: Number.isNaN(updatedAt) ? undefined : updatedAt,
  }
}

async function projectRows(
  $: EngineInterface,
  config: Config,
  account: string,
  args: {
    name: string
    folderId: string
    setting: string
    titles: readonly string[]
    projects: readonly ProjectKey[]
    project: Parameters<typeof rowsFromRecords>[1]
    now: number
  },
): Promise<StatusRow[]> {
  const { name, now } = args
  const main = args.projects[0] ?? 'offers'
  const folder = await resolveItem($, config, args.folderId, args.setting, true)
  if (folder.state !== 'ok') {
    const source: Source = { label: `Work Drive: ${name} folder`, kind: 'snapshot', checkedAt: now }
    return args.projects.map(p => sourceRow(p, folder.state, `${name} records`, folder.why, source))
  }
  const folderSource = driveSource(`Work Drive: ${name} folder`, now, folder.file, false)
  const rows: StatusRow[] = []
  for (const title of args.titles) {
    const label = `ELIA OS ${name}/${title}`
    let match: Unique
    try {
      match = uniqueMatch(await findByTitle($, config, folder.file.id, title), title, 'the configured folder')
    } catch (error) {
      rows.push(sourceRow(main, 'access-denied', label, `search failed (${message(error)})`, folderSource))
      continue
    }
    if (match.state !== 'ok') {
      rows.push(sourceRow(main, match.state, label, match.why, folderSource))
      continue
    }
    const file = match.file
    const scope = scopeOf(config, account, file)
    if (!scope.ok) {
      rows.push(sourceRow(main, 'not-approved', label, scope.why, folderSource))
      continue
    }
    const source = driveSource(scope.note ? `${label} (${scope.note})` : label, now, file)
    try {
      const records = parseRecords(await readText($, config, file)).filter(r =>
        title === 'DECISIONS' ? !/^(ACCEPTED|IMPLEMENTED)/i.test(r.label) : true,
      )
      if (records.length === 0 && title !== 'DECISIONS') {
        rows.push(sourceRow(main, 'source-error', label, 'no ID | STATUS | statement records found', source))
      }
      rows.push(...rowsFromRecords(records, args.project, source, now, config.staleDays))
    } catch (error) {
      rows.push(sourceRow(main, 'access-denied', label, `read failed (${message(error)})`, source))
    }
  }
  return rows
}

type DriveGathered = { rows: StatusRow[]; content: ContentDay; activity: Activity[]; problems: string[]; account?: string }

const PROJECT_SOURCES = (config: Config) =>
  [
    {
      name: 'Bridgerow',
      folderId: config.bridgerowFolderId,
      setting: 'bridgerowFolderId',
      titles: ['CURRENT_STATE', 'DECISIONS'],
      projects: ['offers', 'website', 'content'] as ProjectKey[],
      project: classifyBridgerow as Parameters<typeof rowsFromRecords>[1],
    },
    {
      name: 'Palios',
      folderId: config.paliosFolderId,
      setting: 'paliosFolderId',
      titles: config.paliosDocTitles,
      projects: ['palios'] as ProjectKey[],
      project: 'palios' as Parameters<typeof rowsFromRecords>[1],
    },
    {
      name: 'Dance Alchemy',
      folderId: config.danceAlchemyFolderId,
      setting: 'danceAlchemyFolderId',
      titles: config.danceAlchemyDocTitles,
      projects: ['dance'] as ProjectKey[],
      project: 'dance' as Parameters<typeof rowsFromRecords>[1],
    },
  ] as const

type Verified = { account?: string; why?: string }

async function gatherDrive($: EngineInterface, config: Config, now: number, verified: Verified): Promise<DriveGathered> {
  const problems: string[] = []
  const date = edmontonDate(now)
  const account = verified.account
  if (!account || account !== config.workAccount) {
    const why = account
      ? `the Drive connector is signed in as another account, not ${config.workAccount}; nothing is read`
      : verified.why ?? 'Drive account not verified'
    const source: Source = { label: `Drive connector (${config.driveServer})`, kind: 'observed', checkedAt: now }
    const rows = [
      ...PROJECT_SOURCES(config).flatMap(p => p.projects.map(project => sourceRow(project, 'access-denied', `${p.name} records`, why, source))),
      sourceRow('social', 'access-denied', 'Social Ops manifests', why, source),
    ]
    const denied = { state: 'access-denied' as const, why }
    return {
      rows,
      content: evaluateContentDay({ date, now, checkedAt: now, ready: denied, dayFiles: [], calendar: denied }),
      activity: [],
      problems,
      account,
    }
  }
  const [projects, content] = await Promise.all([
    Promise.all(PROJECT_SOURCES(config).map(p => projectRows($, config, account, { ...p, now }))),
    gatherContent($, config, account, now).catch(error => {
      problems.push(`Content: ${message(error)}`)
      const why = `content sources could not be read (${message(error)})`
      return {
        day: evaluateContentDay({ date, now, checkedAt: now, ready: { state: 'source-error', why }, dayFiles: [] }),
        activity: [] as Activity[],
        social: [sourceRow('social', 'source-error', 'Social Ops manifests', why, { label: 'Drive: Content/Publishing', kind: 'observed', checkedAt: now })],
      }
    }),
  ])
  return { rows: [...projects.flat(), ...content.social], content: content.day, activity: content.activity, problems, account }
}

// The date `days` before `date`, as YYYY-MM-DD.
const daysBefore = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

// Today's day folder drives the content pipeline; the last SOCIAL_WINDOW_DAYS
// day folders (today included) drive the social media counts. Every folder on
// the way, Content/Publishing/YYYY/MM/YYYY-MM-DD, is found by exact title.
async function gatherContent(
  $: EngineInterface,
  config: Config,
  account: string,
  now: number,
): Promise<{ day: ContentDay; activity: Activity[]; social: StatusRow[] }> {
  const today = edmontonDate(now)
  const [contentItem, calendar] = await Promise.all([
    resolveItem($, config, config.contentFolderId, 'contentFolderId', true),
    resolveItem($, config, config.contentCalendarDocId, 'contentCalendarDocId', false),
  ])
  let calendarIdeas: CalendarIdeas | undefined
  let calendarError: string | undefined
  if (calendar.state === 'ok') {
    try {
      calendarIdeas = parseCalendar(await readText($, config, calendar.file))
    } catch (error) {
      calendarError = message(error)
    }
  }
  const evaluate = (date: string, input: Partial<ContentInputs> & Pick<ContentInputs, 'ready'>) =>
    evaluateContentDay({ date, now, checkedAt: now, calendar, calendarIdeas, calendarError, dayFiles: [], ...input }, config.contentCalendarStartDate)
  const socialSource: Source = { label: 'Drive: Content/Publishing', kind: 'observed', checkedAt: now }
  if (contentItem.state !== 'ok') {
    return {
      day: evaluate(today, { ready: contentItem }),
      activity: [],
      social: [sourceRow('social', contentItem.state, 'Social Ops manifests', contentItem.why, socialSource)],
    }
  }

  // Each folder lookup runs once per refresh.
  const lookups = new Map<string, Promise<Unique>>()
  const folderAt = (parentId: string, title: string, where: string) => {
    const key = `${parentId}/${title}`
    if (!lookups.has(key)) lookups.set(key, findByTitle($, config, parentId, title, FOLDER).then(search => uniqueMatch(search, title, where)))
    return lookups.get(key)!
  }

  const publishing = await folderAt(contentItem.file.id, 'Publishing', 'Content')
  if (publishing.state === 'source-error') {
    return {
      day: evaluate(today, { ready: { state: 'source-error', why: publishing.why } }),
      activity: [],
      social: [sourceRow('social', 'source-error', 'Social Ops manifests', publishing.why, socialSource)],
    }
  }

  const gatherDay = async (date: string): Promise<{ day: ContentDay; activity: Activity[] }> => {
    const path = publishingPath(date)
    if (publishing.state !== 'ok') {
      return {
        day: evaluate(date, { ready: contentItem, dayMissingWhy: 'Content/Publishing does not exist yet, so nothing has been packaged for publishing' }),
        activity: [],
      }
    }
    let parent = publishing.file
    let where = 'Content/Publishing'
    for (const title of [date.slice(0, 4), date.slice(5, 7), date]) {
      const match = await folderAt(parent.id, title, where)
      if (match.state === 'source-error') return { day: evaluate(date, { ready: { state: 'source-error', why: match.why } }), activity: [] }
      if (match.state !== 'ok') {
        return { day: evaluate(date, { ready: contentItem, dayMissingWhy: `No Content/${path} folder (${where}/${title} is missing), so nothing can be counted for ${date}` }), activity: [] }
      }
      parent = match.file
      where = `${where}/${title}`
    }
    const dayFolder = parent
    const dayScope = scopeOf(config, account, dayFolder)
    if (!dayScope.ok) return { day: evaluate(date, { ready: { state: 'not-approved', why: dayScope.why } }), activity: [] }

    // The day folder is searched by exact title: the manifest first, then each
    // video it names (or post-01.mp4 and post-02.mp4).
    const where2 = `Content/${path}`
    const manifestSearch = await findByTitle($, config, dayFolder.id, 'manifest.json')
    const manifestMatch = uniqueMatch(manifestSearch, 'manifest.json', where2)
    let dayFilesProblem: ContentInputs['dayFilesProblem']
    let manifest: unknown
    let manifestError: string | undefined
    const manifestFile = manifestMatch.state === 'ok' ? manifestMatch.file : undefined
    if (manifestMatch.state === 'source-error') dayFilesProblem = { health: 'source-error', why: manifestMatch.why }
    if (manifestFile) {
      const scope = scopeOf(config, account, manifestFile)
      if (!scope.ok) dayFilesProblem = { health: 'not-approved', why: scope.why }
      else {
        try {
          manifest = JSON.parse(await readText($, config, manifestFile))
        } catch (error) {
          manifestError = message(error)
        }
      }
    }
    const named =
      manifest && typeof manifest === 'object' && Array.isArray((manifest as { posts?: unknown }).posts)
        ? (manifest as { posts: unknown[] }).posts
            .map(p => (p && typeof p === 'object' ? (p as { media?: { file?: unknown } }).media?.file : undefined))
            .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
            .slice(0, 10)
        : []
    const videoNames = [...new Set([...named, 'post-01.mp4', 'post-02.mp4'])]
    const dayFiles: DriveFile[] = manifestSearch.files.slice()
    for (const name of videoNames) {
      const search = await findByTitle($, config, dayFolder.id, name)
      if (!search.complete && !dayFilesProblem) {
        dayFilesProblem = { health: 'source-error', why: `the search for ${name} in ${where2} stopped after ${search.pages} pages, so its files cannot be counted` }
      }
      dayFiles.push(...search.files)
    }
    const day = evaluate(date, { ready: contentItem, dayFolder, dayFiles, dayFilesProblem, manifest, manifestError })
    const activity: Activity[] = []
    if (date === today && day.published !== null && day.source.updatedAt !== undefined) {
      activity.push({ project: 'content', at: day.source.updatedAt, what: `${where2} manifest update`, source: day.source })
    }
    for (const post of day.posts) {
      for (const receipt of post.receipts) {
        activity.push({
          project: 'content',
          at: receipt.at,
          what: `reported publication of ${post.id} on ${receipt.platform}`,
          source: { ...day.source, updatedAt: receipt.at },
          isPublication: true,
        })
      }
    }
    return { day, activity }
  }

  const dates = Array.from({ length: SOCIAL_WINDOW_DAYS }, (_, i) => daysBefore(today, i))
  // An earlier day that cannot be read leaves that day uncounted; it does not
  // take today's count or the rest of the window with it.
  const days = await Promise.all(
    dates.map((date, i) =>
      i === 0
        ? gatherDay(date)
        : gatherDay(date).catch(error => ({ day: evaluate(date, { ready: { state: 'source-error' as const, why: message(error) } }), activity: [] as Activity[] })),
    ),
  )
  return {
    day: days[0]!.day,
    activity: days.flatMap(d => d.activity),
    social: socialRows({ days: days.map(d => d.day), accounts: config.socialAccounts, checkedAt: now }),
  }
}

// ---- GitHub -----------------------------------------------------------------

async function github($: EngineInterface, path: string): Promise<unknown> {
  try {
    const run = await $.process.run(['gh', 'api', '--method', 'GET', path], { timeoutMs: 20_000 })
    if (run.exitCode === 0) return JSON.parse(run.stdout)
  } catch {
    // gh missing: fall back to the public API
  }
  const response = await $.http.fetch(`https://api.github.com/${path}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'bridgerow-ops-dashboard' },
  })
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`)
  return JSON.parse(response.text)
}

type Commit = { sha: string; html_url: string; commit: { message: string; committer: { date: string } } }
type Pull = {
  number: number
  title: string
  html_url: string
  state: string
  base?: { ref?: string }
  draft?: boolean
  merged_at?: string | null
  updated_at: string
}

type GithubGathered = { rows: StatusRow[]; agents: AgentRow[]; activity: Activity[] }

async function gatherGithub($: EngineInterface, config: Config, now: number): Promise<GithubGathered> {
  const ghSource: Source = { label: 'GitHub', kind: 'observed', checkedAt: now }
  if (!config.websiteRepo) {
    return {
      rows: [sourceRow('website', 'not-configured', 'Website repository', 'no repository set (setting websiteRepo)', ghSource)],
      agents: [],
      activity: [],
    }
  }
  const repo = config.websiteRepo
  const rows: StatusRow[] = []
  const agents: AgentRow[] = []
  const activity: Activity[] = []
  try {
    const commits = (await github($, `repos/${repo}/commits?sha=${encodeURIComponent(config.websiteBranch)}&per_page=3`)) as Commit[]
    const latest = commits[0]
    const updatedAt = latest ? Date.parse(latest.commit.committer.date) : undefined
    const source: Source = { label: `GitHub ${repo}@${config.websiteBranch}`, url: latest?.html_url, kind: 'observed', checkedAt: now, updatedAt }
    if (latest && updatedAt !== undefined) {
      const subject = sanitizeText(latest.commit.message.split('\n')[0] ?? '')
      rows.push({
        id: 'website-github',
        project: 'website',
        title: `${repo}@${config.websiteBranch}`,
        status: 'LAST COMMIT',
        detail: subject,
        source,
        health: 'ok',
        needsElia: false,
        kind: 'summary',
      })
      activity.push({ project: 'website', at: updatedAt, what: `commit "${subject}"`, source })
    } else {
      rows.push(sourceRow('website', 'missing', 'Website commits', `branch ${config.websiteBranch} has no commits`, source))
    }
    const pulls = (await github(
      $,
      `repos/${repo}/pulls?state=all&base=${encodeURIComponent(config.websiteBranch)}&per_page=10&sort=updated&direction=desc`,
    )) as Pull[]
    // Only pull requests into the configured branch count as its activity.
    for (const pull of pulls.filter(p => p.base?.ref === config.websiteBranch)) {
      const updated = Date.parse(pull.updated_at)
      if (now - updated > 14 * 24 * 60 * 60 * 1000) continue
      const prSource: Source = { label: `GitHub PR #${pull.number}`, url: pull.html_url, kind: 'observed', checkedAt: now, updatedAt: updated }
      agents.push({
        id: `pr-${pull.number}`,
        task: `PR #${pull.number} ${sanitizeText(pull.title)}`,
        project: 'website',
        state: pull.merged_at || pull.state === 'closed' ? 'completed' : pull.draft ? 'working' : 'waiting',
        lastUpdate: updated,
        link: pull.html_url,
        result: pull.merged_at ? 'merged' : pull.state === 'closed' ? 'closed unmerged' : pull.draft ? 'draft' : 'awaiting review',
        source: prSource,
      })
      activity.push({ project: 'website', at: updated, what: `PR #${pull.number}`, source: prSource })
    }
  } catch (error) {
    const why = message(error)
    rows.push(
      sourceRow('website', 'access-denied', 'Website repository', `GitHub could not be read for ${repo} (${why})`, ghSource),
    )
  }
  return { rows, agents, activity }
}

type GithubDeployment = { id: number; environment?: string; created_at: string }
type GithubStatus = { state?: string; environment_url?: string; target_url?: string }

// Website data that can be read without new accounts: the repository's
// deployments (Vercel records them on GitHub), whether the page carries an
// analytics script, and, if a public URL is set, one check of the live site.
// Which host serves the public site, from its response headers or page.
function hostingOf(headers: Record<string, string>, page: string): string | undefined {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]))
  if (h['x-nf-request-id'] || /netlify/i.test(h.server ?? '') || page.includes('/.netlify/')) return 'Netlify'
  if (h['x-vercel-id'] || /vercel/i.test(h.server ?? '')) return 'Vercel'
  if (h['cf-ray']) return 'Cloudflare'
  if (/github\.com/i.test(h.server ?? '')) return 'GitHub Pages'
  return undefined
}

async function gatherWebsite($: EngineInterface, config: Config, now: number): Promise<StatusRow[]> {
  const rows: StatusRow[] = []
  const repo = config.websiteRepo
  if (repo) {
    try {
      const listed = (await github($, `repos/${repo}/deployments?per_page=10`)) as GithubDeployment[]
      const recent = listed.slice(0, 5)
      const deployments: Deployment[] = []
      for (const d of recent) {
        const statuses = (await github($, `repos/${repo}/deployments/${d.id}/statuses?per_page=1`)) as GithubStatus[]
        const latest = statuses[0]
        deployments.push({
          environment: d.environment ?? 'unknown',
          createdAt: Date.parse(d.created_at),
          state: latest?.state ?? 'pending',
          url: latest?.environment_url || latest?.target_url || undefined,
        })
      }
      rows.push(deploymentRow(deployments, repo, now))
    } catch (error) {
      rows.push(sourceRow('website', 'access-denied', 'Website deployments', `GitHub deployments could not be read for ${repo} (${message(error)})`, {
        label: `GitHub ${repo} deployments`,
        kind: 'observed',
        checkedAt: now,
      }))
    }
  }
  // The public page is what visitors get, so its analytics are judged from it
  // when it can be read; otherwise from index.html in the repository.
  let result: Parameters<typeof liveSiteRow>[1]
  let livePage: string | undefined
  if (config.websiteUrl && /^https:\/\//i.test(config.websiteUrl)) {
    const started = await $.clock.now()
    try {
      const response = await $.http.fetch(config.websiteUrl, { headers: { 'User-Agent': 'bridgerow-ops-dashboard' } })
      const ended = await $.clock.now()
      const text = response.text ?? ''
      const title = /<title[^>]*>([^<]{0,200})<\/title>/i.exec(text)?.[1]?.trim()
      result = { status: response.status, ms: Math.max(0, Math.round(ended - started)), title, host: hostingOf(response.headers ?? {}, text) }
      if (response.ok) livePage = text
    } catch (error) {
      result = { error: message(error) }
    }
  }
  const analytics = await gatherPosthog($, config, now, livePage)
  const connected = analytics.some(r => r.id === 'website-visitors') ? ['PostHog'] : []
  if (livePage !== undefined) rows.push(trafficRow(livePage, sanitizeUrl(config.websiteUrl) ?? 'public site', now, 'observed', undefined, connected))
  else if (repo) {
    const where = `GitHub ${repo}@${config.websiteBranch}/index.html`
    try {
      const file = (await github($, `repos/${repo}/contents/index.html?ref=${encodeURIComponent(config.websiteBranch)}`)) as { content?: string }
      rows.push(trafficRow(decodeBase64(String(file.content ?? '').replace(/\s+/g, '')), where, now))
    } catch (error) {
      rows.push(trafficRow(undefined, where, now, 'observed', message(error)))
    }
  }
  rows.push(liveSiteRow(config.websiteUrl, result, now), ...analytics)
  return rows
}

async function gatherContentEngineRepo(
  $: EngineInterface,
  config: Config,
  now: number,
): Promise<{ row?: StatusRow; activity: Activity[] }> {
  if (!config.contentEngineDir) return { activity: [] }
  const source: Source = { label: `local git ${config.contentEngineDir}`, kind: 'observed', checkedAt: now }
  try {
    const run = await $.process.run(['git', '-C', config.contentEngineDir, 'log', '-1', '--format=%cI%x09%s'], { timeoutMs: 10_000 })
    if (run.exitCode !== 0) throw new Error(run.stderr.slice(0, 120))
    const [date, subject] = run.stdout.trim().split('\t')
    const at = date ? Date.parse(date) : NaN
    const withTime = { ...source, updatedAt: Number.isNaN(at) ? undefined : at }
    return {
      row: {
        id: 'content-repo',
        project: 'content',
        title: 'ai-content-engine (local)',
        status: 'LAST COMMIT',
        detail: sanitizeText(subject ?? ''),
        source: withTime,
        health: 'ok',
        needsElia: false,
        kind: 'summary',
      },
      activity: Number.isNaN(at) ? [] : [{ project: 'content', at, what: `local commit "${sanitizeText(subject ?? '')}"`, source: withTime }],
    }
  } catch (error) {
    return { row: sourceRow('content', 'access-denied', 'Content engine checkout', `git log failed (${message(error)})`, source), activity: [] }
  }
}

// ---- Session ----------------------------------------------------------------

async function gatherUsage($: EngineInterface, now: number): Promise<UsageView> {
  const [model, usage] = await Promise.all([
    $.session.model().catch(() => undefined),
    $.session.usage().catch(() => undefined),
  ])
  return {
    model,
    contextPercent: usage?.context.percent,
    contextWindow: usage?.context.window,
    tokens: usage?.context.tokens,
    limits: (usage?.rateLimits ?? []).map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
    costUsd: usage?.cost?.usd,
    checkedAt: now,
    note:
      usage === undefined
        ? 'usage not available from this host'
        : (usage.rateLimits ?? []).length === 0
          ? 'no usage-limit windows reported yet (none before the first response, or not on a subscription)'
          : undefined,
  }
}

const AGENT_STATE: Record<string, AgentRow['state']> = {
  pending: 'working',
  running: 'working',
  waiting: 'waiting',
  idle: 'waiting',
  completed: 'completed',
  failed: 'blocked',
  killed: 'blocked',
}

async function gatherAgents($: EngineInterface, live: readonly AgentRow[], now: number): Promise<AgentRow[]> {
  const listed = await $.agent.list().catch(() => [])
  const merged = new Map(live.map(row => [row.id, row]))
  for (const agent of listed) {
    const known = merged.get(agent.id)
    const state = AGENT_STATE[agent.status] ?? 'waiting'
    const lastUpdate = known && known.state === state ? known.lastUpdate : now
    merged.set(agent.id, {
      id: agent.id,
      task: sanitizeText(agent.description || agent.type),
      project: 'session',
      state,
      lastUpdate,
      result: known?.result,
      source: { label: `this session · ${agent.type}`, kind: 'observed', checkedAt: now, updatedAt: lastUpdate },
    })
  }
  return [...merged.values()]
}

// ---- Dashboard --------------------------------------------------------------

const PANE = 'bridgerow-ops'
const STORE_KEY = 'lastLiveSnapshot'

const liveSnapshot = atom({ plugin: 'bridgerow-ops-dashboard', key: 'live' } as const, null)
const pendingCache = atom({ plugin: 'bridgerow-ops-dashboard', key: 'pendingCache' } as const, null)
const demoData = atom({ plugin: 'bridgerow-ops-dashboard', key: 'demo' } as const, null)
const view = atom({ plugin: 'bridgerow-ops-dashboard', key: 'view' } as const, 'live')
const filter = atom({ plugin: 'bridgerow-ops-dashboard', key: 'filter' } as const, 'all')
const isRefreshing = atom({ plugin: 'bridgerow-ops-dashboard', key: 'isRefreshing' } as const, false)
const liveAgents = atom({ plugin: 'bridgerow-ops-dashboard', key: 'liveAgents' } as const, [])

const FILTERS: readonly ProjectFilter[] = ['all', 'website', 'social', 'content', 'offers', 'palios', 'dance']
const FILTER_LABELS: Record<ProjectFilter, string> = {
  all: 'All',
  website: 'Website',
  social: 'Social media',
  content: 'Content engine',
  offers: 'Sales & offers',
  palios: 'Palios inventory',
  dance: 'Dance Alchemy',
}
const PROJECT_ORDER: readonly ProjectKey[] = ['website', 'social', 'content', 'palios', 'dance']

const HEALTH_COLOR: Record<Health, string> = {
  ok: 'success',
  'verified-zero': 'warning',
  stale: 'warning',
  conflict: 'warning',
  missing: 'error',
  blocked: 'error',
  'not-configured': 'subtle',
  'access-denied': 'error',
  'source-error': 'error',
  'not-approved': 'warning',
}
const STAGE_GLYPH = { done: '●', pending: '○', unknown: '?', blocked: '✕', off: '–' } as const
const STAGE_LABEL: Record<Stage, string> = {
  idea: 'idea',
  approval: 'approved',
  media: 'video',
  scheduled: 'scheduled',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtubeShorts: 'YouTube',
  facebook: 'Facebook',
}
const AGENT_COLOR = { working: 'suggestion', waiting: 'warning', blocked: 'error', completed: 'success' } as const
const KIND_TAG = { observed: 'OBSERVED', snapshot: 'SNAPSHOT', reported: 'REPORTED', fixture: 'DEMO FIXTURE' } as const

async function gatherLive($: EngineInterface, config: Config, now: number, verified: Verified): Promise<Snapshot> {
  const live = await read($, liveAgents)
  const [driveData, githubData, usage, agents, repo, website, audience] = await Promise.all([
    gatherDrive($, config, now, verified),
    gatherGithub($, config, now),
    gatherUsage($, now),
    gatherAgents($, live, now),
    gatherContentEngineRepo($, config, now),
    gatherWebsite($, config, now).catch(error => [
      sourceRow('website', 'source-error', 'Website checks', message(error), { label: 'website checks', kind: 'observed', checkedAt: now }),
    ]),
    gatherZernio($, config, now).catch(error => zernioRows({ state: 'source-error', why: `Zernio answered, but its numbers could not be read (${message(error)})` }, now)),
  ])
  const rows = [...githubData.rows, ...website, ...(repo.row ? [repo.row] : []), ...driveData.rows, ...audience]
  const conflicts = detectConflicts(rows, [...githubData.activity, ...driveData.activity, ...repo.activity])
  return sanitizeDeep({
    mode: 'live',
    refreshedAt: now,
    isCached: false,
    account: driveData.account,
    fingerprint: fingerprint(config, driveData.account),
    rows: [...conflicts, ...rows],
    agents: [...agents, ...githubData.agents],
    content: driveData.content,
    usage,
    problems: driveData.problems,
  } satisfies Snapshot)
}

// ---- Local cache ------------------------------------------------------------
//
// The cache lets the pane open with the last live statuses before a refresh.
// It is tied to the settings and the verified Drive account that produced it,
// and holds no record text, notes, agents, links or usage: only IDs, titles,
// statuses, states and times. /ops clear-cache deletes it.

const CACHE_VERSION = 3

function fingerprint(config: Config, account: string | undefined): string {
  return JSON.stringify([
    CACHE_VERSION,
    account ?? '',
    config.workAccount,
    config.driveServer,
    config.bridgerowFolderId,
    config.paliosFolderId,
    config.paliosDocTitles,
    config.danceAlchemyFolderId,
    config.danceAlchemyDocTitles,
    config.contentFolderId,
    config.contentCalendarDocId,
    config.contentCalendarStartDate,
    [...config.approvedSharedIds].sort(),
    config.socialAccounts,
    config.websiteRepo,
    config.websiteBranch,
    config.websiteUrl,
    config.contentEngineDir,
    config.posthogServer,
    config.posthogProjectId,
    config.zernioServer,
  ])
}

type CachedSnapshot = {
  version: number
  fingerprint: string
  account: string
  refreshedAt: number
  rows: (Pick<StatusRow, 'id' | 'project' | 'title' | 'status' | 'health' | 'needsElia' | 'isInfo' | 'kind'> & {
    source: Omit<Source, 'url'>
  })[]
  content: Pick<ContentDay, 'date' | 'target' | 'published' | 'health'> & {
    source: Omit<Source, 'url'>
    posts: Pick<ContentDay['posts'][number], 'id' | 'slot' | 'stages' | 'status' | 'isPublished'>[]
  }
}

const bareSource = (source: Source): Omit<Source, 'url'> => ({
  label: source.label,
  kind: source.kind,
  checkedAt: source.checkedAt,
  updatedAt: source.updatedAt,
})

export function toCache(snap: Snapshot, account: string, print: string): CachedSnapshot {
  return {
    version: CACHE_VERSION,
    fingerprint: print,
    account,
    refreshedAt: snap.refreshedAt,
    rows: snap.rows.map(r => ({
      id: r.id,
      project: r.project,
      title: r.title,
      status: r.status,
      health: r.health,
      needsElia: r.needsElia,
      isInfo: r.isInfo,
      kind: r.kind,
      source: bareSource(r.source),
    })),
    content: {
      date: snap.content.date,
      target: snap.content.target,
      published: snap.content.published,
      health: snap.content.health,
      source: bareSource(snap.content.source),
      posts: snap.content.posts.map(p => ({ id: p.id, slot: p.slot, stages: p.stages, status: p.status, isPublished: p.isPublished })),
    },
  }
}

const NOT_CACHED = 'details are not cached; refresh to see them'

export function fromCache(raw: unknown, print: string): Snapshot | undefined {
  const cached = raw as CachedSnapshot | undefined
  if (!cached || typeof cached !== 'object' || cached.version !== CACHE_VERSION || cached.fingerprint !== print) return undefined
  if (!Array.isArray(cached.rows) || !cached.content || !Array.isArray(cached.content.posts)) return undefined
  return sanitizeDeep({
    mode: 'live',
    refreshedAt: cached.refreshedAt,
    isCached: true,
    account: cached.account,
    fingerprint: cached.fingerprint,
    rows: cached.rows.map(r => ({ ...r, detail: '(details not cached)', healthNote: NOT_CACHED })),
    agents: [],
    content: { ...cached.content, note: NOT_CACHED, posts: cached.content.posts.map(p => ({ ...p, receipts: [], failedOn: [] })) },
    usage: { limits: [], checkedAt: cached.refreshedAt, note: 'usage is not cached; refresh to see it' },
    problems: [],
  } satisfies Snapshot)
}

async function refresh($: EngineInterface, config: Config, mode: 'live' | 'demo'): Promise<string> {
  if (await read($, isRefreshing)) return 'A refresh is already running.'
  await update($, isRefreshing, () => true)
  try {
    const now = await $.clock.now()
    if (mode === 'demo') {
      await update($, demoData, () => sanitizeDeep(demoSnapshot(now)))
      await update($, view, () => 'demo' as const)
      return 'Showing DEMO fixtures. Live data is untouched; run /ops live to go back.'
    }
    // The connector's account is checked first. A cache held from an earlier
    // session is shown only if the connector is signed in as the account it
    // was cached under; otherwise it is deleted unseen.
    const verified = await verifyAccount($, config)
    const held = await read($, pendingCache)
    if (held) {
      await update($, pendingCache, () => null)
      if (verified.account && verified.account === config.workAccount && held.account === verified.account) {
        const current = await read($, liveSnapshot)
        if (!current) await update($, liveSnapshot, () => ({ ...held, reverifiedAt: now }))
      } else {
        await $.store.delete(STORE_KEY)
      }
    }
    const next = await gatherLive($, config, now, verified)
    await update($, liveSnapshot, () => next)
    await update($, view, () => 'live' as const)
    // Cache only what the verified Work account produced; otherwise drop any
    // older cache so it cannot be shown for a different account.
    if (next.account && next.account === config.workAccount) {
      await $.store.set(STORE_KEY, toCache(next, next.account, fingerprint(config, next.account)))
    } else {
      await $.store.delete(STORE_KEY)
    }
    const flagged = next.rows.filter(r => r.health !== 'ok').length
    return `Live data refreshed. ${flagged} line(s) flagged.`
  } finally {
    await update($, isRefreshing, () => false)
  }
}

async function trackAgent($: EngineInterface, row: AgentRow) {
  const clean = sanitizeDeep(row)
  await update($, liveAgents, list => [...list.filter(a => a.id !== clean.id), clean].slice(-50))
}

// The pane's agents: what the snapshot held, overlaid by what this session
// has observed since, so new agent activity shows without a refresh.
function agentsFor(snap: Snapshot, tracked: readonly AgentRow[]): AgentRow[] {
  const merged = new Map(snap.agents.map(a => [a.id, a]))
  for (const row of tracked) {
    const known = merged.get(row.id)
    if (!known || known.lastUpdate <= row.lastUpdate) merged.set(row.id, row)
  }
  return [...merged.values()]
}

const isOpen = (row: StatusRow) => !/\b(COMPLETE|SUPERSEDED)\b/i.test(row.status)

export function sourceText(source: Source, now: number): string {
  const updated = source.updatedAt !== undefined ? ` · updated ${clock(source.updatedAt)}` : ' · no update time'
  return `${KIND_TAG[source.kind]} · ${source.label}${updated} · checked ${clock(source.checkedAt)} (${ago(source.checkedAt, now)})`
}

// A cached snapshot names the account it was cached under and when the
// connector was checked again; it is never called verified itself.
function headerText(snap: Snapshot, isDemo: boolean, config: Config, now: number): string {
  const when = `${clock(snap.refreshedAt)} (${ago(snap.refreshedAt, now)})`
  if (isDemo) return `DEMO · refreshed ${when} · read-only`
  if (snap.isCached) {
    const checked = snap.reverifiedAt !== undefined ? `connector re-verified ${clock(snap.reverifiedAt)}` : 'connector NOT re-verified'
    return `LIVE · CACHED from ${when} under ${snap.account ?? 'an unknown account'} · ${checked} · details not cached, refreshing · read-only`
  }
  const account = snap.account && snap.account === config.workAccount ? `Drive account ${snap.account} (verified ${clock(snap.refreshedAt)})` : 'Drive account NOT VERIFIED'
  return `LIVE · ${account} · refreshed ${when} · read-only`
}

export function needsYou(snap: Snapshot, show: ProjectFilter, agents: readonly AgentRow[]): { text: string; source: Source }[] {
  const lines: { text: string; source: Source }[] = []
  const content = snap.content
  if ((show === 'all' || show === 'content') && content.health !== 'ok') {
    const count = content.published === null ? 'no verifiable count' : `${content.published} of ${content.target} reported published`
    const slotted = content.posts.find(p => p.ideaProblem)
    const reason = content.posts.find(p => p.blockedReason)?.blockedReason ?? (slotted ? `post-${slotted.slot}: ${slotted.ideaProblem}` : content.note)
    lines.push({ text: `Content ${HEALTH_LABEL[content.health]}: ${count}. ${reason}`, source: content.source })
  }
  for (const row of snap.rows) {
    if (show !== 'all' && row.project !== show) continue
    if (!isOpen(row) || row.isInfo) continue
    // An open item asking for Elia's decision or approval is listed whatever
    // the health of the document it comes from.
    const asks = row.needsElia && row.kind !== 'source' && row.kind !== 'summary'
    if (row.health === 'ok' || (row.health === 'stale' && row.kind !== 'source')) {
      if (asks) {
        lines.push({
          text: `${PROJECT_LABELS[row.project]} NEEDS YOUR DECISION: ${row.id} ${row.detail}${row.health === 'stale' ? ' (source is stale)' : ''}`,
          source: row.source,
        })
      }
      continue
    }
    lines.push({ text: `${PROJECT_LABELS[row.project]} ${HEALTH_LABEL[row.health]}: ${row.kind === 'source' || row.kind === 'summary' ? `${row.title}: ` : `${row.id} `}${row.detail}`, source: row.source })
  }
  const staleDocs = new Map<string, StatusRow>()
  for (const row of snap.rows) {
    if (row.health === 'stale' && (show === 'all' || row.project === show)) staleDocs.set(`${row.project}|${row.source.label}`, row)
  }
  for (const row of staleDocs.values()) {
    lines.push({ text: `${PROJECT_LABELS[row.project]} STALE: ${row.healthNote}`, source: row.source })
  }
  for (const agent of agents) {
    if (agent.state === 'blocked' && (show === 'all' || agent.project === show)) {
      lines.push({ text: `Agent BLOCKED: ${agent.task}${agent.result ? ` (${agent.result})` : ''}`, source: agent.source })
    }
  }
  return lines
}

// ---- Drawing ----------------------------------------------------------------

type Els = { Box: any; Text: any; Button: any; Link: any }

function SourceLine(E: Els, source: Source, now: number, indent = '    ') {
  return (
    <E.Text dimColor wrap="truncate-end">
      {indent}↳ {sourceText(source, now)}
    </E.Text>
  )
}

function Section(E: Els, title: string, isDemo: boolean, children: unknown[]) {
  return (
    <E.Box flexDirection="column" marginTop={1}>
      <E.Text bold>
        {title}
        {isDemo ? <E.Text color="warning"> · DEMO FIXTURES</E.Text> : null}
      </E.Text>
      {children}
    </E.Box>
  )
}

function Badge(E: Els, health: Health) {
  return <E.Text color={HEALTH_COLOR[health]}>[{HEALTH_LABEL[health]}]</E.Text>
}

function drawAgents(E: Els, agents: readonly AgentRow[], show: ProjectFilter, now: number) {
  const rows = agents
    .filter(a => show === 'all' || a.project === show)
    .sort((a, b) => b.lastUpdate - a.lastUpdate)
    .slice(0, 12)
  if (rows.length === 0) {
    return [<E.Text dimColor>No observed agent activity. Only this session's agents and GitHub PRs are visible.</E.Text>]
  }
  return rows.map(a => (
    <E.Box flexDirection="column">
      <E.Text wrap="truncate-end">
        <E.Text color={AGENT_COLOR[a.state]}>{a.state.padEnd(9)}</E.Text> {a.task}
        <E.Text dimColor>
          {' '}· {a.project === 'session' ? 'this session' : PROJECT_LABELS[a.project]} · last update {clock(a.lastUpdate)}
          {a.result ? ` · ${a.result}` : ''}
        </E.Text>
      </E.Text>
      {SourceLine(E, a.source, now)}
      {a.link ? <E.Link href={a.link} label={`    ${a.link}`} /> : null}
    </E.Box>
  ))
}

function drawRow(E: Els, r: StatusRow, now: number) {
  return (
    <E.Box flexDirection="column">
      <E.Text wrap="truncate-end">
        {'  '}
        {r.kind === 'source' || r.kind === 'summary' ? r.title : r.id} {Badge(E, r.health)} <E.Text dimColor>{r.status}</E.Text> {r.detail}
      </E.Text>
      {SourceLine(E, r.source, now)}
    </E.Box>
  )
}

function drawProjects(E: Els, snap: Snapshot, show: ProjectFilter, now: number) {
  return PROJECT_ORDER.filter(p => show === 'all' || show === p).map(project => {
    const rows = snap.rows.filter(r => r.project === project)
    // Informational rows (not connected, nothing targeted) colour the header
    // only when the project has nothing else.
    const counted = rows.filter(r => !r.isInfo)
    const healths = (counted.length ? counted : rows).map(r => r.health)
    if (project === 'content') healths.push(snap.content.health)
    const health = healths.length ? worst(healths) : 'not-configured'
    const shown = [
      ...rows.filter(r => r.kind === 'source' || r.kind === 'summary'),
      ...rows.filter(r => isOpen(r) && r.kind !== 'source' && r.kind !== 'summary').slice(0, 6),
    ]
    return (
      <E.Box flexDirection="column">
        <E.Text>
          <E.Text bold>{PROJECT_LABELS[project]}</E.Text> {Badge(E, health)}
        </E.Text>
        {shown.length === 0 ? <E.Text color="subtle">  No source returned anything for this project.</E.Text> : null}
        {shown.map(r => drawRow(E, r, now))}
      </E.Box>
    )
  })
}

function drawContent(E: Els, content: ContentDay, now: number) {
  const header = STAGES.map(s => STAGE_LABEL[s].padEnd(10)).join('')
  const count =
    content.published === null ? (
      <E.Text color={HEALTH_COLOR[content.health]} bold>
        — / {content.target} (no verifiable count)
      </E.Text>
    ) : (
      <E.Text color={content.published >= content.target ? 'success' : 'warning'} bold>
        {content.published} / {content.target}
      </E.Text>
    )
  return [
    <E.Text>
      {content.date} (America/Edmonton) · reported published: {count} {Badge(E, content.health)}
    </E.Text>,
    <E.Text dimColor>
      A post counts when a valid manifest (schema 1) has a platform receipt marked published with its post ID, publishedAt on
      this date and a post URL on that platform. Reported by the publisher, not confirmed with the platform.
    </E.Text>,
    <E.Text dimColor wrap="truncate-end">{content.note}</E.Text>,
    SourceLine(E, content.source, now, ''),
    <E.Text dimColor>{'        '}{header}</E.Text>,
    ...content.posts.map(post => (
      <E.Box flexDirection="column">
        <E.Text>
          {`post-${post.slot}`.padEnd(8)}
          {STAGES.map(stage => (
            <E.Text
              color={post.stages[stage] === 'done' ? 'success' : post.stages[stage] === 'blocked' ? 'error' : undefined}
              dimColor={post.stages[stage] === 'unknown'}
            >
              {STAGE_GLYPH[post.stages[stage]].padEnd(10)}
            </E.Text>
          ))}
        </E.Text>
        {post.blockedReason ? (
          <E.Text color="error" wrap="truncate-end">{'        '}BLOCKED: {post.blockedReason}</E.Text>
        ) : null}
        {post.ideaProblem ? (
          <E.Text color="warning" wrap="truncate-end">{'        '}IDEA: {post.ideaProblem}</E.Text>
        ) : null}
      </E.Box>
    )),
    <E.Text dimColor>● done  ○ not yet  ? not observable  ✕ blocked  – not targeted</E.Text>,
    content.ideas ? (
      <E.Box flexDirection="column">
        <E.Text>
          Ideas{content.ideas.planned !== undefined ? ` (${content.ideas.planned} planned)` : ''}: {Badge(E, content.ideas.health)}
          {content.ideas.note ? <E.Text dimColor> {content.ideas.note}</E.Text> : null}
        </E.Text>
        {SourceLine(E, content.ideas.source, now)}
      </E.Box>
    ) : (
      <E.Text color="subtle">Ideas: [SOURCE NOT CONFIGURED]</E.Text>
    ),
  ]
}

function drawOffers(E: Els, snap: Snapshot, now: number) {
  const rows = snap.rows.filter(r => r.project === 'offers' && isOpen(r))
  if (rows.length === 0) return [<E.Text color="error">No offer records were returned by any source.</E.Text>]
  const groups: [string, StatusRow[]][] = [
    ['Sources', rows.filter(r => r.kind === 'source')],
    ['Decisions needing Elia', rows.filter(r => r.kind !== 'source' && r.needsElia)],
    ['In progress', rows.filter(r => r.kind !== 'source' && !r.needsElia && (r.kind === 'state' || r.kind === 'proposal'))],
    ['Next actions', rows.filter(r => r.kind !== 'source' && !r.needsElia && r.kind === 'action')],
    ['Open questions', rows.filter(r => r.kind !== 'source' && !r.needsElia && r.kind === 'question')],
  ]
  return [
    ...groups
      .filter(([, list]) => list.length > 0)
      .map(([title, list]) => (
        <E.Box flexDirection="column">
          <E.Text underline>{title}</E.Text>
          {list.slice(0, 8).map(r => drawRow(E, r, now))}
        </E.Box>
      )),
    <E.Text dimColor>"Needing Elia" is inferred from each record's owner or approval wording.</E.Text>,
  ]
}

function drawUsage(E: Els, usage: UsageView, now: number, isDemo: boolean) {
  const context =
    usage.contextPercent !== undefined
      ? `${usage.contextPercent}% of ${Math.round((usage.contextWindow ?? 0) / 1000)}k tokens`
      : 'not reported yet'
  return [
    <E.Text>
      Model: {usage.model ?? 'unknown'} · Context: {context}
      {usage.costUsd !== undefined ? ` · Session cost: $${usage.costUsd.toFixed(2)}` : ''}
    </E.Text>,
    ...usage.limits.map(l => (
      <E.Text>
        {l.kind.replace('_', '-')}:{' '}
        <E.Text color={l.percentUsed >= 80 ? 'error' : l.percentUsed >= 50 ? 'warning' : 'success'}>{l.percentUsed}%</E.Text>
        {l.resetsAt ? ` · resets ${clock(Date.parse(l.resetsAt))}` : ' · reset time not reported'}
      </E.Text>
    )),
    usage.note ? <E.Text dimColor>{usage.note}</E.Text> : null,
    SourceLine(
      E,
      isDemo
        ? { label: 'DEMO this Claude Code session', kind: 'fixture', checkedAt: usage.checkedAt }
        : { label: 'this Claude Code session', kind: 'observed', checkedAt: usage.checkedAt },
      now,
      '',
    ),
  ]
}

// ---- Hooks ------------------------------------------------------------------

export const register: Register = (on, options) => {
  const config = configFrom(options)

  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'ops',
        description: 'Bridgerow operations dashboard (read-only)',
        argumentHint: '[refresh | demo | live | clear-cache | all | website | content | offers | palios | dance]',
      })
    } catch {
      // already registered in this session
    }
    try {
      // A cache made under other settings or another account is dropped.
      const raw = await $.store.get(STORE_KEY)
      const cached = fromCache(raw, fingerprint(config, config.workAccount))
      // It stays hidden until a refresh verifies the connector's account, and
      // nothing from before this start is shown unverified either.
      await update($, liveSnapshot, () => null)
      await update($, pendingCache, () => cached ?? null)
      if (!cached && raw !== undefined) await $.store.delete(STORE_KEY)
    } catch {
      // the dashboard is optional; the session starts regardless
    }
    return next(e)
  })

  on('command.run', { command: 'ops' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'clear-cache') {
      await $.store.delete(STORE_KEY)
      await update($, pendingCache, () => null)
      const snap = await read($, liveSnapshot)
      if (snap?.isCached) await update($, liveSnapshot, () => null)
      return { text: 'Dashboard cache cleared. Nothing else was changed.' }
    }
    await $.ui.open({ id: PANE, title: 'Bridgerow Ops' })
    if ((FILTERS as readonly string[]).includes(arg)) {
      await update($, filter, () => arg as ProjectFilter)
      return { text: `Filter: ${FILTER_LABELS[arg as ProjectFilter]}.` }
    }
    if (arg === 'demo') return { text: await refresh($, config, 'demo') }
    if (arg === 'live' || arg === 'refresh' || arg === '') {
      const current = arg === 'live' ? 'live' : await read($, view)
      return { text: await refresh($, config, current) }
    }
    return { text: `Unknown option "${sanitizeText(arg, 40)}". Try /ops, /ops refresh, /ops demo, /ops live, /ops clear-cache or a project name.` }
  })

  // Observed activity: the main loop's turns and the Agent calls in this
  // session. Bookkeeping never stops the event: each failure is swallowed, and
  // `next` is called exactly once.
  const mainRow = (now: number, state: AgentRow['state'], result?: string): AgentRow => ({
    id: 'main',
    task: 'Main Claude Code session',
    project: 'session',
    state,
    lastUpdate: now,
    result,
    source: { label: 'this session', kind: 'observed', checkedAt: now, updatedAt: now },
  })

  on('turn.start', async ($, e, next) => {
    try {
      await trackAgent($, mainRow(await $.clock.now(), 'working'))
    } catch {
      // bookkeeping only
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    try {
      const now = await $.clock.now()
      await trackAgent($, mainRow(now, 'waiting', 'waiting for you'))
      // Picks up subagents that finished or changed state during the turn.
      const merged = await gatherAgents($, await read($, liveAgents), now)
      await update($, liveAgents, () => sanitizeDeep(merged).slice(-50))
    } catch {
      // bookkeeping only
    }
    return result
  })

  // Observes Agent and Task calls only. It never denies or rewrites a call.
  // `next(e)` is called once, outside every try: bookkeeping before or after it
  // can fail without running the call again, and an error from the call itself
  // propagates unchanged. There is no .catch on this hook, so the host never
  // re-enters it.
  on('tool.call', async ($, e, next) => {
    const name = String(e.tool)
    if (name !== 'Agent' && name !== 'Task') return next(e)
    let row: AgentRow | undefined
    let runsInBackground = false
    try {
      const input = e as unknown as { description?: string; subagent_type?: string; run_in_background?: boolean }
      runsInBackground = input.run_in_background === true
      const started = await $.clock.now()
      row = {
        id: e.tool_use_id ?? `agent-${started}`,
        task: sanitizeText(input.description ?? 'subagent task', 160),
        project: 'session',
        state: 'working',
        lastUpdate: started,
        source: { label: `this session · ${sanitizeText(input.subagent_type ?? 'agent', 60)}`, kind: 'observed', checkedAt: started, updatedAt: started },
      }
      await trackAgent($, row)
    } catch {
      row = undefined
    }

    let result: Awaited<ReturnType<typeof next>>
    try {
      result = await next(e)
    } catch (error) {
      // The call threw: the agent is shown as blocked with the (sanitized)
      // message, and the original error is rethrown unchanged.
      if (row) {
        try {
          let ended = row.lastUpdate
          try {
            ended = await $.clock.now()
          } catch {
            // keep the start time
          }
          await trackAgent($, {
            ...row,
            state: 'blocked',
            lastUpdate: ended,
            result: `threw: ${sanitizeText(message(error), 120)}`,
            source: { ...row.source, checkedAt: ended, updatedAt: ended },
          })
        } catch {
          // bookkeeping only
        }
      }
      throw error
    }

    if (row) {
      try {
        const ended = await $.clock.now()
        const failed = 'deny' in result && result.deny !== undefined ? true : result.isError === true
        await trackAgent($, {
          ...row,
          state: failed ? 'blocked' : runsInBackground ? 'working' : 'completed',
          lastUpdate: ended,
          result: failed
            ? sanitizeText(String(result.deny ?? result.text ?? 'tool error'), 120)
            : runsInBackground
              ? 'running in background'
              : 'returned a result',
          source: { ...row.source, checkedAt: ended, updatedAt: ended },
        })
      } catch {
        // bookkeeping only; the call's result stands
      }
    }
    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const E = $.ui.resolve(e) as unknown as Els
    const which = await read($, view)
    const snap = which === 'demo' ? await read($, demoData) : await read($, liveSnapshot)
    const show = await read($, filter)
    const busy = await read($, isRefreshing)
    const isDemo = which === 'demo'
    const tracked = isDemo ? [] : await read($, liveAgents)
    const held = isDemo ? null : await read($, pendingCache)
    const now = await $.clock.now()

    const header = (
      <E.Box flexDirection="column">
        {isDemo ? (
          <E.Text color="warning" bold>
            ▲ DEMO FIXTURES · NOT LIVE DATA · live data is kept separately · /ops live to return
          </E.Text>
        ) : null}
        <E.Box flexWrap="wrap" columnGap={1}>
          <E.Button
            key="refresh"
            label={busy ? 'Refreshing…' : isDemo ? 'Reload demo' : 'Refresh live'}
            variant="primary"
            hotkey="r"
            onPress={() => refresh($, config, which)}
          />
          {isDemo ? (
            <E.Button key="to-live" label="Go live" onPress={() => refresh($, config, 'live')} />
          ) : null}
          {FILTERS.map(f => (
            <E.Button
              key={`filter-${f}`}
              label={show === f ? `▸${FILTER_LABELS[f]}` : FILTER_LABELS[f]}
              plain
              onPress={() => update($, filter, () => f)}
            />
          ))}
        </E.Box>
        <E.Text dimColor>
          {snap
            ? headerText(snap, isDemo, config, now)
            : isDemo
              ? 'No demo loaded.'
              : held
                ? 'No live data yet. A cached view from an earlier session is held back until a refresh verifies the Drive connector account. Press Refresh live or run /ops refresh.'
                : 'No live data yet. Press Refresh live or run /ops refresh.'}
        </E.Text>
      </E.Box>
    )
    if (!snap) return <E.Box flexDirection="column">{header}</E.Box>

    const agents = agentsFor(snap, tracked)
    const attention = needsYou(snap, show, agents)
    return (
      <E.Box flexDirection="column">
        {header}
        {Section(
          E,
          `Needs you (${attention.length})`,
          isDemo,
          attention.length
            ? attention.map(line => (
                <E.Box flexDirection="column">
                  <E.Text color="warning" wrap="truncate-end">! {line.text}</E.Text>
                  {SourceLine(E, line.source, now)}
                </E.Box>
              ))
            : [<E.Text dimColor>Nothing flagged.</E.Text>],
        )}
        {Section(E, 'Agent activity (observed only)', isDemo, drawAgents(E, agents, show, now))}
        {show !== 'offers' ? Section(E, 'Projects', isDemo, drawProjects(E, snap, show, now)) : null}
        {show === 'all' || show === 'content' ? Section(E, 'Content pipeline', isDemo, drawContent(E, snap.content, now)) : null}
        {show === 'all' || show === 'offers' ? Section(E, 'Sales & offers', isDemo, drawOffers(E, snap, now)) : null}
        {Section(E, 'Usage', isDemo, drawUsage(E, snap.usage, now, isDemo))}
        {snap.problems.length
          ? Section(E, 'Source problems', isDemo, snap.problems.map(p => <E.Text color="error" wrap="truncate-end">{p}</E.Text>))
          : null}
      </E.Box>
    )
  })
}

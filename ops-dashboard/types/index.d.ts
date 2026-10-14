// The dashboard's own values: what a refresh gathers and what the pane draws.

export type ProjectKey = 'website' | 'social' | 'content' | 'offers' | 'palios' | 'dance'
export type ProjectFilter = ProjectKey | 'all'

// observed: seen live (this session, GitHub, a Drive file's real state).
// snapshot: a status someone wrote into an ELIA OS document.
// reported: what the publisher wrote in the daily manifest; its form is
//           checked, but nothing confirms it with the platform.
// fixture: demo data, never mixed with live data.
export type Provenance = 'observed' | 'snapshot' | 'reported' | 'fixture'

// ok             the source was read and is current
// stale          the source was read but has not been updated within staleDays
// not-configured no source is set for this item in the settings
// access-denied  a source is set but the Work account could not read it
// missing        the source was read but the expected item is not there
// verified-zero  the source was read and verifies a count of zero
// blocked        the source says, or shows, that work cannot proceed
// conflict       an older document disagrees with newer verified activity
// source-error   the source was read but is malformed, ambiguous or incomplete
// not-approved   the item is outside the approved scope (another owner, or
//                no owner reported, and not listed in approvedSharedIds)
export type Health =
  | 'ok'
  | 'stale'
  | 'not-configured'
  | 'access-denied'
  | 'missing'
  | 'verified-zero'
  | 'blocked'
  | 'conflict'
  | 'source-error'
  | 'not-approved'

export type Source = {
  label: string
  url?: string
  kind: Provenance
  checkedAt: number
  updatedAt?: number
}

export type StatusRow = {
  id: string
  project: ProjectKey
  title: string
  status: string
  detail: string
  source: Source
  health: Health
  healthNote?: string
  needsElia: boolean
  // Shown in its section only, not in Needs you: a known gap with nothing to
  // decide today (for example, no analytics connected).
  isInfo?: boolean
  kind: 'state' | 'action' | 'question' | 'decision' | 'proposal' | 'summary' | 'source'
}

export type AgentState = 'working' | 'waiting' | 'blocked' | 'completed'

export type AgentRow = {
  id: string
  task: string
  project: ProjectKey | 'session'
  state: AgentState
  lastUpdate: number
  link?: string
  result?: string
  source: Source
}

// The platforms a Social Ops manifest can target.
export type Platform = 'instagram' | 'tiktok' | 'youtubeShorts' | 'facebook'

// idea: today's calendar slot; approval: the post's approval.status;
// media: its video is in the day folder; scheduled: publishAt is set; then one
// column per platform from that platform's receipt.
export type Stage = 'idea' | 'approval' | 'media' | 'scheduled' | Platform
// off: the post does not target that platform.
export type StageState = 'done' | 'pending' | 'unknown' | 'blocked' | 'off'

// A platform receipt that passed the evidence checks.
export type PostReceipt = { platform: Platform; at: number; url: string; postId: string }

export type ContentPost = {
  id: string
  slot: string
  stages: Record<Stage, StageState>
  status: string
  // Reported published on at least one platform with well-formed evidence.
  isPublished: boolean
  // The earliest counted receipt's publishedAt, when isPublished.
  publishedAt?: number
  receipts: PostReceipt[]
  // Platforms whose receipt failed or could not be counted.
  failedOn: Platform[]
  blockedReason?: string
  // The manifest names a calendar slot that is not scheduled for this date.
  ideaProblem?: string
}

export type ContentDay = {
  date: string
  target: number
  // Posts the manifest reports as published with well-formed evidence. null:
  // no valid manifest was read, so there is no count to show.
  published: number | null
  posts: ContentPost[]
  health: Health
  note: string
  source: Source
  ideas?: { planned?: number; today?: string[]; source: Source; health: Health; note?: string }
}

// Dated, verified activity a conflict check compares documents against.
export type Activity = {
  project: ProjectKey
  at: number
  what: string
  source: Source
  // Set when the activity shows a verified publication.
  isPublication?: boolean
}

export type UsageLimit = { kind: string; percentUsed: number; resetsAt?: string }

export type UsageView = {
  model?: string
  contextPercent?: number
  contextWindow?: number
  tokens?: number
  limits: UsageLimit[]
  costUsd?: number
  checkedAt: number
  note?: string
}

export type Snapshot = {
  mode: 'live' | 'demo'
  refreshedAt: number
  isCached: boolean
  // The Drive account the connector was verified to be signed in as.
  account?: string
  // Which settings and account produced it; a cache with another is dropped.
  fingerprint?: string
  // A cached snapshot is shown only after the connector is verified again as
  // the account it was cached under; this is when that check passed.
  reverifiedAt?: number
  rows: StatusRow[]
  agents: AgentRow[]
  content: ContentDay
  usage: UsageView
  problems: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'bridgerow-ops-dashboard': {
      live: Snapshot | null
      // A cache loaded at session start, hidden until the account is verified.
      pendingCache: Snapshot | null
      demo: Snapshot | null
      view: 'live' | 'demo'
      filter: ProjectFilter
      isRefreshing: boolean
      liveAgents: AgentRow[]
    }
  }
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { challengeAssets as a } from '../challenge/challengeAssets'
import { GAME_SLUG } from '../challenge/gameMeta'
import { gamePaths } from '../gameRoutes'
import type { TradeCategoryId } from '../trade/tradeTypes'
import { fetchCreateGameSettings, putCreateGameSettings } from './createGameSettingsApi'
import {
  CREATE_GAME_ASSET_OPTIONS,
  CREATE_GAME_CATEGORY_OPTIONS,
  normalizeCreateGameAssetsMode,
  type AssetsMode,
  type CreateGameSettingsPutBody,
  type DurationPreset,
  type VisibilityMode,
} from './createGameWizardTypes'
import './createGameWizard.css'

const TARGET_SLUG = GAME_SLUG.newTemplate

const DURATION_OPTIONS: { id: DurationPreset; label: string }[] = [
  { id: '1d', label: '1 day' },
  { id: '1w', label: '1 week' },
  { id: '1m', label: '1 month' },
  { id: '1y', label: '1 year' },
  { id: 'custom', label: 'Custom' },
]

const VIS_OPTIONS: { id: VisibilityMode; label: string }[] = [
  { id: 'public', label: 'Public — anyone can join' },
  { id: 'private', label: 'Private — you approve each player' },
]

const MS_DAY = 86_400_000

/** Mirrors `server/gameRuntimeRulesService.computeGameEndIso` for instant UI preview. */
function computeGameEndIsoClient(
  startsAtIso: string,
  durationPreset: DurationPreset,
  customEndsOn: string | null,
): string | null {
  const start = new Date(startsAtIso).getTime()
  if (!Number.isFinite(start)) return null
  switch (durationPreset) {
    case '1d':
      return new Date(start + MS_DAY).toISOString()
    case '1w':
      return new Date(start + 7 * MS_DAY).toISOString()
    case '1m':
      return new Date(start + 30 * MS_DAY).toISOString()
    case '1y':
      return new Date(start + 365 * MS_DAY).toISOString()
    case 'custom': {
      if (!customEndsOn || !/^\d{4}-\d{2}-\d{2}$/.test(customEndsOn)) return null
      const [y, mo, d] = customEndsOn.split('-').map((x) => Number(x))
      if (!y || !mo || !d) return null
      const endMs = Date.UTC(y, mo - 1, d, 23, 59, 59, 999)
      if (endMs <= start) return null
      return new Date(endMs).toISOString()
    }
    default:
      return null
  }
}

function todayYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatLongDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

function daysBetweenClient(startIso: string, endIso: string | null): number | null {
  if (!endIso) return null
  const a = new Date(startIso).getTime()
  const b = new Date(endIso).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null
  return Math.max(1, Math.ceil((b - a) / MS_DAY))
}

function defaultForm(): CreateGameSettingsPutBody {
  return {
    gameDisplayName: '',
    durationPreset: '1m',
    customEndsOn: null,
    assetsMode: 'stocks_only',
    assetsCategory: 'tech',
    visibility: 'public',
    setupComplete: false,
  }
}

export function CreateGameWizardScreen() {
  const navigate = useNavigate()
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [form, setForm] = useState<CreateGameSettingsPutBody>(defaultForm)
  const [serverMeta, setServerMeta] = useState<{ startsAtIso: string | null; endsAtIso: string | null }>({
    startsAtIso: null,
    endsAtIso: null,
  })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetchCreateGameSettings(TARGET_SLUG)
        if (cancelled) return
        if (res.settings) {
          const s = res.settings
          const assetsMode = normalizeCreateGameAssetsMode(s.assetsMode)
          let assetsCategory = s.assetsCategory ?? 'tech'
          if (assetsCategory === 'crypto') assetsCategory = 'tech'
          setForm({
            gameDisplayName: s.gameDisplayName,
            durationPreset: s.durationPreset,
            customEndsOn: s.customEndsOn,
            assetsMode,
            assetsCategory,
            visibility: s.visibility,
            themePaletteId: s.themePaletteId,
            loadScreenEmoji: s.loadScreenEmoji,
            hostDisplayName: s.hostDisplayName,
            setupComplete: false,
          })
          setServerMeta({ startsAtIso: s.startsAtIso, endsAtIso: s.endsAtIso })
        } else {
          setForm(defaultForm())
          setServerMeta({ startsAtIso: null, endsAtIso: null })
        }
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : 'Could not load saved settings.')
      } finally {
        if (!cancelled) setHydrated(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /** Live preview from form + game start (not only last successful save). */
  const previewEndsAtIso = useMemo(() => {
    if (!serverMeta.startsAtIso) return serverMeta.endsAtIso
    const fromForm = computeGameEndIsoClient(
      serverMeta.startsAtIso,
      form.durationPreset,
      form.durationPreset === 'custom' ? form.customEndsOn : null,
    )
    if (fromForm != null) return fromForm
    if (form.durationPreset === 'custom' && form.customEndsOn) return null
    return serverMeta.endsAtIso
  }, [
    serverMeta.startsAtIso,
    serverMeta.endsAtIso,
    form.durationPreset,
    form.customEndsOn,
  ])

  const previewDays = useMemo(() => {
    if (!serverMeta.startsAtIso || !previewEndsAtIso) return null
    return daysBetweenClient(serverMeta.startsAtIso, previewEndsAtIso)
  }, [serverMeta.startsAtIso, previewEndsAtIso])

  const persist = useCallback(async (body: CreateGameSettingsPutBody) => {
    setSaving(true)
    setSaveErr(null)
    try {
      const { settings } = await putCreateGameSettings(TARGET_SLUG, { ...body, setupComplete: false })
      setServerMeta({ startsAtIso: settings.startsAtIso, endsAtIso: settings.endsAtIso })
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    const t = window.setTimeout(() => {
      if (!form.gameDisplayName.trim()) return
      void persist(form)
    }, 900)
    return () => window.clearTimeout(t)
  }, [form, hydrated, persist])

  const canNext = form.gameDisplayName.trim().length > 0 && (form.durationPreset !== 'custom' || Boolean(form.customEndsOn))

  const onNext = useCallback(async () => {
    if (!canNext) return
    await persist(form)
    navigate(gamePaths.createGameTheme)
  }, [canNext, form, navigate, persist])

  return (
    <div className="cgw-root">
      <div className="cgw-phone">
        <button type="button" className="cgw-back" aria-label="Back" onClick={() => navigate(gamePaths.createGame)}>
          <img src={a.back} alt="" />
        </button>

        <div className="cgw-card">
          <div className="cgw-scroll">
            <h1 className="cgw-title">Create game</h1>
            <p className="cgw-sub">Step 1 of 2 — basics for your challenge</p>

            {loadErr ? <p className="cgw-err">{loadErr}</p> : null}
            {saveErr ? <p className="cgw-err">{saveErr}</p> : null}

            <div className="cgw-row">
              <div className="cgw-lab">Game name</div>
              <div className="cgw-field">
                <input
                  className="cgw-input"
                  placeholder="Name your game"
                  value={form.gameDisplayName}
                  maxLength={80}
                  onChange={(e) => setForm((p) => ({ ...p, gameDisplayName: e.target.value }))}
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="cgw-row">
              <div className="cgw-lab">Game length</div>
              <div className="cgw-field">
                <select
                  className="cgw-select"
                  value={form.durationPreset}
                  onChange={(e) => {
                    const v = e.target.value as DurationPreset
                    setForm((p) => ({
                      ...p,
                      durationPreset: v,
                      customEndsOn: v === 'custom' ? p.customEndsOn ?? todayYmd() : null,
                    }))
                  }}
                >
                  {DURATION_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {form.durationPreset === 'custom' ? (
                  <input
                    className="cgw-input cgw-date"
                    type="date"
                    min={todayYmd()}
                    value={form.customEndsOn ?? ''}
                    onChange={(e) => setForm((p) => ({ ...p, customEndsOn: e.target.value || null }))}
                  />
                ) : null}
                <p className="cgw-meta">
                  {previewEndsAtIso ? (
                    <>
                      Ends {formatLongDate(previewEndsAtIso)}
                      {previewDays != null ? ` · ${previewDays} day${previewDays === 1 ? '' : 's'} long` : null}
                    </>
                  ) : form.durationPreset === 'custom' && form.customEndsOn ? (
                    <>End date must be after the game start.</>
                  ) : (
                    <>
                      Ends {formatLongDate(serverMeta.endsAtIso)}
                      {previewDays != null ? ` · ${previewDays} day${previewDays === 1 ? '' : 's'} long` : null}
                    </>
                  )}
                </p>
                <p className="cgw-hint">Length is saved from the first time you configure this game; adjust anytime before launch.</p>
              </div>
            </div>

            <div className="cgw-row">
              <div className="cgw-lab">Assets to trade</div>
              <div className="cgw-field">
                <select
                  className="cgw-select"
                  value={form.assetsMode}
                  onChange={(e) => {
                    const v = e.target.value as AssetsMode
                    setForm((p) => ({ ...p, assetsMode: v }))
                  }}
                >
                  {CREATE_GAME_ASSET_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {form.assetsMode === 'category' ? (
                  <select
                    className="cgw-select"
                    value={form.assetsCategory ?? 'popular'}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, assetsCategory: e.target.value as TradeCategoryId }))
                    }
                  >
                    {CREATE_GAME_CATEGORY_OPTIONS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                ) : null}
                <p className="cgw-hint">
                  Players can still browse any symbol; buys are only allowed for assets that match your rules.
                </p>
              </div>
            </div>

            <div className="cgw-row">
              <div className="cgw-lab">Visibility</div>
              <div className="cgw-field">
                <select
                  className="cgw-select"
                  value={form.visibility}
                  onChange={(e) => setForm((p) => ({ ...p, visibility: e.target.value as VisibilityMode }))}
                >
                  {VIS_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <p className="cgw-hint">
                  Private games queue join requests until you approve each player from the game screen.
                </p>
              </div>
            </div>
          </div>

          <div className="cgw-foot">
            <button type="button" className="cgw-next" disabled={!canNext} onClick={() => void onNext()}>
              <span className="cgw-nextLabel">Next</span>
            </button>
            {saving ? <p className="cgw-saving">Saving…</p> : null}
          </div>
        </div>
      </div>
    </div>
  )
}

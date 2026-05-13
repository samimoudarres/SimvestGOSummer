import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { GAME_SLUG } from '../challenge/gameMeta'
import { useComposerContext } from '../hooks/useComposerContext'
import { firstGraphemeFromString } from '../game/loadScreenEmoji'
import {
  THEME_PALETTE_IDS,
  THEME_PALETTE_LABELS,
  welcomeThemeForPalette,
  type ThemePaletteId,
} from '../game/gameThemePresets'
import { gamePaths } from '../gameRoutes'
import { BackArrowIcon } from '../icons/BackArrowIcon'
import { fetchCreateGameSettings, putCreateGameSettings } from './createGameSettingsApi'
import type { CreateGameSettingsDto, CreateGameSettingsPutBody } from './createGameWizardTypes'
import './createGameThemeScreen.css'

const TARGET_SLUG = GAME_SLUG.newTemplate

function dtoToPut(s: CreateGameSettingsDto): CreateGameSettingsPutBody {
  return {
    gameDisplayName: s.gameDisplayName,
    durationPreset: s.durationPreset,
    customEndsOn: s.customEndsOn,
    assetsMode: s.assetsMode,
    assetsCategory: s.assetsCategory,
    visibility: s.visibility,
    themePaletteId: s.themePaletteId,
    loadScreenEmoji: s.loadScreenEmoji,
    hostDisplayName: s.hostDisplayName,
    setupComplete: s.setupComplete,
  }
}

export function CreateGameThemeScreen() {
  const navigate = useNavigate()
  const { ctx } = useComposerContext(TARGET_SLUG)
  const emojiInputRef = useRef<HTMLInputElement>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [basePut, setBasePut] = useState<CreateGameSettingsPutBody | null>(null)
  const [gameTitleText, setGameTitleText] = useState('')
  const [palette, setPalette] = useState<ThemePaletteId>('ocean_deep')
  const [emoji, setEmoji] = useState('🍁')

  const profileName = (ctx?.displayName ?? '').trim()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetchCreateGameSettings(TARGET_SLUG)
        if (cancelled) return
        if (!res.settings) {
          navigate(gamePaths.createGameWizard, { replace: true })
          return
        }
        const s = res.settings
        setBasePut(dtoToPut(s))
        setGameTitleText(s.gameDisplayName.trim())
        setPalette(s.themePaletteId)
        setEmoji(s.loadScreenEmoji || '🍁')
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : 'Could not load game.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [navigate])

  const welcome = useMemo(() => welcomeThemeForPalette(palette), [palette])

  const backdropStyle = useMemo(
    () =>
      ({
        background: `linear-gradient(${welcome.welcomeGradientAngleDeg}deg, ${welcome.welcomeGradientFrom} 9.17%, ${welcome.welcomeGradientTo} 89.71%)`,
      }) as CSSProperties,
    [welcome],
  )

  const titleStyle = useMemo(() => {
    if (!welcome.titleTextShadow) return undefined
    return { textShadow: welcome.titleTextShadow } as CSSProperties
  }, [welcome.titleTextShadow])

  const persistThemeDraft = useCallback(async () => {
    if (!basePut) return
    setSaveErr(null)
    try {
      await putCreateGameSettings(TARGET_SLUG, {
        ...basePut,
        themePaletteId: palette,
        loadScreenEmoji: emoji,
        hostDisplayName: profileName,
      })
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Autosave failed')
    }
  }, [basePut, palette, emoji, profileName])

  useEffect(() => {
    if (!basePut) return
    const t = window.setTimeout(() => {
      void persistThemeDraft()
    }, 750)
    return () => window.clearTimeout(t)
  }, [basePut, palette, emoji, profileName, persistThemeDraft])

  const onEmojiInput = useCallback((raw: string) => {
    const next = firstGraphemeFromString(raw)
    setEmoji(next)
    if (emojiInputRef.current) emojiInputRef.current.value = ''
  }, [])

  const onCreate = useCallback(async () => {
    if (!basePut || !gameTitleText.trim()) return
    setSaving(true)
    setSaveErr(null)
    try {
      await putCreateGameSettings(TARGET_SLUG, {
        ...basePut,
        themePaletteId: palette,
        loadScreenEmoji: emoji,
        hostDisplayName: profileName,
        setupComplete: true,
      })
      navigate(gamePaths.newGameTemplate, { replace: true })
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Could not create game.')
    } finally {
      setSaving(false)
    }
  }, [basePut, gameTitleText, palette, emoji, profileName, navigate])

  const displayTitle = gameTitleText.trim() ? gameTitleText.trim().toUpperCase() : 'YOUR GAME'
  const hostedLine = profileName ? `Hosted by ${profileName}` : 'Hosted by you'
  const canCreate = Boolean(basePut && gameTitleText.trim().length > 0)

  return (
    <div className="cgt-root">
      <div className="cgt-phone" data-node-id="386:1367">
        <div className="cgt-preview" style={backdropStyle}>
          <button
            type="button"
            className="cgt-back"
            aria-label="Back"
            onClick={() => navigate(gamePaths.createGameWizard)}
          >
            <BackArrowIcon width={18} height={14} stroke="#fff" />
          </button>
          <div className="cgt-stockwm" aria-hidden />
          <span className="cgt-decor" aria-hidden>
            {emoji}
          </span>
          <p className="cgt-hosted">{hostedLine}</p>
          <h1 className="cgt-title" style={titleStyle}>
            {displayTitle}
          </h1>
        </div>

        <div className="cgt-dock">
          <p className="cgt-dockTitle">Palette</p>
          <div className="cgt-swatchesRow">
            <div className="cgt-swatches" role="list">
              {THEME_PALETTE_IDS.map((id) => {
                const w = welcomeThemeForPalette(id)
                const bg = `linear-gradient(135deg, ${w.welcomeGradientFrom}, ${w.welcomeGradientTo})`
                return (
                  <button
                    key={id}
                    type="button"
                    role="listitem"
                    className={`cgt-swatch${id === palette ? ' cgt-swatch--active' : ''}`}
                    style={{ background: bg }}
                    title={THEME_PALETTE_LABELS[id]}
                    aria-label={THEME_PALETTE_LABELS[id]}
                    aria-pressed={id === palette}
                    onClick={() => setPalette(id)}
                  />
                )
              })}
            </div>
          </div>

          <div className="cgt-emojiRow">
            <div
              className="cgt-emojiPick"
              role="button"
              tabIndex={0}
              onClick={() => emojiInputRef.current?.focus()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  emojiInputRef.current?.focus()
                }
              }}
            >
              <span className="cgt-emojiPreview" aria-hidden>
                {emoji}
              </span>
              <input
                ref={emojiInputRef}
                type="text"
                className="cgt-emojiInput"
                aria-label="Choose emoji"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={32}
                onChange={(e) => onEmojiInput(e.target.value)}
              />
            </div>
            <button type="button" className="cgt-emojiBtn" onClick={() => emojiInputRef.current?.focus()}>
              Choose emoji
            </button>
          </div>

          {loadErr ? <p className="cgt-err">{loadErr}</p> : null}
          {saveErr ? <p className="cgt-err">{saveErr}</p> : null}

          <button type="button" className="cgt-create" disabled={!canCreate || saving} onClick={() => void onCreate()}>
            <span className="cgt-createLabel">Create game</span>
          </button>
          {saving ? <p className="cgt-saving">Saving…</p> : null}
        </div>
      </div>
    </div>
  )
}

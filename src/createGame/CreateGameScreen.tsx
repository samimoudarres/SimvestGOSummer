import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { gamePaths } from '../gameRoutes'
import { BackArrowIcon } from '../icons/BackArrowIcon'
import './createGameScreen.css'

const SLIDE_COUNT = 4
const PHONE_W = 402
const AUTO_MS = 3000
const USER_COOLDOWN_MS = 3500

const slides = [
  {
    key: 'portfolio',
    className: 'cg-slide1',
    image: '/figma-assets/create-game/slide-portfolio.png',
    imageAlt: 'Hand holding phone with stock chart',
    title: 'Manage $100,000 Portfolio With Live Stock Updates',
    body: 'Simulate real-time trades using NASDAQ data and a $100,000 portfolio',
  },
  {
    key: 'compete',
    className: 'cg-slide2',
    image: '/figma-assets/create-game/slide-compete.png',
    imageAlt: 'Two players competing on phones',
    title: 'Compete Against Up To 1,000 Friends',
    body: 'Share your game link to up the stakes of your trading competition',
  },
  {
    key: 'prize',
    className: 'cg-slide3',
    image: '/figma-assets/create-game/slide-prize-pool.png',
    imageAlt: 'Prize pool and growth',
    title: 'Create and Grow Your Prize Pool',
    body: 'Set the buy-in price of your competition and increase the winner’s prize',
  },
  {
    key: 'settings',
    className: 'cg-slide4',
    image: '/figma-assets/create-game/slide-settings.png',
    imageAlt: 'Game settings',
    title: 'Customize Your Game Settings',
    body: 'Set the length of your competition, what can be traded (stocks, crypto, etc...), and trade limits',
  },
] as const

export function CreateGameScreen() {
  const navigate = useNavigate()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const resumeAutoplayAfter = useRef(0)
  /** While true, scroll events are treated as programmatic (auto-advance), not user drag. */
  const programmaticScrollUntil = useRef(0)
  const scrollSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const readIndexFromScroll = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return 0
    const i = Math.round(el.scrollLeft / PHONE_W)
    return Math.max(0, Math.min(SLIDE_COUNT - 1, i))
  }, [])

  const goToSlide = useCallback((i: number, opts?: { userIntent?: boolean }) => {
    const el = scrollerRef.current
    if (!el) return
    const clamped = Math.max(0, Math.min(SLIDE_COUNT - 1, i))
    if (opts?.userIntent) {
      resumeAutoplayAfter.current = Date.now() + USER_COOLDOWN_MS
    }
    programmaticScrollUntil.current = Date.now() + 700
    el.scrollTo({ left: clamped * PHONE_W, behavior: 'smooth' })
    setActive(clamped)
  }, [])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return

    const onScroll = () => {
      if (Date.now() > programmaticScrollUntil.current) {
        resumeAutoplayAfter.current = Date.now() + USER_COOLDOWN_MS
      }
      if (scrollSettleTimer.current) clearTimeout(scrollSettleTimer.current)
      scrollSettleTimer.current = setTimeout(() => {
        setActive(readIndexFromScroll())
      }, 60)
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (scrollSettleTimer.current) clearTimeout(scrollSettleTimer.current)
    }
  }, [readIndexFromScroll])

  useEffect(() => {
    const tick = () => {
      if (Date.now() < resumeAutoplayAfter.current) return
      const el = scrollerRef.current
      if (!el) return
      const i = Math.round(el.scrollLeft / PHONE_W)
      const clamped = Math.max(0, Math.min(SLIDE_COUNT - 1, i))
      const next = (clamped + 1) % SLIDE_COUNT
      programmaticScrollUntil.current = Date.now() + 700
      el.scrollTo({ left: next * PHONE_W, behavior: 'smooth' })
      setActive(next)
    }

    const id = window.setInterval(tick, AUTO_MS)
    return () => window.clearInterval(id)
  }, [])

  const onBack = useCallback(() => {
    navigate(-1)
  }, [navigate])

  const onCreate = useCallback(() => {
    navigate(gamePaths.createGameWizard)
  }, [navigate])

  const onJoin = useCallback(() => {
    navigate(gamePaths.join)
  }, [navigate])

  return (
    <div className="cg-root">
      <div className="cg-phone" data-node-id="238:4787">
        <div className="cg-gradient" aria-hidden />

        <button type="button" className="cg-back" aria-label="Back" onClick={onBack}>
          <BackArrowIcon width={18} height={14} stroke="#fff" />
        </button>

        <button type="button" className="cg-menu" aria-label="More options">
          <img src="/figma-assets/create-game/menu-dots.png" alt="" width={24} height={24} />
        </button>

        <h1 className="cg-logo" data-node-id="238:4791">
          SIMVEST
        </h1>

        <div className="cg-carouselWrap">
          <div ref={scrollerRef} className="cg-carousel" role="region" aria-roledescription="carousel" aria-label="Why create a game">
            {slides.map((s) => (
              <article key={s.key} className={`cg-slide ${s.className}`} aria-hidden={false}>
                <div
                  className={`cg-slideFigure${s.key === 'settings' ? ' cg-slideFigure--shadow' : ''}`}
                >
                  <img src={s.image} alt={s.imageAlt} draggable={false} />
                </div>
                <h2 className="cg-slideTitle">{s.title}</h2>
                <p className="cg-slideBody">{s.body}</p>
              </article>
            ))}
          </div>

          <div className="cg-dots" role="tablist" aria-label="Onboarding slides">
            {slides.map((s, i) => (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={i === active}
                aria-label={`${i + 1} of ${slides.length}`}
                className="cg-dotBtn"
                onClick={() => goToSlide(i, { userIntent: true })}
              >
                <span className={`cg-dot${i === active ? ' cg-dot--active' : ''}`} />
              </button>
            ))}
          </div>
        </div>

        <button type="button" className="cg-btnPrimary" onClick={onCreate} data-node-id="238:4792">
          <span className="cg-btnPrimaryLabel">Create new game</span>
        </button>

        <button type="button" className="cg-btnGhost" onClick={onJoin} data-node-id="238:4794">
          <span className="cg-btnGhostLabel">Join existing game</span>
        </button>
      </div>
    </div>
  )
}

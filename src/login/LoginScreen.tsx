import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PrivacyPolicyModal } from '../legal/PrivacyPolicyModal'
import { TermsOfServiceModal } from '../legal/TermsOfServiceModal'
import './loginScreen.css'

const SLIDE_COUNT = 4
const PHONE_W = 402
const AUTO_MS = 3000
const USER_COOLDOWN_MS = 3500

const slides = [
  {
    key: 'portfolio',
    image: '/figma-assets/login/slide-portfolio.svg',
    imageAlt: 'Hand holding phone with live stock chart',
    title: 'Real-time trading, zero risk',
    body: 'Simulate trades using live stock market data, without putting any real money on the line',
  },
  {
    key: 'competition',
    image: '/figma-assets/login/slide-competition.svg',
    imageAlt: 'Two players competing on phones',
    title: 'Invest like it’s a game',
    body: 'Compete in custom investing games and climb the leaderboard based on real-time returns',
  },
  {
    key: 'insights',
    image: '/figma-assets/login/slide-insights.svg',
    imageAlt: 'Portfolio and analytics overview',
    title: 'Get smarter with every trade',
    body: 'Follow your portfolio, learn from your moves, and improve your strategy',
  },
  {
    key: 'feed',
    image: '/figma-assets/login/slide-feed.svg',
    imageAlt: 'In-game chat bubbles with reactions',
    title: 'Trade out loud',
    body: 'Follow the in-game feed to view trades, strategies, and portfolio updates from other players',
  },
] as const

export function LoginScreen() {
  const navigate = useNavigate()
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [termsOpen, setTermsOpen] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const resumeAutoplayAfter = useRef(0)
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

  /* Log in / Sign up route to their respective auth surfaces. The two flows
   * share the same Simvest UI shell so the entry experience reads as one
   * piece. */
  const onLogIn = useCallback(() => {
    navigate('/login/sign-in')
  }, [navigate])
  const onSignUp = useCallback(() => {
    navigate('/signup/name')
  }, [navigate])

  return (
    <main className="li-root">
      <section className="li-phone" aria-label="Simvest login">
        <div className="li-bg" aria-hidden />

        <h1 className="li-logo">SIMVEST</h1>

        <div className="li-carouselWrap">
          <div
            ref={scrollerRef}
            className="li-carousel"
            role="region"
            aria-roledescription="carousel"
            aria-label="Login introduction"
          >
            {slides.map((slide) => (
              <article key={slide.key} className={`li-slide li-slide--${slide.key}`}>
                <div className="li-artShell">
                  <img src={slide.image} alt={slide.imageAlt} draggable={false} />
                </div>
                <h2 className="li-slideTitle">{slide.title}</h2>
                <p className="li-slideBody">{slide.body}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="li-dots" role="tablist" aria-label="Login slides">
          {slides.map((slide, i) => (
            <button
              key={slide.key}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={`${i + 1} of ${slides.length}`}
              className="li-dotBtn"
              onClick={() => goToSlide(i, { userIntent: true })}
            >
              <span className={`li-dot${i === active ? ' li-dot--active' : ''}`} />
            </button>
          ))}
        </div>

        <div className="li-actionCard" aria-hidden="false">
          <button type="button" className="li-btn li-btn--primary" onClick={onSignUp}>
            Sign up
          </button>
          <button type="button" className="li-btn li-btn--secondary" onClick={onLogIn}>
            Log in
          </button>
          <p className="li-legalRow">
            Learn how we use your data in our{' '}
            <button type="button" className="li-legalBtn" onClick={() => setPrivacyOpen(true)}>
              Privacy Policy
            </button>
            .
          </p>
          <p className="li-legalRow li-legalRow--stacked">
            Read our{' '}
            <button type="button" className="li-legalBtn" onClick={() => setTermsOpen(true)}>
              Terms of Service
            </button>
            .
          </p>
        </div>
      </section>
      <PrivacyPolicyModal open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
      <TermsOfServiceModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    </main>
  )
}

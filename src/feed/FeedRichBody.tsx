import { useNavigate } from 'react-router-dom'
import { navigateToStock } from '../stocks/navigateToStock'
import { apiAssetSrc } from '../config/apiAssetSrc'
import { gameTitle, slugToVariant } from '../challenge/gameMeta'
import type { RichTextSegment } from './richTextTypes'

type Props = {
  segments?: RichTextSegment[] | null
  fallbackText: string
  imageUrl?: string | null
  gameSlug: string
  returnPath: string
  navTab?: 'activity' | 'portfolio' | 'perform' | 'leaderboard'
}

export function FeedRichBody({ segments, fallbackText, imageUrl, gameSlug, returnPath, navTab }: Props) {
  const navigate = useNavigate()
  const title = gameTitle(slugToVariant(gameSlug))

  const openStock = (sym: string) => {
    navigateToStock(navigate, sym, {
      gameSlug,
      challengeTitle: title.toUpperCase(),
      returnPath,
      navTab: navTab ?? 'activity',
    })
  }

  const hasSegs = Array.isArray(segments) && segments.length > 0

  return (
    <div className="feedRichBody">
      {imageUrl ? <img className="feedRichBody__img" src={apiAssetSrc(imageUrl)} alt="" /> : null}
      <div className="feedRichBody__text">
        {hasSegs
          ? segments!.map((s, i) => {
              if (s.type === 'text') {
                const parts = s.text.split('\n')
                return (
                  <span key={i}>
                    {parts.map((line, j) => (
                      <span key={`${i}-${j}`}>
                        {j > 0 ? <br /> : null}
                        {line}
                      </span>
                    ))}
                  </span>
                )
              }
              return (
                <button
                  key={i}
                  type="button"
                  className="feedRichBody__tag"
                  onClick={() => openStock(s.symbol)}
                >
                  {s.label}
                </button>
              )
            })
          : fallbackText.trim()}
      </div>
    </div>
  )
}

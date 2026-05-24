import { useCallback, type ChangeEvent, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { DEFAULT_PROFILE_AVATAR_URL } from '../user/resolveProfileAvatarUrl'
import { apiAssetSrc } from '../config/apiAssetSrc'
import type { JoinSetupDraftInput } from './joinSetupTypes'

export function profileRowUsesDefaultGameAvatar(url: string | undefined): boolean {
  const t = (url ?? '').trim()
  return !t || t === DEFAULT_PROFILE_AVATAR_URL
}

function UserIcon() {
  return (
    <svg viewBox="0 0 73 73" aria-hidden>
      <circle cx="36.5" cy="36.5" r="36.5" fill="#8b8f94" />
      <circle cx="36.5" cy="26.8" r="10.2" fill="#ffffff" />
      <path d="M15 58c4.8-10.5 14.2-15.7 21.5-15.7S53.2 47.5 58 58" fill="#ffffff" />
    </svg>
  )
}

type AvatarProps = {
  draft: JoinSetupDraftInput
  useDefaultAvatar: boolean
  fileRef: RefObject<HTMLInputElement | null>
  onPickAvatar: (ev: ChangeEvent<HTMLInputElement>) => void
}

/**
 * Avatar preview + upload control (checkbox lives above the submit button).
 */
export function JoinGameProfileAvatarBlock({
  draft,
  useDefaultAvatar,
  fileRef,
  onPickAvatar,
}: AvatarProps) {
  return (
    <>
      <div className="jp-avatarWrap">
        <button
          type="button"
          className={`jp-avatarBtn${useDefaultAvatar ? ' jp-avatarBtn--dim' : ''}`}
          aria-label={useDefaultAvatar ? 'Using default profile picture' : 'Upload profile photo'}
          aria-disabled={useDefaultAvatar}
          disabled={useDefaultAvatar}
          onClick={() => {
            if (!useDefaultAvatar) fileRef.current?.click()
          }}
        >
          {useDefaultAvatar ? (
            <img className="jp-avatarImg" src={apiAssetSrc(DEFAULT_PROFILE_AVATAR_URL)} alt="" />
          ) : draft.avatarUrl ? (
            <img className="jp-avatarImg" src={apiAssetSrc(draft.avatarUrl)} alt="" />
          ) : (
            <span className="jp-avatarIcon">
              <UserIcon />
            </span>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={onPickAvatar}
        />
      </div>
      <p className="jp-photoHint">Profile photo (optional)</p>
    </>
  )
}

type CheckProps = {
  useDefaultAvatar: boolean
  setUseDefaultAvatar: (next: boolean) => void
  setDraft: Dispatch<SetStateAction<JoinSetupDraftInput>>
  fileRef: RefObject<HTMLInputElement | null>
}

/** Sits directly above the primary “Enter your game” / “Start trading” button. */
export function JoinGameDefaultAvatarChoice({ useDefaultAvatar, setUseDefaultAvatar, setDraft, fileRef }: CheckProps) {
  const onToggle = useCallback(
    (next: boolean) => {
      setUseDefaultAvatar(next)
      if (next) {
        setDraft((p) => ({ ...p, avatarUrl: '' }))
        if (fileRef.current) fileRef.current.value = ''
      }
    },
    [fileRef, setDraft, setUseDefaultAvatar],
  )

  return (
    <div className="jp-defaultAvatarBlock">
      <label className="jp-defaultAvatarRow">
        <input
          type="checkbox"
          className="jp-defaultAvatarCheck"
          checked={useDefaultAvatar}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className="jp-defaultAvatarLabel">Use default profile picture</span>
      </label>
      <p className="jp-defaultAvatarHint">
        Your account photo is pre-filled when you have one. Upload a different image above, or check this box
        to use Simvest&apos;s generic default avatar for this game only.
      </p>
    </div>
  )
}

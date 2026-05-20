import { apiAssetSrc } from '../config/apiAssetSrc'

const c = '/figma-assets/challenge'

function local(name: string): string {
  return apiAssetSrc(`${c}/${name}`)
}

/** Raster icons from Figma are often SVG text — use `.svg` so `<img>` loads correctly. */
export const challengeAssets = {
  back: local('arrow-back.svg'),
  chevronDown: local('chevron-down.svg'),
  leaderboard: local('icon-leaderboard.svg'),
  portfolio: local('icon-portfolio.svg'),
  performance: local('icon-performance.svg'),
  searchActivity: local('icon-search-activity.svg'),
  searchMagnifier: local('icon-search-magnifier.svg'),
  settingsGear: local('icon-settings-gear.svg'),
  ellipsis: apiAssetSrc('/figma-assets/vector-ellipsis.svg'),
  ellipsisHeader: local('ellipsis-header.svg'),
  imageIcon: local('icon-image.svg'),
  pollIcon: local('icon-poll.svg'),
  investmentIcon: local('icon-investment.svg'),
  plusIcon: local('icon-plus.svg'),
  avatarA: local('avatar-a.png'),
  avatarB: local('avatar-b.png'),
  avatarC: local('avatar-c.png'),
  avatarD: local('avatar-d.png'),
  avatarHost: local('avatar-host.png'),
  composerAvatar: local('composer-avatar.png'),
  gain1: local('gain-1.png'),
  gain2: local('gain-2.png'),
  gain3: local('gain-3.png'),
  gain4: local('gain-4.png'),
  bulb: local('bulb.svg'),
  feedAvatar: local('feed-avatar.png'),
  tsla: local('tsla.png'),
  unionBadge: local('union-badge.svg'),
  line23: local('line23.svg'),
  line24: local('line24.svg'),
  stockDown: local('stock-down.svg'),
  changeArrowUp: local('change-arrow-up.svg'),
  changeArrowDown: local('change-arrow-down.svg'),
  navRing: local('nav-ring.svg'),
  navInner: local('nav-inner.svg'),
  dollar: local('mdi-dollar.svg'),
} as const

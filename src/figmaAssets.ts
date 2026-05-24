import { apiAssetSrc } from './config/apiAssetSrc'

/** Local copies of Figma MCP export assets (see `public/figma-assets`). */
export const assets = {
  settings: apiAssetSrc('/figma-assets/challenge/icon-settings-gear.svg'),
  settingsAlt: apiAssetSrc('/figma-assets/challenge/icon-settings-gear.svg'),
  notification: apiAssetSrc('/figma-assets/notification.png'),
  chevron: apiAssetSrc('/figma-assets/vertical-container.svg'),
  ellipsis: apiAssetSrc('/figma-assets/vector-ellipsis.svg'),
  stockUp: apiAssetSrc('/figma-assets/vector-stock.png'),
  graphBlue: apiAssetSrc('/figma-assets/group2.png'),
  graphGold: apiAssetSrc('/figma-assets/group2.png'),
  bulb: apiAssetSrc('/figma-assets/challenge/bulb.svg'),
} as const

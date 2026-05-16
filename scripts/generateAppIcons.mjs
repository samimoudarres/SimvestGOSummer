/**
 * Generates Android mipmap launcher icons + iOS App Store icon from design/simvest-app-icon-source.png
 * Run: node scripts/generateAppIcons.mjs
 */
import { mkdir, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const source = path.join(root, 'design', 'simvest-app-icon-source.png')

const androidRes = path.join(root, 'android', 'app', 'src', 'main', 'res')
const iosIcon = path.join(
  root,
  'ios',
  'App',
  'App',
  'Assets.xcassets',
  'AppIcon.appiconset',
  'AppIcon-512@2x.png',
)

/** Legacy launcher + round (square artwork). */
const launcherSizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
}

/** Adaptive icon foreground layer (108dp baseline). */
const foregroundSizes = {
  'mipmap-mdpi': 108,
  'mipmap-hdpi': 162,
  'mipmap-xhdpi': 216,
  'mipmap-xxhdpi': 324,
  'mipmap-xxxhdpi': 432,
}

async function writePng(outPath, size) {
  await mkdir(path.dirname(outPath), { recursive: true })
  await sharp(source)
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .png({ compressionLevel: 9 })
    .toFile(outPath)
}

async function main() {
  const meta = await sharp(source).metadata()
  if (!meta.width || meta.width < 512) {
    console.warn(`[icons] Source is ${meta.width}x${meta.height}; 1024+ recommended.`)
  }

  for (const [folder, size] of Object.entries(launcherSizes)) {
    const dir = path.join(androidRes, folder)
    await writePng(path.join(dir, 'ic_launcher.png'), size)
    await writePng(path.join(dir, 'ic_launcher_round.png'), size)
    console.log(`android ${folder} launcher ${size}px`)
  }

  for (const [folder, size] of Object.entries(foregroundSizes)) {
    await writePng(path.join(androidRes, folder, 'ic_launcher_foreground.png'), size)
    console.log(`android ${folder} foreground ${size}px`)
  }

  await writePng(iosIcon, 1024)
  console.log('ios AppIcon 1024px')

  const playStore = path.join(root, 'design', 'play-store-icon-512.png')
  await writePng(playStore, 512)
  console.log('design/play-store-icon-512.png')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

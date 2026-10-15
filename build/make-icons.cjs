// Renders build/icon.svg to build/icon.png (512) and build/icon.ico (16-256).  Run: node build/make-icons.cjs
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const pngToIco = require('png-to-ico').default || require('png-to-ico')

const dir = __dirname
const svg = fs.readFileSync(path.join(dir, 'icon.svg'))

;(async () => {
  const png = (size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer()
  fs.writeFileSync(path.join(dir, 'icon.png'), await png(512))
  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const ico = await pngToIco(await Promise.all(sizes.map(png)))
  fs.writeFileSync(path.join(dir, 'icon.ico'), ico)
  console.log('icon.png + icon.ico written')
})()

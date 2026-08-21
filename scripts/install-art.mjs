/**
 * Installs the five cut-out creatures into public/art/.
 *
 *   node scripts/install-art.mjs <source-dir>
 *   node scripts/install-art.mjs ~/Downloads
 *
 * WHY THIS EXISTS. The art lives in the Claude Design project as
 * `assets/<name>-cut.png`, and it cannot be pulled with the rest of the design: `DesignSync`
 * truncates a file at 256 KiB and every one of them is larger. So the files are exported by
 * hand — and this script is what makes "exported by hand" a single command rather than five
 * conversions someone has to remember the settings for.
 *
 * WHAT IT DOES, per creature:
 *   1. FINDS it by fuzzy name. Anything containing `dragon` matches `dragon`, so
 *      `dragon-cut.png`, `Dragon (1).png` and `assets_dragon_cut.png` all work. Prefers a
 *      name containing `cut` when both versions are present, because the cut-outs are the
 *      v4 artwork and the plated ones are v3.
 *   2. KNOCKS OUT THE WHITE PLATE if it finds one. Detected by sampling the four corners.
 *      Removal is a flood fill from the border plus a size-gated pass for enclosed holes —
 *      NOT a threshold; see the long note on `knockOutWhite` for why that distinction is the
 *      whole correctness of this script. Already-transparent files are passed through
 *      untouched, so running this on art that is already cut out is a no-op.
 *   3. TRIMS the transparent margin, so the creature fills its box and `background-size:
 *      contain` scales the art rather than the empty space around it.
 *   4. RESIZES to `MAX_PX` on the long edge and compresses. The sources are 2.6-4 MB each,
 *      and this is a mobile-first app on Indonesian mobile data.
 *   5. SQUARES it on a transparent canvas. `CutoutArt` gives each creature a square box
 *      (height tracks width), so a non-square source would float inside it.
 *
 * It never writes a file it could not process, and it prints the before/after size of every
 * one, so a bad export is visible rather than silent.
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import sharp from 'sharp'

/** Matches components/CutoutArt.tsx. Renaming here means renaming there. */
const CREATURES = ['dragon', 'sheep', 'mountain', 'octopus', 'snake']

const OUT_DIR = 'public/art'
/**
 * Long edge of the installed PNG. The widest creature renders at 380 CSS px, so this is
 * comfortably past 2x for it and leaves headroom to scale the composition up again without
 * re-exporting. Each file still lands around 100-200 KB.
 */
const MAX_PX = 1000
/** How close to #fff a pixel has to be before it counts as plate rather than art. */
const WHITE_CUTOFF = 244
/**
 * An enclosed white region at or above this fraction of the frame is plate showing through a
 * hole in the artwork; below it, it is a highlight that belongs to the drawing. Measured, not
 * guessed — see the note on pass 2. The gap either side of it is wide: the largest thing it
 * must PRESERVE is 0.03% (the mountain's snow) and the smallest it must REMOVE is 0.30%
 * (the sheep's curl).
 */
const MIN_HOLE_FRACTION = 0.0015

const srcDir = process.argv[2]
if (!srcDir) {
  console.error('usage: node scripts/install-art.mjs <source-dir>')
  process.exit(2)
}
const dir = resolve(srcDir.replace(/^~/, process.env.HOME ?? '~'))
if (!existsSync(dir) || !statSync(dir).isDirectory()) {
  console.error(`not a directory: ${dir}`)
  process.exit(2)
}

const candidates = readdirSync(dir).filter((f) =>
  ['.png', '.webp', '.jpg', '.jpeg', '.avif'].includes(extname(f).toLowerCase()),
)

/** Prefer a `-cut` export when both the v3 and v4 files are sitting in the same folder. */
function pick(creature) {
  const hits = candidates.filter((f) => basename(f).toLowerCase().includes(creature))
  if (hits.length === 0) return null
  return hits.find((f) => f.toLowerCase().includes('cut')) ?? hits[0]
}

/**
 * True when all four corners are opaque and near-white — i.e. the art is sitting on a plate
 * rather than on transparency. Corners rather than a histogram: the plate is a square behind
 * a centred subject, so the corners are the only places guaranteed to be background.
 */
async function hasWhitePlate(img) {
  const { data, info } = await img.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  const at = (x, y) => {
    const i = (y * width + x) * channels
    return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] }
  }
  return [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)].every(
    (p) => p.a > 250 && p.r >= WHITE_CUTOFF && p.g >= WHITE_CUTOFF && p.b >= WHITE_CUTOFF,
  )
}

/**
 * Removes the plate by FLOOD-FILLING INWARD FROM THE BORDER, not by thresholding every
 * pixel — and the difference is the whole correctness of this script.
 *
 * A global "every near-white pixel becomes transparent" rule destroys this particular set of
 * drawings: the sheep is cream wool with pure-white highlights, and the mountain is white
 * snow inside white clouds. Thresholding punches holes straight through the middle of both.
 * Only white that is CONNECTED TO THE EDGE is plate; white surrounded by art is art.
 *
 * Three passes:
 *   1. A flood fill from every border pixel, walking into any neighbour within
 *      `WHITE_CUTOFF` of white. Those become fully transparent.
 *   2. ENCLOSED HOLES. The border fill alone is not enough: the dragon's tail coils around
 *      a gap, the octopus has plate between its tentacles, the sheep's body curls into an
 *      "S". Those are background too, but they are walled off from the border by the
 *      linework, so pass 1 leaves them a solid white blob — invisible on the light page and
 *      glaring on the black one.
 *
 *      They are told apart from real white ART by SIZE, which measurement showed separates
 *      them cleanly and colour does not. The mountain's snow and clouds shatter into 2,957
 *      components of which the largest is 0.03% of the frame, and the sheep's wool is cream
 *      rather than white; the genuine holes are 0.3%-2.9%. Anything at or above
 *      `MIN_HOLE_FRACTION` is plate, anything below is a highlight and is left alone.
 *   3. A one-pixel feather on every boundary produced by 1 and 2. The source is
 *      anti-aliased, so the ring where ink meets plate is a blend of the two; leaving it
 *      opaque paints a white halo around every creature, far more visible on a black page
 *      than it ever was on the white canvas. Boundary pixels get an alpha proportional to
 *      how far from white they are, which dissolves the halo without eating the linework.
 */
async function knockOutWhite(img) {
  const { data, info } = await img.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  const idx = (x, y) => (y * width + x) * channels
  const isWhitish = (i) =>
    data[i] >= WHITE_CUTOFF && data[i + 1] >= WHITE_CUTOFF && data[i + 2] >= WHITE_CUTOFF

  // ---- pass 1: flood fill from the border -------------------------------
  const outside = new Uint8Array(width * height)
  const stack = []
  const push = (x, y) => {
    const p = y * width + x
    if (outside[p]) return
    if (!isWhitish(idx(x, y))) return
    outside[p] = 1
    stack.push(p)
  }
  for (let x = 0; x < width; x += 1) {
    push(x, 0)
    push(x, height - 1)
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y)
    push(width - 1, y)
  }
  while (stack.length) {
    const p = stack.pop()
    const x = p % width
    const y = (p - x) / width
    if (x > 0) push(x - 1, y)
    if (x < width - 1) push(x + 1, y)
    if (y > 0) push(x, y - 1)
    if (y < height - 1) push(x, y + 1)
  }

  // ---- pass 2: enclosed holes, kept or killed on size -------------------
  const minHole = Math.round(width * height * MIN_HOLE_FRACTION)
  const seen = new Uint8Array(width * height)
  for (let p0 = 0; p0 < outside.length; p0 += 1) {
    if (outside[p0] || seen[p0] || !isWhitish(p0 * channels)) continue
    const region = []
    const queue = [p0]
    seen[p0] = 1
    while (queue.length) {
      const p = queue.pop()
      region.push(p)
      const x = p % width
      const y = (p - x) / width
      const neighbours = [
        x > 0 ? p - 1 : -1,
        x < width - 1 ? p + 1 : -1,
        y > 0 ? p - width : -1,
        y < height - 1 ? p + width : -1,
      ]
      for (const nb of neighbours) {
        if (nb < 0 || seen[nb] || outside[nb] || !isWhitish(nb * channels)) continue
        seen[nb] = 1
        queue.push(nb)
      }
    }
    if (region.length >= minHole) for (const p of region) outside[p] = 1
  }

  // ---- pass 3: feather the boundary, then commit ------------------------
  const alpha = new Uint8Array(width * height).fill(255)
  for (let p = 0; p < outside.length; p += 1) if (outside[p]) alpha[p] = 0

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x
      if (outside[p]) continue
      const touchesPlate =
        (x > 0 && outside[p - 1]) ||
        (x < width - 1 && outside[p + 1]) ||
        (y > 0 && outside[p - width]) ||
        (y < height - 1 && outside[p + width])
      if (!touchesPlate) continue
      const i = idx(x, y)
      const lightness = (data[i] + data[i + 1] + data[i + 2]) / 3
      // Fully white -> gone; at or below the cutoff -> untouched; linear in between.
      if (lightness <= WHITE_CUTOFF) continue
      alpha[p] = Math.max(0, Math.round((255 * (255 - lightness)) / (255 - WHITE_CUTOFF)))
    }
  }

  for (let p = 0; p < alpha.length; p += 1) data[p * channels + 3] = alpha[p]
  return sharp(data, { raw: { width, height, channels } })
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`
let installed = 0
const missing = []

for (const creature of CREATURES) {
  const file = pick(creature)
  if (!file) {
    missing.push(creature)
    continue
  }

  const from = join(dir, file)
  const before = statSync(from).size

  let img = sharp(from)
  const plated = await hasWhitePlate(img)
  if (plated) img = await knockOutWhite(img)

  // trim -> resize -> square, and THAT ORDER MATTERS TWICE.
  //
  // Trimming first is what makes the square tight around the creature rather than around the
  // original canvas, so `background-size: contain` scales the art instead of empty margin.
  //
  // Resizing before the composite is not a preference: sharp's pipeline is
  // input -> resize -> composite, so a `.resize()` chained AFTER `.composite()` shrinks the
  // BASE and then tries to paste a full-size overlay onto it, which fails with "Image to
  // composite must have same dimensions or smaller". The art has to be at its final size
  // before it is centred on the canvas.
  const trimmed = await img.ensureAlpha().trim({ threshold: 1 }).png().toBuffer()
  const scaled = await sharp(trimmed)
    .resize(MAX_PX, MAX_PX, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer()
  const { width, height } = await sharp(scaled).metadata()
  const side = Math.max(width, height)

  const out = join(OUT_DIR, `${creature}.png`)
  await sharp({
    create: {
      width: side,
      height: side,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: scaled, gravity: 'centre' }])
    .png({ compressionLevel: 9, effort: 10, palette: true, quality: 90 })
    .toFile(out)

  const after = statSync(out).size
  console.log(
    `  ${creature.padEnd(9)} ${file.padEnd(28)} ${kb(before).padStart(8)} -> ${kb(after).padStart(7)}` +
      (plated ? '   (white plate removed)' : ''),
  )
  installed += 1
}

console.log(`\n${installed}/${CREATURES.length} installed into ${OUT_DIR}/`)
if (missing.length) {
  console.error(`MISSING: ${missing.join(', ')} — no file in ${dir} matched those names.`)
  process.exit(1)
}

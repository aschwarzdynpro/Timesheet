/**
 * Erzeugt die PNG-Symbole der App aus derselben Geometrie wie `public/favicon.svg`.
 *
 * Warum ein eigenes Skript und keine Bibliothek: die Diagramme in diesem Repo
 * sind aus demselben Grund handgezeichnetes SVG - eine neue Abhaengigkeit
 * braucht Absprache, und fuer vier Flaechen, einen Ring und zwei Zeiger lohnt
 * sie nicht. Gezeichnet wird mit 4x4 Unterabtastung je Pixel, geschrieben als
 * unkomprimiertes RGBA durch `zlib`; beides steckt in Node selbst.
 *
 * Aufruf: `npm run icons`. Die erzeugten Dateien liegen im Repo, damit ein
 * Build sie nicht neu berechnen muss.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

/** Die Zeichenflaeche ist 32 Einheiten breit - wie das Favicon. */
const FELD = 32
const AKZENT = [0x1e, 0x5a, 0x87]
const WEISS = [0xff, 0xff, 0xff]
const ABTASTUNG = 4

/** Abstand eines Punktes zu einem Rechteck mit runden Ecken (negativ = innen). */
function abstandRechteck(x, y, breite, radius) {
  const dx = Math.abs(x - breite / 2) - (breite / 2 - radius)
  const dy = Math.abs(y - breite / 2) - (breite / 2 - radius)
  const ax = Math.max(dx, 0)
  const ay = Math.max(dy, 0)
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(ax, ay) - radius
}

/** Abstand zu einer Strecke - fuer die Zeiger, die runde Enden haben. */
function abstandStrecke(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const laenge = dx * dx + dy * dy
  const t = laenge === 0 ? 0 : Math.min(1, Math.max(0, ((x - x1) * dx + (y - y1) * dy) / laenge))
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
}

/**
 * Welche Farbe liegt an dieser Stelle? `null` heisst durchsichtig.
 *
 * `eckenradius` ist 0 fuer die Symbole, die iOS und Android selbst
 * zuschneiden - ein vorgerundetes Bild bekaeme dort eine zweite Rundung.
 */
function farbeAn(x, y, eckenradius) {
  if (abstandRechteck(x, y, FELD, eckenradius) > 0) return null

  const zumMittelpunkt = Math.hypot(x - 16, y - 16)
  const imRing = Math.abs(zumMittelpunkt - 9.5) <= 1.1
  const imZeiger = abstandStrecke(x, y, 16, 10.5, 16, 16) <= 1.1
    || abstandStrecke(x, y, 16, 16, 20, 18.5) <= 1.1

  return imRing || imZeiger ? WEISS : AKZENT
}

/** Zeichnet das Symbol in `groesse` Pixeln und liefert die RGBA-Bytes. */
function zeichnen(groesse, eckenradius) {
  const bytes = Buffer.alloc(groesse * groesse * 4)
  const proben = ABTASTUNG * ABTASTUNG

  for (let py = 0; py < groesse; py++) {
    for (let px = 0; px < groesse; px++) {
      let summeR = 0
      let summeG = 0
      let summeB = 0
      let deckung = 0

      for (let sy = 0; sy < ABTASTUNG; sy++) {
        for (let sx = 0; sx < ABTASTUNG; sx++) {
          const x = ((px + (sx + 0.5) / ABTASTUNG) / groesse) * FELD
          const y = ((py + (sy + 0.5) / ABTASTUNG) / groesse) * FELD
          const farbe = farbeAn(x, y, eckenradius)
          if (!farbe) continue
          summeR += farbe[0]
          summeG += farbe[1]
          summeB += farbe[2]
          deckung++
        }
      }

      const ziel = (py * groesse + px) * 4
      if (deckung > 0) {
        bytes[ziel] = Math.round(summeR / deckung)
        bytes[ziel + 1] = Math.round(summeG / deckung)
        bytes[ziel + 2] = Math.round(summeB / deckung)
        bytes[ziel + 3] = Math.round((deckung / proben) * 255)
      }
    }
  }

  return bytes
}

const CRC_TABELLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(daten) {
  let c = 0xffffffff
  for (const byte of daten) c = CRC_TABELLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function block(typ, daten) {
  const kopf = Buffer.alloc(4)
  kopf.writeUInt32BE(daten.length)
  const inhalt = Buffer.concat([Buffer.from(typ, 'ascii'), daten])
  const pruefsumme = Buffer.alloc(4)
  pruefsumme.writeUInt32BE(crc32(inhalt))
  return Buffer.concat([kopf, inhalt, pruefsumme])
}

/** PNG, 8 Bit RGBA, ohne Zeilenfilter - die Flaechen komprimieren auch so gut. */
function alsPng(bytes, groesse) {
  const zeilen = Buffer.alloc(groesse * (groesse * 4 + 1))
  for (let y = 0; y < groesse; y++) {
    bytes.copy(zeilen, y * (groesse * 4 + 1) + 1, y * groesse * 4, (y + 1) * groesse * 4)
  }

  const kopf = Buffer.alloc(13)
  kopf.writeUInt32BE(groesse, 0)
  kopf.writeUInt32BE(groesse, 4)
  kopf[8] = 8 // Bittiefe
  kopf[9] = 6 // Farbtyp RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    block('IHDR', kopf),
    block('IDAT', deflateSync(zeilen, { level: 9 })),
    block('IEND', Buffer.alloc(0)),
  ])
}

const SYMBOLE = [
  // Die beiden Pflichtgroessen des Manifests. Sie erscheinen unbeschnitten,
  // deshalb die runde Ecke im Bild.
  { datei: 'icon-192.png', groesse: 192, eckenradius: 6 },
  { datei: 'icon-512.png', groesse: 512, eckenradius: 6 },
  // Android schneidet dieses hier selbst zu - rund, quadratisch, tropfenfoermig,
  // je nach Geraet. Der Ring liegt bei 0,66 der Kantenlaenge und damit in der
  // Sicherheitszone von 80 %.
  { datei: 'icon-maskable-512.png', groesse: 512, eckenradius: 0 },
  // iOS rundet selbst und kennt kein SVG fuer den Startbildschirm.
  { datei: 'apple-touch-icon.png', groesse: 180, eckenradius: 0 },
]

for (const { datei, groesse, eckenradius } of SYMBOLE) {
  const ziel = fileURLToPath(new URL(`../public/${datei}`, import.meta.url))
  writeFileSync(ziel, alsPng(zeichnen(groesse, eckenradius), groesse))
  console.log(`${datei} (${groesse}px)`)
}

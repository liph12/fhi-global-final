"use client"
import { useRouter } from "next/navigation"

import React, {
  useState, useEffect, useRef, useCallback, ChangeEvent,
} from "react"
import { useAuth } from "@/context/auth-context"
import { COUNTRY_CODES } from "@/lib/user-service"
import { PhoneCountrySelect } from "@/components/phone-country-select"
import {
  Phone, Mail, Save, Loader2, CheckCircle2, AlertCircle,
  RefreshCcw, Info, CreditCard, Download, Palette,
} from "lucide-react"

// ── Constants ────────────────────────────────────────────────────────────────
const FRONT_URL = "https://hefwmaoborpfuyhbguzv.supabase.co/storage/v1/object/public/fhi_global/business-card-front.png"
const BACK_URL  = "https://hefwmaoborpfuyhbguzv.supabase.co/storage/v1/object/public/fhi_global/business-card-back.png"
const LOGO_WHITE = "/FHI_Branding_White.png"
const LOGO_DARK  = "/FHI_Branding.png"
const EXPORT_W  = 2100
const EXPORT_H  = 1200
const API_BASE  = process.env.NEXT_PUBLIC_API_BASE_URL ?? ""

const TITLE_TEXT = "INTERNATIONAL PROPERTY ENDORSER"
const SITE_TEXT  = "www.fhiglobal.ae"

const NAVY       = "#001f3f"
const NAVY_DEEP  = "#001428"
const GOLD       = "#ca9104"
const GOLD_LIGHT = "#e9b949"

const FONT_STACK = "'Outfit', Arial, sans-serif"

// ── Designs ──────────────────────────────────────────────────────────────────
type DesignId = "classic" | "executive" | "platinum"

const DESIGNS: { id: DesignId; name: string; tagline: string }[] = [
  { id: "classic",   name: "Classic Navy",   tagline: "The signature FHI look" },
  { id: "executive", name: "Executive Gold", tagline: "Dark, bold & luxurious" },
  { id: "platinum",  name: "Platinum Light", tagline: "Clean, bright & modern" },
]

const DESIGN_STORAGE_KEY = "fhi-bc-design"

function isDesignId(v: string | null): v is DesignId {
  return v === "classic" || v === "executive" || v === "platinum"
}

// ── Phone helpers ────────────────────────────────────────────────────────────
/** Strip any leading 0 from the local number (digits only). */
function stripLocal(raw: string): string {
  let d = raw.replace(/\D/g, "")
  if (d.startsWith("0")) d = d.slice(1)
  return d
}

/** Resolve the dial code string from a country-code value (e.g. "+1-CA" → "+1"). */
function dialFromValue(ccValue: string): string {
  const entry = COUNTRY_CODES.find((c) => c.value === ccValue)
  if (entry) return entry.dial
  // fallback: strip any suffix after a dash (e.g. "+1-CA" → "+1")
  return ccValue.includes("-") ? ccValue.split("-")[0] : ccValue
}

function formatDisplay(dial: string, local: string): string {
  if (!local) return ""
  return `${dial} ${local}`
}

function isPhoneOk(local: string) { return local.length >= 4 }
function toE164(dial: string, local: string) { return `${dial}${local}` }

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return "FG"
  const first = parts[0][0] ?? ""
  const last  = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : ""
  return (first + last).toUpperCase()
}

// ── Image loader (cached) ────────────────────────────────────────────────────
const imgCache = new Map<string, Promise<HTMLImageElement>>()

function loadImg(src: string): Promise<HTMLImageElement> {
  const cached = imgCache.get(src)
  if (cached) return cached
  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image()
    img.crossOrigin = "anonymous"
    img.referrerPolicy = "no-referrer"
    img.onload  = () => resolve(img)
    img.onerror = () => { imgCache.delete(src); reject(new Error(`Failed to load ${src}`)) }
    img.src     = src
  })
  imgCache.set(src, p)
  return p
}

// ── Canvas icon drawing ───────────────────────────────────────────────────────
function drawPhoneIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color = GOLD) {
  const s = size
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth   = s * 0.12
  ctx.lineCap     = "round"
  ctx.lineJoin    = "round"
  ctx.beginPath()
  // simplified phone handset
  ctx.roundRect(cx - s * 0.3, cy - s * 0.5, s * 0.6, s, s * 0.15)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx, cy - s * 0.25, s * 0.1, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.restore()
}

function drawMailIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color = GOLD) {
  const s = size
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth   = s * 0.1
  ctx.lineCap     = "round"
  ctx.lineJoin    = "round"
  const x = cx - s * 0.5, y = cy - s * 0.35, w = s, h = s * 0.7
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, s * 0.08)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(cx, cy + s * 0.05)
  ctx.lineTo(x + w, y)
  ctx.stroke()
  ctx.restore()
}

// ── Shared drawing helpers ────────────────────────────────────────────────────
function drawAvatarCircle(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  initials: string,
  cx: number, cy: number, r: number,
  opts: { ring: string; ringW: number; bg: string; fg: string; doubleRing?: boolean },
) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = opts.bg
  ctx.fill()

  if (img) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.clip()
    // cover-fit into the circle
    const scale = Math.max((r * 2) / img.width, (r * 2) / img.height)
    const dw = img.width * scale, dh = img.height * scale
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh)
    ctx.restore()
  } else {
    ctx.fillStyle = opts.fg
    ctx.font = `700 ${Math.round(r * 0.72)}px ${FONT_STACK}`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(initials, cx, cy + r * 0.04)
  }

  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.strokeStyle = opts.ring
  ctx.lineWidth   = opts.ringW
  ctx.stroke()

  if (opts.doubleRing) {
    ctx.beginPath()
    ctx.arc(cx, cy, r + opts.ringW * 2.4, 0, Math.PI * 2)
    ctx.strokeStyle = opts.ring
    ctx.lineWidth   = Math.max(1, opts.ringW * 0.4)
    ctx.stroke()
  }
  ctx.restore()
}

function drawLogoCentered(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, topY: number, targetH: number) {
  const ratio = img.width / img.height
  const w = targetH * ratio
  ctx.drawImage(img, cx - w / 2, topY, w, targetH)
}

function drawLogoAt(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, targetH: number) {
  const ratio = img.width / img.height
  ctx.drawImage(img, x, y, targetH * ratio, targetH)
}

/** line — diamond — line ornament, centered on (cx, cy) */
function drawOrnament(ctx: CanvasRenderingContext2D, cx: number, cy: number, totalW: number, color: string) {
  const dia = totalW * 0.045
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle   = color
  ctx.lineWidth   = Math.max(1, dia * 0.18)
  ctx.beginPath()
  ctx.moveTo(cx - totalW / 2, cy)
  ctx.lineTo(cx - dia * 1.6, cy)
  ctx.moveTo(cx + dia * 1.6, cy)
  ctx.lineTo(cx + totalW / 2, cy)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx, cy - dia)
  ctx.lineTo(cx + dia, cy)
  ctx.lineTo(cx, cy + dia)
  ctx.lineTo(cx - dia, cy)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

type Ctx2D = CanvasRenderingContext2D & { letterSpacing?: string }

function setLetterSpacing(ctx: Ctx2D, px: number) {
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${px}px`
}

interface CardData {
  name: string
  phoneDial: string
  phoneLocal: string
  email: string
  avatarUrl: string | null
}

interface BlockOpts {
  x: number
  maxW: number
  nameY: number
  nameColor: string
  titleColor: string
  textColor: string
  dividerColor: string
  iconColor: string
}

/** Name + title + divider + contact rows — shared by every design. */
function drawContactBlock(ctx: Ctx2D, data: CardData, w: number, h: number, o: BlockOpts) {
  ctx.textAlign    = "left"
  ctx.textBaseline = "alphabetic"

  // Name — auto-shrink until it fits
  const nameTxt = (data.name || "Your Name").toUpperCase()
  let fontSize = Math.round(h * 0.095)
  ctx.font = `700 ${fontSize}px ${FONT_STACK}`
  while (ctx.measureText(nameTxt).width > o.maxW && fontSize > 20) {
    fontSize -= 2
    ctx.font = `700 ${fontSize}px ${FONT_STACK}`
  }
  ctx.fillStyle = o.nameColor
  ctx.fillText(nameTxt, o.x, o.nameY)

  // Title — letter-spaced, auto-shrink
  let subSize = Math.round(h * 0.040)
  ctx.font = `600 ${subSize}px ${FONT_STACK}`
  setLetterSpacing(ctx, subSize * 0.14)
  while (ctx.measureText(TITLE_TEXT).width > o.maxW && subSize > 10) {
    subSize -= 1
    ctx.font = `600 ${subSize}px ${FONT_STACK}`
    setLetterSpacing(ctx, subSize * 0.14)
  }
  ctx.fillStyle = o.titleColor
  const titleY = o.nameY + h * 0.095
  ctx.fillText(TITLE_TEXT, o.x, titleY)
  setLetterSpacing(ctx, 0)

  // Divider
  const divY = titleY + h * 0.055
  ctx.strokeStyle = o.dividerColor
  ctx.lineWidth   = Math.max(1, h * 0.004)
  ctx.beginPath()
  ctx.moveTo(o.x, divY)
  ctx.lineTo(o.x + o.maxW, divY)
  ctx.stroke()

  // Contact rows
  const rowSize   = Math.round(h * 0.046)
  const iconSize  = rowSize * 1.1
  const row1Y     = divY + h * 0.105
  const row2Y     = row1Y + h * 0.088
  const txtStartX = o.x + iconSize * 1.4

  ctx.font = `400 ${rowSize}px ${FONT_STACK}`
  ctx.fillStyle    = o.textColor
  ctx.textBaseline = "middle"

  drawPhoneIcon(ctx, o.x + iconSize * 0.5, row1Y, iconSize, o.iconColor)
  ctx.fillText(
    data.phoneLocal ? formatDisplay(data.phoneDial, data.phoneLocal) : "+971 5x xxx xxxx",
    txtStartX, row1Y,
  )

  drawMailIcon(ctx, o.x + iconSize * 0.5, row2Y, iconSize, o.iconColor)
  ctx.font = `400 ${rowSize}px ${FONT_STACK}`
  ctx.fillText(data.email || "your@email.com", txtStartX, row2Y)
}

/**
 * Remote avatar hosts (S3, Google) rarely send CORS headers, which taints the
 * canvas. Routing through Next's same-origin image optimizer avoids CORS
 * entirely — the host just needs to be in next.config images.remotePatterns.
 * w/q must be values allowed by the images config (imageSizes / qualities).
 *
 * The fetch pins Accept to JPEG: letting the browser negotiate can select
 * WebP, whose encoder 500s in some sharp/Windows setups, while JPEG output
 * is a plain resize that always works. The bytes go to <img> via a
 * same-origin object URL, so the canvas is never tainted.
 */
function optimizerUrl(src: string): string {
  return `/_next/image?url=${encodeURIComponent(src)}&w=800&q=80`
}

async function loadViaOptimizer(src: string): Promise<HTMLImageElement> {
  const res = await fetch(optimizerUrl(src), { headers: { Accept: "image/jpeg" } })
  if (!res.ok) throw new Error(`optimizer ${res.status}`)
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  try {
    return await loadImg(objectUrl)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

const avatarCache = new Map<string, Promise<HTMLImageElement | null>>()

function loadAvatar(data: CardData): Promise<HTMLImageElement | null> {
  const src = data.avatarUrl
  if (!src) return Promise.resolve(null)
  const cached = avatarCache.get(src)
  if (cached) return cached
  const p = (async () => {
    const isRemote =
      /^https?:\/\//i.test(src) &&
      (typeof window === "undefined" || !src.startsWith(window.location.origin))
    if (isRemote) {
      try { return await loadViaOptimizer(src) } catch { /* fall back to direct */ }
    }
    try { return await loadImg(src) } catch { return null }
  })()
  avatarCache.set(src, p)
  // drop failed loads from the cache so a later render can retry
  p.then((img) => { if (!img) avatarCache.delete(src) })
  return p
}

// ── Design: Classic Navy (original artwork + avatar) ─────────────────────────
async function drawClassicFront(ctx: Ctx2D, data: CardData, w: number, h: number) {
  try {
    const img = await loadImg(FRONT_URL)
    ctx.drawImage(img, 0, 0, w, h)
  } catch {
    const g = ctx.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, NAVY_DEEP)
    g.addColorStop(1, NAVY)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }

  const avatarImg = await loadAvatar(data)
  drawAvatarCircle(ctx, avatarImg, initialsOf(data.name), w * 0.185, h * 0.615, h * 0.20, {
    ring: GOLD_LIGHT, ringW: h * 0.010, bg: "#0a2a4d", fg: GOLD_LIGHT,
  })

  drawContactBlock(ctx, data, w, h, {
    x: w * 0.40, maxW: w * 0.54, nameY: h * 0.40,
    nameColor: "#ffffff", titleColor: GOLD_LIGHT, textColor: "#ffffff",
    dividerColor: "rgba(255,255,255,0.25)", iconColor: GOLD,
  })
}

async function drawClassicBack(ctx: Ctx2D, w: number, h: number) {
  try {
    const img = await loadImg(BACK_URL)
    ctx.drawImage(img, 0, 0, w, h)
  } catch {
    ctx.fillStyle = NAVY
    ctx.fillRect(0, 0, w, h)
  }
}

// ── Design: Executive Gold (fully drawn, dark luxury) ────────────────────────
function paintExecutiveBg(ctx: Ctx2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, w, h)
  g.addColorStop(0,    "#00152b")
  g.addColorStop(0.55, NAVY)
  g.addColorStop(1,    "#003158")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  // soft gold glow, upper-left
  const rg = ctx.createRadialGradient(w * 0.17, h * 0.40, 0, w * 0.17, h * 0.40, h * 0.65)
  rg.addColorStop(0, "rgba(214,179,87,0.12)")
  rg.addColorStop(1, "rgba(214,179,87,0)")
  ctx.fillStyle = rg
  ctx.fillRect(0, 0, w, h)

  // diagonal gold accent lines, top-right
  ctx.save()
  ctx.strokeStyle = "rgba(214,179,87,0.30)"
  ctx.lineWidth = Math.max(1, h * 0.004)
  for (let i = 0; i < 3; i++) {
    const off = i * w * 0.035
    ctx.beginPath()
    ctx.moveTo(w * 0.76 + off, -h * 0.05)
    ctx.lineTo(w * 1.04 + off, h * 0.26)
    ctx.stroke()
  }
  ctx.restore()
}

async function drawExecutiveFront(ctx: Ctx2D, data: CardData, w: number, h: number) {
  paintExecutiveBg(ctx, w, h)

  // vertical gold divider between photo column and text column
  const divGrad = ctx.createLinearGradient(0, h * 0.16, 0, h * 0.84)
  divGrad.addColorStop(0, "rgba(214,179,87,0)")
  divGrad.addColorStop(0.5, "rgba(214,179,87,0.55)")
  divGrad.addColorStop(1, "rgba(214,179,87,0)")
  ctx.strokeStyle = divGrad
  ctx.lineWidth = Math.max(1, h * 0.004)
  ctx.beginPath()
  ctx.moveTo(w * 0.335, h * 0.16)
  ctx.lineTo(w * 0.335, h * 0.84)
  ctx.stroke()

  const avatarImg = await loadAvatar(data)
  drawAvatarCircle(ctx, avatarImg, initialsOf(data.name), w * 0.17, h * 0.40, h * 0.185, {
    ring: GOLD_LIGHT, ringW: h * 0.010, bg: "#0a2a4d", fg: GOLD_LIGHT, doubleRing: true,
  })

  try {
    const logo = await loadImg(LOGO_WHITE)
    drawLogoCentered(ctx, logo, w * 0.17, h * 0.68, h * 0.13)
  } catch { /* logo optional */ }

  drawContactBlock(ctx, data, w, h, {
    x: w * 0.40, maxW: w * 0.53, nameY: h * 0.37,
    nameColor: "#ffffff", titleColor: GOLD_LIGHT, textColor: "#dbe4f0",
    dividerColor: "rgba(214,179,87,0.35)", iconColor: GOLD_LIGHT,
  })

  // corner tick, bottom-right
  ctx.strokeStyle = "rgba(214,179,87,0.6)"
  ctx.lineWidth = Math.max(1, h * 0.006)
  ctx.beginPath()
  ctx.moveTo(w * 0.955, h * 0.86)
  ctx.lineTo(w * 0.955, h * 0.92)
  ctx.lineTo(w * 0.915, h * 0.92)
  ctx.stroke()
}

async function drawExecutiveBack(ctx: Ctx2D, w: number, h: number) {
  paintExecutiveBg(ctx, w, h)

  // inset gold frame
  ctx.strokeStyle = "rgba(214,179,87,0.55)"
  ctx.lineWidth = Math.max(1, h * 0.006)
  ctx.strokeRect(w * 0.045, h * 0.078, w * 0.91, h * 0.844)

  try {
    const logo = await loadImg(LOGO_WHITE)
    drawLogoCentered(ctx, logo, w / 2, h * 0.30, h * 0.22)
  } catch { /* logo optional */ }

  drawOrnament(ctx, w / 2, h * 0.62, w * 0.22, GOLD_LIGHT)

  ctx.font = `500 ${Math.round(h * 0.045)}px ${FONT_STACK}`
  setLetterSpacing(ctx, h * 0.006)
  ctx.fillStyle = "#dbe4f0"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(SITE_TEXT, w / 2, h * 0.71)
  setLetterSpacing(ctx, 0)
}

// ── Design: Platinum Light (fully drawn, clean & bright) ─────────────────────
async function drawPlatinumFront(ctx: Ctx2D, data: CardData, w: number, h: number) {
  // background
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, "#ffffff")
  g.addColorStop(1, "#f6f7f9")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  // navy diagonal panel, right side
  ctx.beginPath()
  ctx.moveTo(w * 0.70, 0)
  ctx.lineTo(w, 0)
  ctx.lineTo(w, h)
  ctx.lineTo(w * 0.79, h)
  ctx.closePath()
  const pg = ctx.createLinearGradient(w * 0.70, 0, w, h)
  pg.addColorStop(0, NAVY)
  pg.addColorStop(1, NAVY_DEEP)
  ctx.fillStyle = pg
  ctx.fill()

  // gold edge along the diagonal
  ctx.beginPath()
  ctx.moveTo(w * 0.688, 0)
  ctx.lineTo(w * 0.70, 0)
  ctx.lineTo(w * 0.79, h)
  ctx.lineTo(w * 0.778, h)
  ctx.closePath()
  ctx.fillStyle = GOLD
  ctx.fill()

  const avatarImg = await loadAvatar(data)
  drawAvatarCircle(ctx, avatarImg, initialsOf(data.name), w * 0.865, h * 0.48, h * 0.19, {
    ring: GOLD_LIGHT, ringW: h * 0.011, bg: "#0a2a4d", fg: GOLD_LIGHT,
  })

  try {
    const logo = await loadImg(LOGO_DARK)
    drawLogoAt(ctx, logo, w * 0.06, h * 0.09, h * 0.15)
  } catch { /* logo optional */ }

  drawContactBlock(ctx, data, w, h, {
    x: w * 0.06, maxW: w * 0.56, nameY: h * 0.47,
    nameColor: NAVY, titleColor: "#a87b06", textColor: "#374151",
    dividerColor: "#e2e5ea", iconColor: GOLD,
  })

  // gold baseline bar, bottom-left
  ctx.fillStyle = GOLD
  ctx.fillRect(w * 0.06, h * 0.90, w * 0.14, h * 0.012)
}

async function drawPlatinumBack(ctx: Ctx2D, w: number, h: number) {
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, w, h)

  // corner accents echoing the front
  ctx.fillStyle = NAVY
  ctx.beginPath()
  ctx.moveTo(0, 0); ctx.lineTo(w * 0.16, 0); ctx.lineTo(0, h * 0.28); ctx.closePath()
  ctx.fill()
  ctx.fillStyle = GOLD
  ctx.beginPath()
  ctx.moveTo(w * 0.16, 0); ctx.lineTo(w * 0.185, 0); ctx.lineTo(0, h * 0.325); ctx.lineTo(0, h * 0.28); ctx.closePath()
  ctx.fill()

  ctx.fillStyle = NAVY
  ctx.beginPath()
  ctx.moveTo(w, h); ctx.lineTo(w * 0.84, h); ctx.lineTo(w, h * 0.72); ctx.closePath()
  ctx.fill()
  ctx.fillStyle = GOLD
  ctx.beginPath()
  ctx.moveTo(w * 0.84, h); ctx.lineTo(w * 0.815, h); ctx.lineTo(w, h * 0.675); ctx.lineTo(w, h * 0.72); ctx.closePath()
  ctx.fill()

  try {
    const logo = await loadImg(LOGO_DARK)
    drawLogoCentered(ctx, logo, w / 2, h * 0.30, h * 0.22)
  } catch { /* logo optional */ }

  drawOrnament(ctx, w / 2, h * 0.62, w * 0.22, GOLD)

  ctx.font = `500 ${Math.round(h * 0.045)}px ${FONT_STACK}`
  setLetterSpacing(ctx, h * 0.006)
  ctx.fillStyle = NAVY
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(SITE_TEXT, w / 2, h * 0.71)
  setLetterSpacing(ctx, 0)
}

// ── Canvas renderer ───────────────────────────────────────────────────────────
async function renderCard(
  side: "front" | "back",
  design: DesignId,
  data: CardData,
  width: number,
  height: number,
): Promise<string> {
  const canvas = document.createElement("canvas")
  canvas.width  = width
  canvas.height = height
  const ctx = canvas.getContext("2d")! as Ctx2D

  try { await document.fonts.ready } catch { /* draw with fallback font */ }

  if (design === "classic") {
    if (side === "front") await drawClassicFront(ctx, data, width, height)
    else                  await drawClassicBack(ctx, width, height)
  } else if (design === "executive") {
    if (side === "front") await drawExecutiveFront(ctx, data, width, height)
    else                  await drawExecutiveBack(ctx, width, height)
  } else {
    if (side === "front") await drawPlatinumFront(ctx, data, width, height)
    else                  await drawPlatinumBack(ctx, width, height)
  }

  return canvas.toDataURL("image/png")
}

// ── Preview at display size ───────────────────────────────────────────────────
// Display canvas is 700×400 rendered at devicePixelRatio for crispness
const DISP_W = 700
const DISP_H = 400
const THUMB_W = 315
const THUMB_H = 180

// ── Main component ────────────────────────────────────────────────────────────
export default function BusinessCardPage() {
  const router = useRouter()
  const { user, profile } = useAuth()

  const fullName  = profile?.fullname ?? user?.email?.split("@")[0] ?? ""
  const avatarUrl = profile?.profile_url ?? null

  // phone/email state
  const [countryCode, setCountryCode] = useState("+971") // country-code value (e.g. "+63")
  const [localNumber, setLocalNumber] = useState("")     // local number digits
  const [email,       setEmail]       = useState("")

  // card side + design (design choice restored from this device's last pick)
  const [flipped, setFlipped] = useState(false)
  const [design,  setDesign]  = useState<DesignId>(() => {
    if (typeof window === "undefined") return "classic"
    const saved = localStorage.getItem(DESIGN_STORAGE_KEY)
    return isDesignId(saved) ? saved : "classic"
  })

  // canvas preview data URLs
  const [frontDataUrl, setFrontDataUrl] = useState("")
  const [backDataUrl,  setBackDataUrl]  = useState("")
  const [thumbs, setThumbs] = useState<Record<DesignId, string>>({ classic: "", executive: "", platinum: "" })
  const [previewLoading, setPreviewLoading] = useState(false)

  // save state
  type SaveState = "idle" | "saving" | "success" | "error"
  const [saveState, setSaveState]   = useState<SaveState>("idle")
  const [saveError, setSaveError]   = useState("")

  const chooseDesign = (id: DesignId) => {
    setDesign(id)
    try { localStorage.setItem(DESIGN_STORAGE_KEY, id) } catch { /* private mode */ }
  }

  // pre-fill from profile on mount
  useEffect(() => {
    if (profile?.metadata) {
      const meta = profile.metadata as Record<string, unknown>
      // country code stored as phone_country_code in the metadata JSON column
      const cc = typeof meta.phone_country_code === "string" ? meta.phone_country_code : "+971"
      setCountryCode(cc)
      // local number stored as phone_number in the metadata JSON column
      const raw = typeof meta.phone_number === "string" ? meta.phone_number : ""
      if (raw) {
        setLocalNumber(stripLocal(raw))
      }
    }
    if (user?.email) setEmail(user.email.toLowerCase())
  }, [profile, user])

  // ── phone input handler ──────────────────────────────────────────────────
  const handlePhoneChange = (e: ChangeEvent<HTMLInputElement>) => {
    setLocalNumber(e.target.value.replace(/\D/g, ""))
  }

  // resolved dial code for display (e.g. "+63")
  const phoneDial = dialFromValue(countryCode)

  // ── regenerate canvas preview ────────────────────────────────────────────
  const regeneratePreview = useCallback(async () => {
    setPreviewLoading(true)
    const data: CardData = { name: fullName, phoneDial, phoneLocal: localNumber, email, avatarUrl }
    const [f, b, ...t] = await Promise.all([
      renderCard("front", design, data, DISP_W, DISP_H),
      renderCard("back",  design, data, DISP_W, DISP_H),
      ...DESIGNS.map((d) => renderCard("front", d.id, data, THUMB_W, THUMB_H)),
    ])
    setFrontDataUrl(f)
    setBackDataUrl(b)
    setThumbs({ classic: t[0], executive: t[1], platinum: t[2] })
    setPreviewLoading(false)
  }, [fullName, phoneDial, localNumber, email, avatarUrl, design])

  // regenerate whenever inputs change (debounced 400ms)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(regeneratePreview, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [regeneratePreview])

  // ── download ─────────────────────────────────────────────────────────────
  const download = async (side: "front" | "back") => {
    const safeName = fullName.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "")
    const filename  = `business-card-${design}-${side}-${safeName}-${EXPORT_W}x${EXPORT_H}.png`
    const url = await renderCard(side, design, { name: fullName, phoneDial, phoneLocal: localNumber, email, avatarUrl }, EXPORT_W, EXPORT_H)
    const a = document.createElement("a")
    a.href     = url
    a.download = filename
    a.click()
  }

  // ── save contact info ─────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!user?.id) return
    setSaveState("saving")
    setSaveError("")
    try {
      const res = await fetch(`${API_BASE}/api/me/contact`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: toE164(phoneDial, localNumber),
          phone_country_code: countryCode,
          phone_number: localNumber,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Error ${res.status}`)
      }
      setSaveState("success")
      router.refresh()
      setTimeout(() => setSaveState("idle"), 3000)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed")
      setSaveState("error")
    }
  }

  const phoneOk   = isPhoneOk(localNumber)
  const canSave   = phoneOk && saveState !== "saving"
  const inputBase = "w-full px-4 py-3 rounded-xl border text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-4 transition-all duration-200"
  const inputIdle = "border-[#e5e7eb] bg-[#f9fafb] focus:border-[#001f3f] focus:bg-white focus:ring-[#001f3f]/6"
  const inputErr  = "border-rose-300 bg-rose-50 focus:border-rose-500 focus:ring-rose-500/10"
  const inputOk   = "border-emerald-300 bg-white focus:border-emerald-500 focus:ring-emerald-500/10"

  function phoneState()  { if (!localNumber) return "idle"; return phoneOk ? "ok" : "err" }
  function inputCls(st: "idle"|"ok"|"err") {
    if (st === "ok")  return `${inputBase} ${inputOk}`
    if (st === "err") return `${inputBase} ${inputErr}`
    return `${inputBase} ${inputIdle}`
  }

  return (
    <>
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="mb-7">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#001f3f] flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-[#d6b357]" />
          </div>
          <div>
            <h1 className="font-['Outfit'] text-xl font-bold text-[#0d1117]">My Business Card</h1>
            <p className="text-sm text-[#9ca3af]">Pick a design, edit your contact details and download your personalised card</p>
          </div>
        </div>
      </div>

      {/* ── Two-column layout ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* ══ LEFT – Contact form ══════════════════════════════════════════ */}
        <div className="space-y-5">

          {/* Contact details card */}
          <div className="bg-white rounded-2xl border border-[#e4e7ec] shadow-[0_2px_16px_-4px_rgba(0,31,63,0.08)] overflow-hidden">
            <div className="px-6 pt-6 pb-2 border-b border-[#f0f2f5]">
              <h2 className="font-['Outfit'] text-base font-bold text-[#0d1117]">Contact Information</h2>
              <p className="text-xs text-[#9ca3af] mt-0.5">Your name is synced from your profile. Phone and email can be updated.</p>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Full name — read-only */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-[#374151]">Full Name</label>
                <div className="relative">
                  <input
                    readOnly
                    value={fullName}
                    className={`${inputBase} border-[#e5e7eb] bg-[#f4f6f9] text-[#6b7280] cursor-default`}
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wider text-[#c4c9d4] bg-[#f0f2f5] rounded px-1.5 py-0.5">
                    Read-only
                  </span>
                </div>
                <p className="text-[11px] text-[#9ca3af]">Change your name in Profile settings.</p>
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <label htmlFor="bc-phone" className="text-xs font-semibold uppercase tracking-wider text-[#374151]">
                  Phone Number
                </label>
                <div className="flex gap-2">
                  <PhoneCountrySelect
                    value={countryCode}
                    onChange={setCountryCode}
                    ariaLabel="Phone country calling code"
                    className="px-3 py-3"
                    style={{ minWidth: 90 }}
                  />
                  <div className="relative flex-1">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af] pointer-events-none" />
                    <input
                      id="bc-phone"
                      type="tel"
                      inputMode="numeric"
                      value={localNumber}
                      onChange={handlePhoneChange}
                      placeholder="5xxxxxxxx"
                      className={`${inputCls(phoneState())} pl-10`}
                    />
                    {phoneState() === "ok"  && <CheckCircle2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500 pointer-events-none" />}
                    {phoneState() === "err" && <AlertCircle  className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-rose-400   pointer-events-none" />}
                  </div>
                </div>
                {phoneState() === "err" && (
                  <p className="text-xs text-rose-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Enter at least 4 digits for the local number
                  </p>
                )}
              </div>

              {/* Email — read-only */}
              <div className="space-y-1.5">
                <label htmlFor="bc-email" className="text-xs font-semibold uppercase tracking-wider text-[#374151]">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af] pointer-events-none" />
                  <input
                    id="bc-email"
                    type="email"
                    readOnly
                    value={email}
                    className={`${inputBase} border-[#e5e7eb] bg-[#f4f6f9] text-[#6b7280] cursor-default pl-10`}
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wider text-[#c4c9d4] bg-[#f0f2f5] rounded px-1.5 py-0.5">
                    Read-only
                  </span>
                </div>
                <p className="text-[11px] text-[#9ca3af]">Contact support to change your email address.</p>
              </div>
            </div>

            {/* Save footer */}
            <div className="px-6 py-4 border-t border-[#f0f2f5] flex items-center justify-between gap-4">
              {saveState === "success" && (
                <span className="text-sm text-emerald-600 font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Saved successfully
                </span>
              )}
              {saveState === "error" && (
                <span className="text-sm text-rose-600 flex items-center gap-1.5 truncate">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {saveError}
                </span>
              )}
              {(saveState === "idle" || saveState === "saving") && <span />}

              <button
                onClick={handleSave}
                disabled={!canSave}
                className="ml-auto flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#001f3f] hover:bg-[#002952] text-white text-sm font-bold shadow-[0_4px_12px_-2px_rgba(0,31,63,0.35)] hover:shadow-[0_6px_18px_-2px_rgba(0,31,63,0.45)] hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none transition-all duration-200"
              >
                {saveState === "saving"
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                  : <><Save className="w-4 h-4" /> Save Changes</>
                }
              </button>
            </div>
          </div>

          {/* Tips panel */}
          <div className="bg-[#fffdf3] border border-[#f0e8c8] rounded-2xl px-5 py-4 flex gap-3">
            <Info className="w-4 h-4 text-[#d6b357] shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-[#374151]">Tips</p>
              <ul className="text-xs text-[#6b7280] space-y-1 list-disc list-inside">
                <li>Choose from 3 card designs — your pick is remembered on this device.</li>
                <li>Your profile photo appears on the card; update it in Profile settings.</li>
                <li>Click the card on the right to flip it and preview the back.</li>
                <li>The preview updates live as you type — no need to save first.</li>
                <li>Downloads are exported at 2100 × 1200 px (print quality).</li>
              </ul>
            </div>
          </div>
        </div>

        {/* ══ RIGHT – Design picker + card preview ═════════════════════════ */}
        <div className="space-y-5">

          {/* Design picker */}
          <div className="bg-white rounded-2xl border border-[#e4e7ec] shadow-[0_2px_16px_-4px_rgba(0,31,63,0.08)] px-6 py-5">
            <div className="flex items-center gap-2 mb-4">
              <Palette className="w-4 h-4 text-[#d6b357]" />
              <div>
                <h2 className="font-['Outfit'] text-base font-bold text-[#0d1117]">Choose Your Design</h2>
                <p className="text-xs text-[#9ca3af]">The preview and downloads use the design you select</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {DESIGNS.map((d) => {
                const selected = design === d.id
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => chooseDesign(d.id)}
                    aria-pressed={selected}
                    className={`relative rounded-xl p-1.5 text-left transition-all duration-200 ${
                      selected
                        ? "border-2 border-[#d6b357] bg-[#fffdf3] shadow-[0_4px_16px_-4px_rgba(214,179,87,0.5)]"
                        : "border border-[#e4e7ec] bg-white hover:border-[#c4cbd8] hover:shadow-sm"
                    }`}
                  >
                    {selected && (
                      <span className="absolute -top-2 -right-2 z-10 bg-[#d6b357] rounded-full p-0.5 shadow">
                        <CheckCircle2 className="w-4 h-4 text-white" />
                      </span>
                    )}
                    <div className="aspect-[1.75/1] rounded-lg overflow-hidden bg-[#001f3f] flex items-center justify-center">
                      {thumbs[d.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumbs[d.id]} alt={`${d.name} design preview`} className="w-full h-full object-cover" />
                      ) : (
                        <Loader2 className="w-4 h-4 text-[#d6b357] animate-spin" />
                      )}
                    </div>
                    <div className="pt-1.5 px-1 pb-0.5">
                      <p className={`text-xs font-bold ${selected ? "text-[#8a6a03]" : "text-[#374151]"}`}>{d.name}</p>
                      <p className="text-[10px] text-[#9ca3af]">{d.tagline}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Flip container */}
          <div className="bg-white rounded-2xl border border-[#e4e7ec] shadow-[0_2px_16px_-4px_rgba(0,31,63,0.08)] overflow-hidden">
            <div className="px-6 pt-5 pb-4 border-b border-[#f0f2f5] flex items-center justify-between">
              <div>
                <h2 className="font-['Outfit'] text-base font-bold text-[#0d1117]">
                  Card Preview — {flipped ? "Back" : "Front"}
                </h2>
                <p className="text-xs text-[#9ca3af] mt-0.5">
                  {DESIGNS.find((d) => d.id === design)?.name} · Click the card or press Flip to see the other side
                </p>
              </div>
              <button
                onClick={() => setFlipped(f => !f)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#e4e7ec] bg-[#f9fafb] hover:bg-[#f0f4f8] text-sm font-semibold text-[#374151] hover:text-[#001f3f] transition-all"
              >
                <RefreshCcw className="w-4 h-4" /> Flip
              </button>
            </div>

            {/* Perspective scene */}
            <div className="p-5">
              <div
                className="bc-scene w-full cursor-pointer select-none"
                style={{ aspectRatio: "1.75 / 1" }}
                onClick={() => setFlipped(f => !f)}
                role="button"
                aria-label={`Business card, showing ${flipped ? "back" : "front"}. Click to flip.`}
              >
                <div className={`bc-card w-full h-full ${flipped ? "bc-card--flipped" : ""}`}>
                  {/* Front face */}
                  <div className="bc-face bc-face--front w-full h-full rounded-xl overflow-hidden shadow-[0_8px_32px_-4px_rgba(0,31,63,0.20)]">
                    {previewLoading || !frontDataUrl ? (
                      <div className="w-full h-full bg-[#001f3f] rounded-xl flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-[#d6b357] animate-spin" />
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={frontDataUrl} alt="Business card front" className="w-full h-full object-cover rounded-xl" />
                    )}
                  </div>
                  {/* Back face */}
                  <div className="bc-face bc-face--back w-full h-full rounded-xl overflow-hidden shadow-[0_8px_32px_-4px_rgba(0,31,63,0.20)]">
                    {previewLoading || !backDataUrl ? (
                      <div className="w-full h-full bg-[#001428] rounded-xl flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-[#d6b357] animate-spin" />
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={backDataUrl} alt="Business card back" className="w-full h-full object-cover rounded-xl" />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Download buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => download("front")}
              disabled={!frontDataUrl}
              className="group flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl border-2 border-[#001f3f] text-[#001f3f] text-sm font-bold hover:bg-[#001f3f] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
            >
              <Download className="w-4 h-4" />
              Download Front
            </button>
            <button
              onClick={() => download("back")}
              disabled={!backDataUrl}
              className="group flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl border-2 border-[#001f3f] text-[#001f3f] text-sm font-bold hover:bg-[#001f3f] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
            >
              <Download className="w-4 h-4" />
              Download Back
            </button>
          </div>

          {/* Export quality note */}
          <div className="flex items-start gap-2 bg-[#f8faff] border border-[#e0e7ff] rounded-xl px-4 py-3">
            <Info className="w-4 h-4 text-[#6366f1] shrink-0 mt-0.5" />
            <p className="text-xs text-[#6b7280] leading-relaxed">
              Downloads are exported at <strong className="text-[#374151]">2100 × 1200 px</strong> (print-ready PNG). The preview is lower resolution for performance.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

#!/usr/bin/env node
/**
 * Build Play Store–friendly HTML legal pages from public/legal/*.txt
 * (Google rejects plain .txt URLs for privacy policy declarations).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const legalDir = path.join(__dirname, '..', 'public', 'legal')

const SHARED_STYLE = `
      :root {
        color-scheme: light;
        --bg: #07406a;
        --card: #ffffff;
        --text: #0f172a;
        --muted: #475569;
        --border: #e2e8f0;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
        line-height: 1.55;
        color: var(--text);
        background: linear-gradient(180deg, var(--bg) 0%, #0a2f4d 100%);
        min-height: 100vh;
        padding: 24px 16px 48px;
      }
      main {
        max-width: 720px;
        margin: 0 auto;
        background: var(--card);
        border-radius: 16px;
        padding: 28px 24px 32px;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
      }
      h1 { margin: 0 0 8px; font-size: 1.75rem; color: var(--bg); }
      .meta { margin: 0 0 24px; color: var(--muted); font-size: 0.95rem; }
      h2 { margin: 28px 0 12px; font-size: 1.15rem; color: var(--bg); }
      h3 { margin: 20px 0 8px; font-size: 1.05rem; color: var(--bg); }
      p { margin: 0 0 12px; }
      ul { margin: 8px 0 16px; padding-left: 1.25rem; }
      li { margin-bottom: 8px; }
      a { color: #0369a1; }
      footer {
        margin-top: 32px;
        padding-top: 16px;
        border-top: 1px solid var(--border);
        color: var(--muted);
        font-size: 0.9rem;
      }
`

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function txtToBody(txt) {
  const lines = txt.replace(/\r\n/g, '\n').split('\n')
  const out = []
  let inList = false
  let skippedHeader = 0

  const closeList = () => {
    if (inList) {
      out.push('</ul>')
      inList = false
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const t = line.trim()

    if (skippedHeader < 3 && (t === 'SIMVEST' || t === 'PRIVACY POLICY' || t === 'TERMS OF SERVICE')) {
      skippedHeader++
      continue
    }
    if (skippedHeader === 3 && t.includes('Effective Date')) {
      skippedHeader++
      continue
    }

    if (t.startsWith('•') || t.startsWith('•\t')) {
      if (!inList) {
        closeList()
        out.push('<ul>')
        inList = true
      }
      const item = t.replace(/^•\t?/, '').trim()
      out.push(`<li>${escapeHtml(item)}</li>`)
      continue
    }

    closeList()

    if (!t) continue

    if (/^\d+\.\s+[A-Z0-9]/.test(t) && !/^\d+\.\d+/.test(t)) {
      out.push(`<h2>${escapeHtml(t)}</h2>`)
      continue
    }
    if (/^\d+\.\d+\s/.test(t)) {
      out.push(`<h3>${escapeHtml(t)}</h3>`)
      continue
    }

    out.push(`<p>${escapeHtml(t)}</p>`)
  }
  closeList()
  return out.join('\n')
}

function buildPage({ title, slug, txtName, relatedLinks }) {
  const txt = fs.readFileSync(path.join(legalDir, txtName), 'utf8')
  const metaLine =
    txt
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.includes('Effective Date')) ?? ''
  const body = txtToBody(txt)
  const canonical = `https://simvest-api.onrender.com/legal/${slug}.html`

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Simvest — ${escapeHtml(title)}</title>
    <meta name="description" content="Simvest ${escapeHtml(title)} for the Simvest simulated investing app." />
    <link rel="canonical" href="${canonical}" />
    <style>${SHARED_STYLE}</style>
  </head>
  <body>
    <main>
      <h1>Simvest ${escapeHtml(title)}</h1>
      <p class="meta">${escapeHtml(metaLine)}</p>
      ${body}
      <footer>
        <p>${escapeHtml(metaLine)}</p>
        <p>Related: ${relatedLinks}</p>
      </footer>
    </main>
  </body>
</html>
`
}

const privacyHtml = buildPage({
  title: 'Privacy Policy',
  slug: 'privacy-policy',
  txtName: 'privacy-policy.txt',
  relatedLinks:
    '<a href="/legal/terms-of-service.html">Terms of Service</a> · <a href="/legal/delete-account.html">Delete account</a>',
})

const termsHtml = buildPage({
  title: 'Terms of Service',
  slug: 'terms-of-service',
  txtName: 'terms-of-service.txt',
  relatedLinks:
    '<a href="/legal/privacy-policy.html">Privacy Policy</a> · <a href="/legal/delete-account.html">Delete account</a>',
})

fs.writeFileSync(path.join(legalDir, 'privacy-policy.html'), privacyHtml, 'utf8')
fs.writeFileSync(path.join(legalDir, 'terms-of-service.html'), termsHtml, 'utf8')
console.log('Wrote public/legal/privacy-policy.html and terms-of-service.html')

#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════
//  DEV X VOID — Package Preflight Check
//  TG: https://t.me/Vo1d_op
// ══════════════════════════════════════════════════════════════════
//
//  `npm publish` se PEHLE khud chalta hai (prepublishOnly).
//  Agar kuch missing hai → publish RUK jayega.
//  Isse wahi galti nahi hogi jo 1.0.0 me hui thi (purana code publish).
//
//  Manually:  npm run check          (ya)  node scripts/preflight.js
//
//  Exit code:  0 = pass  |  3 = fail
// ══════════════════════════════════════════════════════════════════

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')

const R = '\x1b[31m', G = '\x1b[32m', Y = '\x1b[33m', B = '\x1b[36m', M = '\x1b[35m', N = '\x1b[0m', D = '\x1b[2m'

let pass = 0, fail = 0, warn = 0
const failed = []

const ok = (m) => { pass++; console.log(`   ${G}✅ ${m}${N}`) }
const bad = (m) => { fail++; failed.push(m); console.log(`   ${R}❌ ${m}${N}`) }
const wn = (m) => { warn++; console.log(`   ${Y}⚠️  ${m}${N}`) }
const info = (m) => console.log(`   ${D}ℹ️  ${m}${N}`)
const sec = (t) => console.log(`\n${B}§ ${t}${N}`)

const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8') } catch { return '' } }
const exists = (p) => fs.existsSync(path.join(ROOT, p))
const count = (s, re) => (String(s).match(re) || []).length

function walk(dir, out = []) {
    let list = []
    try { list = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
    for (const e of list) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) walk(full, out)
        else out.push(full)
    }
    return out
}

const nodeVer = process.versions.node
console.log(`\n${M}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}`)
console.log(`${M}  DEV X VOID — PACKAGE PREFLIGHT${N}`)
console.log(`${M}  TG: https://t.me/Vo1d_op${N}`)
console.log(`${M}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}`)
console.log(`\n   Root: ${ROOT}\n   Node: v${nodeVer}\n`)

// ── 1. IDENTITY ──────────────────────────────────────────────────
sec('1  PACKAGE IDENTITY')

let pkg = null
try { pkg = JSON.parse(read('package.json')) } catch (e) { bad(`package.json parse nahi hua: ${e.message}`) }

if (pkg) {
    pkg.name === '@devxvoid/baileys' ? ok(`name: ${pkg.name}`) : bad(`name galat: ${pkg.name}`)

    const v = String(pkg.version || '');
    /^\d+\.\d+\.\d+/.test(v) ? ok(`version: ${v}`) : bad(`version semver nahi: ${v}`)

    const eng = String(pkg.engines?.node || '')
    if (eng.includes('&')) bad(`engines me HTML escape (&gt;) — value: ${eng}`)
    else if (/20|22|24/.test(eng)) ok(`engines: node ${eng}`)
    else bad(`engines node ${eng} — 20+ chahiye (package khud 20+ maangta hai)`)

    pkg.type === 'module' ? ok("type: module (ESM)") : wn('type module nahi (ESM imports fail honge)')

    pkg.main === 'lib/index.js' ? ok(`main: ${pkg.main}`) : wn(`main: ${pkg.main}`)

    pkg.exports ? ok(`exports map: ${Object.keys(pkg.exports).join(' , ')}`) : wn('exports map nahi hai (Node 20+ recommend karta hai)')
    if (pkg.exports && pkg.exports['./*']) info("'./*' wildcard hai → deep imports (WAProto/...) chalenge ✅")

    if (pkg.types) {
        exists(pkg.types) ? ok(`types: ${pkg.types}`) : bad(`types field hai par file MISSING: ${pkg.types} (broken → hata do)`)
    } else info('types field nahi (JS package — theek hai)')

    pkg.publishConfig?.access === 'public' ? ok('publishConfig: access public (scoped publish ke liye)') : wn('publishConfig.access nahi — scoped npm publish fail karega')

    const repo = String(pkg.repository?.url || '')
    repo.includes('void-baileys/Baileys') ? ok(`repository: ${repo}`) : wn(`repository check karo: ${repo || '(none)'}`)
}

if (!/^v?2[0-9]\./.test(nodeVer)) bad(`Node ${nodeVer} — publish karne ke liye Node 20+ chalao`)
else ok(`Node ${nodeVer} — 20+ ✅`)

// ── 2. REQUIRED FILES ────────────────────────────────────────────
sec('2  REQUIRED FILES (package me ship honge)')

const req = [
    ['lib/index.js', 'entry point'],
    ['lib/Socket/index.js', 'socket layers'],
    ['lib/Socket/messages-send.js', 'sendMessage/relayMessage'],
    ['lib/Socket/void-advanced.js', 'DEV X VOID — advanced suite'],
    ['lib/Socket/void-status.js', 'DEV X VOID — status suite'],
    ['WAProto/WAProto.proto', 'proto definitions'],
    ['WAProto/index.js', 'compiled proto (runtime)'],
    ['engine-requirements.js', 'node version guard'],
]
for (const [f, why] of req) {
    exists(f) ? ok(`${f}  ${D}(${why})${N}`) : bad(`${f} MISSING  (${why})`)
}

// ── 3. CLEAN / BACKDOOR CHECK ────────────────────────────────────
sec('3  CLEAN CHECK (koi backdoor nahi hona chahiye)')

const libFiles = walk(path.join(ROOT, 'lib')).filter((f) => f.endsWith('.js'))
const jidHits = []
for (const f of libFiles) {
    if (/[0-9]{13,}@newsletter/.test(fs.readFileSync(f, 'utf8'))) jidHits.push(path.relative(ROOT, f))
}
jidHits.length === 0 ? ok(`Hardcoded newsletter JID: 0 (${libFiles.length} files scan kiye)`)
                     : bad(`Hardcoded newsletter JID mila: ${jidHits.join(', ')}`)

const defaults = read('lib/Defaults/index.js');
/DEFAULT_AUTO_FOLLOW_CHANNELS\s*=\s*\[\s*\]\s*;/.test(defaults)
    ? ok('DEFAULT_AUTO_FOLLOW_CHANNELS = []  (khaali — auto-follow nahi)')
    : bad('DEFAULT_AUTO_FOLLOW_CHANNELS me kuch bhara hai — AUTO-FOLLOW BACKDOOR');

/blockAutoFollowChannels:\s*true/.test(defaults)
    ? ok('blockAutoFollowChannels: true  (guard ON by default)')
    : wn('blockAutoFollowChannels: true nahi mila')

const autoCalls = libFiles.filter((f) => /newsletterFollow\(\s*['"][0-9]/.test(fs.readFileSync(f, 'utf8')))
autoCalls.length === 0 ? ok('Koi hardcoded newsletterFollow(jid) call nahi')
                       : bad(`Hardcoded newsletterFollow call: ${autoCalls.map((f) => path.relative(ROOT, f)).join(', ')}`)

// ── 3b. TLS / NETWORK SECURITY ───────────────────────────────────
const wsFile = read('lib/Socket/Client/websocket.js')
if (wsFile) {
    /rejectUnauthorized\s*:\s*false/.test(wsFile)
        ? bad('TLS verification OFF (rejectUnauthorized: false) — MITM risk! Ye line hata do')
        : ok('TLS verification ON (rejectUnauthorized: false nahi hai)')
} else bad('lib/Socket/Client/websocket.js padha nahi ja saka')

// ── 3c. DEEP-NESTING PAYLOAD SUPPORT (crash-bot payloads) ────────
const waProto = read('WAProto/index.js')
if (waProto) {
    const enc = /util\.recursionLimit\s*=\s*\d{4,}/.test(waProto)
    const dec = /Reader\.recursionLimit\s*=\s*\d{4,}/.test(waProto)
    if (enc && dec) ok('Deep-nesting payload support (encode + decode limits raised — forceandro/FcHard/VoidAndroid payloads chalenge)')
    else if (enc) wn('Encode limit raised hai par decode limit nahi — decode-bypass payloads (FcHard/VoidAndroid) fail honge')
    else bad('WAProto me recursionLimit raise nahi — deep payloads "max depth exceeded" pe fail honge')
} else bad('WAProto/index.js padha nahi ja saka')

// ── 4. FEATURES — messages-send (isSecret) ───────────────────────
sec('4  FEATURE: secret mode (isSecret / ptcp)')

const send = read('lib/Socket/messages-send.js')
if (send) {
    /isSecret/.test(send) ? ok('isSecret option maujood') : bad('isSecret MISSING');
    /secretMode/.test(send) ? ok('secretMode logic maujood (device filter)') : bad('secretMode MISSING');
    /ptcp/.test(send) ? ok('ptcp option maujood') : bad('ptcp MISSING')

    const pts = count(send, /isSecret:\s*options\.isSecret/g)
    pts >= 6 ? ok(`Pass-through sites: ${pts} (options silently drop nahi honge)`)
             : bad(`Pass-through sites sirf ${pts} — 6+ chahiye`);

    /isSecret\s*=\s*false/.test(send) ? info('default param: isSecret = false ✅') : wn('isSecret ka default param nahi mila')
} else bad('messages-send.js padha nahi ja saka')

// ── 5. FEATURES — advanced + status suite ────────────────────────
sec('5  FEATURE: sendSecret() / sendPtcp() / status suite')

const adv = read('lib/Socket/void-advanced.js')
if (adv) {
    /const sendSecret\s*=/.test(adv) ? ok('sendSecret() defined') : bad('sendSecret() MISSING');
    /const sendPtcp\s*=/.test(adv) ? ok('sendPtcp() defined') : bad('sendPtcp() MISSING');
    /^\s*sendSecret,\s*$/m.test(adv) ? ok('sendSecret socket pe exposed') : bad('sendSecret EXPOSE nahi hai (sock.sendSecret undefined)');
    /^\s*sendPtcp,\s*$/m.test(adv) ? ok('sendPtcp socket pe exposed') : bad('sendPtcp EXPOSE nahi hai')
} else bad('void-advanced.js padha nahi ja saka')

const stat = read('lib/Socket/void-status.js')
if (stat) {
    for (const m of ['sendStatus', 'sendGroupStatus', 'sendGhostStatus', 'sendStatusUnified', 'sendStatusAllGroups']) {
        new RegExp(`const ${m}\\s*=`).test(stat) ? ok(`${m}()`) : bad(`${m}() MISSING`)
    }
} else bad('void-status.js padha nahi ja saka')

// ── 6. FEATURES — username + socket layers ───────────────────────
sec('6  FEATURE: fetchUsername() + socket layers');

/fetchUsername/.test(read('lib/Socket/socket.js')) ? ok('fetchUsername() maujood') : wn('fetchUsername() nahi mila')

const sidx = read('lib/Socket/index.js')
for (const layer of ['makeMessageBuilderSocket', 'makeVoidAdvancedSocket', 'makeVoidStatusSocket']) {
    new RegExp(layer).test(sidx) ? ok(`${layer} wrap laga hai`) : bad(`${layer} wrap NAHI laga (methods socket pe nahi aayenge)`)
}

// ── 7. WAProto CUSTOM FIELDS ─────────────────────────────────────
sec('7  WAProto custom fields')

const proto = read('WAProto/WAProto.proto')
const field = (name, id) => new RegExp(`\\b${name}\\s*=\\s*${id}\\s*;`).test(proto)
const fields = [
    ['interactiveResponseMessage', 48],
    ['stickerPackMessage', 86],
    ['richResponseMessage', 97],
    ['groupStatusMessageV2', 103],
    ['botForwardedMessage', 104],
]
for (const [n, id] of fields) {
    field(n, id) ? ok(`${n} = ${id}`) : bad(`${n} = ${id} MISSING  (bot crash karega jab ye use karoge)`)
}
field('bloksWidget', 8) && field('bloksWidget', 10) ? ok('bloksWidget (8 + nested 10)') : bad('bloksWidget (8/10) MISSING')

const compiled = read('WAProto/index.js');
/groupStatusMessageV2/.test(compiled) && /botForwardedMessage/.test(compiled)
    ? ok('Compiled WAProto/index.js me fields hain (runtime ready)')
    : bad("Compiled WAProto/index.js me fields nahi — 'npm run gen:protobuf' chalao")

// ── 8. ENTRY EXPORTS + BRANDING ──────────────────────────────────
sec('8  Entry file (lib/index.js)')

const entry = read('lib/index.js')
if (entry) {
    const stars = count(entry, /export \* from/g)
    stars >= 6 ? ok(`export * lines: ${stars}`) : bad(`export * lines sirf ${stars} — bahut kam exports`);
    /export default makeWASocket/.test(entry) ? ok('makeWASocket default export hai') : bad('makeWASocket default export MISSING');
    /DEV X VOID/.test(entry) ? ok('DEV X VOID branding (startup panel)') : wn('DEV X VOID branding nahi mili')
} else bad('lib/index.js padha nahi ja saka')

// ── RESULT ───────────────────────────────────────────────────────
console.log(`\n${M}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}`)
console.log(`  RESULT:  ${G}${pass} PASS${N}   ${R}${fail} FAIL${N}   ${Y}${warn} WARN${N}`)
console.log(`${M}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}`)

if (fail === 0) {
    console.log(`\n  ${G}🎉 PACKAGE READY — publish karne layak hai!${N}\n`)
    process.exit(0)
} else {
    console.log(`\n  ${R}🚨 PACKAGE NOT READY — ye theek karo pehle:${N}\n`)
    failed.forEach((f) => console.log(`     ${R}•${N} ${f}`))
    console.log(`\n  ${Y}Agar publish karte ho to package wahi problem degi jo 1.0.0 ne di thi.${N}\n`)
    process.exit(3)
}

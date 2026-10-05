# 『 𝐕𝐎𝐈𝐃 』 Baileys

> **DEV X VOID** — clean, backdoor-free WhatsApp Web API (Baileys fork)
> Status suite · Secret mode · Username resolver · Extra message types

**TG:** https://t.me/Vo1d_op

---

## ⚡ Install

```bash
# npm se (jab publish ho jaye)
npm install @devxvoid/baileys

# ya seedha GitHub se (abhi isse chalao)
npm install github:void-baileys/Baileys
```

**Requirements:**

| | |
|---|---|
| Node.js | **20.19+** (`require()` ke liye) · 20+ (`import` ke liye) |
| Module | ESM package hai (`import`) — Node 20.19+ me `require()` bhi chalta hai |

---

## 🚀 Quick Start

```js
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@devxvoid/baileys'

const { state, saveCreds } = await useMultiFileAuthState('auth')
const sock = makeWASocket({ auth: state, printQRInTerminal: false })

sock.ev.on('creds.update', saveCreds)
sock.ev.on('connection.update', ({ connection }) => {
  if (connection === 'open') console.log('✅ Connected as', sock.user.id)
})

await sock.sendMessage('919999999999@s.whatsapp.net', { text: 'Hello from VOID' })
```

**Pairing code** (QR ke bina):

```js
if (!sock.authState.creds.registered) {
  const code = await sock.requestPairingCode('919999999999')
  console.log('Pairing code:', code)   // WhatsApp → Linked Devices → Link with phone number
}
```

---

## ✨ Features (DEV X VOID additions)

### 📡 Status Suite — `sock.sendStatus()` etc.

| Method | Kya karta hai |
|---|---|
| `sendStatus(content, jids?, opts?)` | `status@broadcast` + `statusJidList` (custom audience) |
| `sendGroupStatus(groupJid, content)` | Group status — `groupStatusMessageV2` (103) |
| `sendGhostStatus(content, jids?, opts?)` | Ghost/forwarded status — `botForwardedMessage` (104) |
| `sendStatusMentionStatus(...)` | Status with mentions |
| `sendStatusUnified(cfg)` | Saare modes ek config me |
| `sendStatusAllGroups(content, opts?)` | Bulk — saare groups me status |

```js
await sock.sendStatus({ text: 'Status from VOID' })                       // apna status
await sock.sendStatus({ image: { url: './pic.jpg' } }, ['919...@s.whatsapp.net'])  // custom audience
await sock.sendGroupStatus('120363xxx@g.us', { text: 'Group status' })
await sock.sendGhostStatus({ text: 'Ghost status' })
```

### 🔒 Secret Mode — `sendSecret()` / `sendPtcp()`

Message **recipient ko normally** milta hai, par **aapke doosre devices pe sync nahi** hota.

```js
await sock.sendSecret(jid, { conversation: 'Sirf usko — mere WhatsApp Web pe nahi' })
await sock.sendPtcp(jid, { conversation: 'Same behaviour' })

// ya option se (kisi bhi sendMessage pe)
await sock.sendMessage(jid, { text: 'hi' }, { isSecret: true })
await sock.sendMessage(jid, { text: 'hi' }, { noSelfSync: true })
```

> ⚠️ **Sirf 1:1 chats me.** Groups/status exempt hain. Notification aur chat entry normal rahegi.

### 👤 Username Resolver

```js
const [info] = await sock.fetchUsername('devxvoid')
console.log(info.pn)    // 919999999999@s.whatsapp.net
```

### 💬 Extra Message Types

| Method | Proto field |
|---|---|
| `sendInteractiveResponse()` | `interactiveResponseMessage` (48) |
| `sendStickerPack()` | `stickerPackMessage` (86) |
| `sendRichResponseAdvanced()` | `richResponseMessage` (97) |
| `sendGroupStatus()` | `groupStatusMessageV2` (103) |
| `sendBotForwarded()` | `botForwardedMessage` (104) |
| `sendBloksWidget()` | `bloksWidget` (8/10) |

### 🛠️ Aur Bhi

```
sendAlbumMessage() · sendCarouselMessage() · sendVCard() · sendActionPoll()
forwardMessage() · broadcastMessage() · sock.newsletterFollow() (guarded)
makeAIGroupsSocket · makePrivacySocket · makeRegistrationSocket · makeGraphQLSocket
```

---

## 🛡️ Clean & Backdoor-Free

Isko verify karne ka tarika (self-check built-in):

```bash
npm run check
```

Ye check karta hai:
```
✅ Koi hardcoded newsletter JID nahi
✅ DEFAULT_AUTO_FOLLOW_CHANNELS = []
✅ blockAutoFollowChannels: true
✅ Saare features maujood (isSecret, sendSecret, status suite, proto fields)
✅ TLS verification ON (rejectUnauthorized: false nahi hai)
✅ Deep-nesting payload support (recursionLimit raised)
✅ package.json sahi (engines, exports, files)
```

`npm publish` se pehle ye **khud** chalta hai (`prepublishOnly`) — incomplete build publish nahi hoga.

### 🧨 Deep-nesting payloads (crash bots ke liye)

`WAProto/index.js` me outgoing encode ka recursion limit **10000** kar diya gaya hai:

```js
$protobuf.util.recursionLimit = 10000   // default = 100
```

**Kyun:** protobufjs 8.x se generate hua proto har `encode()` pe depth check karta hai
(`if (q > $util.recursionLimit) throw "max depth exceeded"`). Deep payloads — jaise
`quotedMessage` ki 1000-level chain — default 100 pe **throw** kar deti thi, aur message
kabhi jaata hi nahi tha (bina clear error ke).

⚠️ Ye sirf **outgoing** limit hai. Incoming decode ka limit (`$Reader.recursionLimit`)
protobufjs ke default pe hi hai — DoS hardening intact.


---

## 📦 Publish / Update (owner ke liye)

```bash
# 1) Check karo
npm run check

# 2) GitHub pe push
bash push-to-github.sh

# 3) npm pe publish
bash publish-to-npm.sh          # --access public khud lagta hai
```

> 🔑 Pehli baar: npm org banao → https://www.npmjs.com/org/create (`devxvoid`), phir `npm login`

---

## 📚 Credits

- Fork of [Baileys](https://github.com/WhiskeySockets/Baileys) by WhiskeySockets (MIT)
- Modifications: **DEV X VOID** — https://t.me/Vo1d_op
- License: MIT (see `LICENSE`)

---

*Made with 🖤 by DEV X VOID*

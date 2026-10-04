/**
 * ════════════════════════════════════════════════════════════════════
 *  DEV X VOID — UNIFIED STATUS SUITE (void-status.js)
 *  TG: https://t.me/Vo1d_op
 * ════════════════════════════════════════════════════════════════════
 *
 *  Ye module TEENO cheezein ek jagah jodta hai:
 *
 *   ┌──────────────────────┬──────────────────────────────────────┐
 *   │ MODE                 │ PROTO / TARGET                       │
 *   ├──────────────────────┼──────────────────────────────────────┤
 *   │ 1. 'broadcast'       │ status@broadcast + statusJidList     │
 *   │ 2. 'group'           │ groupStatusMessageV2 (103) → @g.us   │
 *   │ 3. 'ghost'           │ status@broadcast + botForwarded(104) │
 *   │                      │  → INVISIBLE (status tab me nahi)    │
 *   │ 4. 'mention'         │ status@broadcast + mentioned_users   │
 *   └──────────────────────┴──────────────────────────────────────┘
 *
 *  PROTO FIELD IDs (verified):
 *     groupStatusMessageV2 = 103   (FutureProofMessage)
 *     botForwardedMessage  = 104   (FutureProofMessage)
 *     statusMentionMessage = 87
 *
 *  FEATURES:
 *    • Group JID auto-expand → member JIDs (poore group ko status)
 *    • Mention notification (protocolMessage type 25) auto-send
 *    • Random text color/background (WA signature look)
 *    • Media (image/video/audio) support
 *    • Ghost/invisible status (botForwardedMessage wrapper)
 * ════════════════════════════════════════════════════════════════════
 */

import crypto from 'node:crypto';
import { jidNormalizedUser, isJidGroup, isJidBroadcast } from '../WABinary/jid-utils.js';
import { generateWAMessage, generateWAMessageFromContent } from '../Utils/messages.js';

const STORIES_JID = 'status@broadcast';

export const makeVoidStatusSocket = (sock) => {
    const {
        relayMessage,
        sendMessage,
        waUploadToServer,
        user,
        logger
    } = sock;

    // ══════════════════════════════════════════════════════════════
    //  HELPERS
    // ══════════════════════════════════════════════════════════════

    const randHex = () => '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    const delay = (ms) => new Promise(r => setTimeout(r, ms));

    /** Group JID ko member JIDs me expand karo (recursive-safe) */
    const expandJids = async (jids = []) => {
        const out = new Set();
        for (const raw of jids.flat().filter(Boolean)) {
            const jid = jidNormalizedUser(raw);
            if (isJidGroup(jid)) {
                try {
                    const meta = (sock.cachedGroupMetadata ? await sock.cachedGroupMetadata(jid) : null)
                        || (sock.groupMetadata ? await sock.groupMetadata(jid) : null);
                    const parts = meta?.participants || [];
                    for (const p of parts) {
                        const id = p.id || p.jid;
                        if (id) out.add(jidNormalizedUser(id));
                    }
                    if (!parts.length) logger?.warn?.({ jid }, '[DEV X VOID] group expand: koi participant nahi mila');
                } catch (e) {
                    logger?.error?.({ jid, e: e.message }, '[DEV X VOID] group expand fail');
                }
            } else {
                out.add(jid);
            }
        }
        return [...out];
    };

    /** Content ko properly prepare karo (media/text, colors, font) */
    const buildStatusContent = (content = {}, { media = true } = {}) => {
        const c = { ...content };
        const isMedia = !!(c.image || c.video || c.audio);
        const isAudio = !!c.audio;

        if (isMedia && !isAudio) {
            if (c.text) { c.caption = c.text; delete c.text; }
            delete c.ptt; delete c.font; delete c.backgroundColor; delete c.textColor;
        }
        if (isAudio) {
            delete c.text; delete c.caption; delete c.font; delete c.textColor;
        }
        if (!isMedia) {
            c.font = c.font ?? Math.floor(Math.random() * 9);
            c.textColor = c.textColor || randHex();
            c.backgroundColor = c.backgroundColor || randHex();
        }
        if (isAudio) {
            c.backgroundColor = c.backgroundColor || randHex();
            c.ptt = typeof c.ptt === 'boolean' ? c.ptt : true;
        }
        return c;
    };

    /** Mention notification bhejo (protocolMessage type 25) */
    const notifyMention = async (targetJid, statusKey, isGroup) => {
        const type = isGroup ? 'groupStatusMentionMessage' : 'statusMentionMessage';
        try {
            const statusMsg = generateWAMessageFromContent(
                jidNormalizedUser(targetJid),
                {
                    [type]: { message: { protocolMessage: { key: statusKey, type: 25 } } },
                    messageContextInfo: { messageSecret: crypto.randomBytes(32) }
                },
                { userJid: sock.user?.id }
            );
            await relayMessage(jidNormalizedUser(targetJid), statusMsg.message, {
                additionalNodes: [{
                    tag: 'meta',
                    attrs: isGroup ? { is_group_status_mention: 'true' } : { is_status_mention: 'true' }
                }]
            });
            return true;
        } catch (e) {
            logger?.error?.({ targetJid, e: e.message }, '[DEV X VOID] mention notify fail');
            return false;
        }
    };

    // ══════════════════════════════════════════════════════════════
    //  1) STATUS BROADCAST  →  status@broadcast + statusJidList
    // ══════════════════════════════════════════════════════════════

    /**
     * Normal WhatsApp Status (story) bhejo + chosen logon ko notify karo.
     * Group JID dena → uske saare members automatically expand ho jayenge.
     *
     * @param {object}   content   { text } | { image, caption } | { video } | { audio }
     * @param {string[]} jids      user ya group JIDs (dono chalenge)
     * @param {object}   options   { notify: true, invisible: false, extraNodes: [] }
     *
     * Example:
     *   await sock.sendStatus({ text: 'Hello!' }, ['120363...@g.us', '9199...@s.whatsapp.net'])
     */
    const sendStatus = async (content = {}, jids = [], options = {}) => {
        const { notify = true, invisible = false, extraNodes = [] } = options;

        const recipients = jids.flat().filter(Boolean);
        const expanded = await expandJids(recipients);

        const meId = jidNormalizedUser(sock.user?.id || '');
        const statusJidList = [...new Set([meId, ...expanded].filter(Boolean))];

        // ── content build ──
        const prepared = buildStatusContent(content);
        let generated;
        try {
            generated = await generateWAMessage(STORIES_JID, prepared, {
                logger,
                userJid: meId,
                upload: waUploadToServer
            });
        } catch (e) {
            // fallback: simple content
            generated = generateWAMessageFromContent(
                STORIES_JID,
                { extendedTextMessage: { text: prepared.text || '' } },
                { userJid: meId }
            );
        }

        let messageBody = generated.message;

        // ── GHOST / INVISIBLE: botForwardedMessage (104) me wrap karo ──
        if (invisible) {
            messageBody = {
                botForwardedMessage: {
                    message: {
                        ...messageBody,
                        contextInfo: { isForwarded: true, forwardOrigin: 4, ...(messageBody?.contextInfo || {}) }
                    }
                }
            };
        }

        // ── additionalNodes: mentioned_users ──
        const additionalNodes = [
            {
                tag: 'meta',
                attrs: {},
                content: [{
                    tag: 'mentioned_users',
                    attrs: {},
                    content: recipients
                        .filter(j => !isJidGroup(j))
                        .map(j => ({ tag: 'to', attrs: { jid: jidNormalizedUser(j) } }))
                }]
            },
            ...extraNodes
        ];

        await relayMessage(STORIES_JID, messageBody, {
            messageId: generated.key.id,
            statusJidList,
            additionalNodes
        });

        // ── mention notification (protocolMessage type 25) ──
        if (notify) {
            for (const jid of expanded) {
                await notifyMention(jid, generated.key, false);
                await delay(1500);
            }
        }

        return { message: generated, statusJidList, notified: notify ? expanded.length : 0 };
    };

    // ══════════════════════════════════════════════════════════════
    //  2) GROUP STATUS  →  groupStatusMessageV2 (field 103)
    // ══════════════════════════════════════════════════════════════

    /**
     * Group Story (Group Status V2) bhejo — sirf group me dikhega.
     *
     * @param {string} groupJid   @g.us JID
     * @param {object} content    { text } | { image, caption } | { video }
     *
     * Example:
     *   await sock.sendGroupStatus('120363XXXX@g.us', { text: 'Group Story!' })
     */
    const sendGroupStatus = async (groupJid, content = {}) => {
        if (!groupJid?.endsWith('@g.us')) {
            throw new Error('[DEV X VOID] sendGroupStatus: group JID (@g.us) chahiye');
        }

        const prepared = buildStatusContent(content);
        const meId = jidNormalizedUser(sock.user?.id || '');

        let generated;
        try {
            generated = await generateWAMessage(groupJid, prepared, {
                logger, userJid: meId, upload: waUploadToServer
            });
        } catch {
            generated = generateWAMessageFromContent(
                groupJid,
                { extendedTextMessage: { text: prepared.text || '' } },
                { userJid: meId }
            );
        }

        const inner = generated.message;

        const messageBody = {
            groupStatusMessageV2: {
                message: {
                    ...inner,
                    messageContextInfo: {
                        ...(inner?.messageContextInfo || {}),
                        messageSecret: inner?.messageContextInfo?.messageSecret || crypto.randomBytes(32)
                    }
                }
            }
        };

        await relayMessage(groupJid, messageBody, {
            messageId: generated.key.id,
            noSelfSync: true
        });

        return { message: generated, groupJid };
    };

    // ══════════════════════════════════════════════════════════════
    //  3) GHOST / INVISIBLE STATUS  →  status@broadcast + botForwardedMessage
    // ══════════════════════════════════════════════════════════════

    /**
     * INVISIBLE status — recipient ko mil jayega par status list me nahi dikhega.
     * (botForwardedMessage = 104 wrapper ke andar status)
     *
     * @param {object}   content  { text } | { image, caption } | { video }
     * @param {string[]} jids     recipients (user ya group)
     *
     * Example:
     *   await sock.sendGhostStatus({ text: 'sirf tumhare liye 😉' }, ['9199...@s.whatsapp.net'])
     */
    const sendGhostStatus = async (content = {}, jids = [], options = {}) =>
        sendStatus(content, jids, { ...options, invisible: true });

    // ══════════════════════════════════════════════════════════════
    //  4) STATUS MENTION  →  status@broadcast + mentioned_users node
    // ══════════════════════════════════════════════════════════════

    /**
     * Status bhejo aur specific logon ko MENTION karo (unhe notification jayega).
     *
     * @param {object}   content  { text } | { image, caption }
     * @param {string[]} jids     jinhe mention karna hai
     *
     * Example:
     *   await sock.sendStatusMentionStatus({ text: 'Namaste!' }, ['9199...@s.whatsapp.net'])
     */
    const sendStatusMentionStatus = async (content = {}, jids = []) =>
        sendStatus(content, jids, { notify: true });

    // ══════════════════════════════════════════════════════════════
    //  5) UNIFIED  —  ek method, saare modes
    // ══════════════════════════════════════════════════════════════

    /**
     * SAB KUCH EK METHOD ME!
     *
     * @param {object} cfg {
     *    mode: 'broadcast' | 'group' | 'ghost' | 'mention',
     *    content: { text } | { image, caption } | { video } | { audio },
     *    jids: [...],          // broadcast/ghost/mention ke liye
     *    groupJid: '@g.us',    // group mode ke liye
     *    notify: true,         // mention notification bheje?
     *    invisible: false      // ghost wrapper
     * }
     *
     * Example:
     *   // broadcast
     *   await sock.sendStatusUnified({ mode: 'broadcast', content: { text: 'Hi' }, jids: [group] })
     *   // group story
     *   await sock.sendStatusUnified({ mode: 'group', content: { text: 'Hi' }, groupJid })
     *   // invisible
     *   await sock.sendStatusUnified({ mode: 'ghost', content: { text: 'Hi' }, jids: [jid] })
     */
    const sendStatusUnified = async (cfg = {}) => {
        const { mode = 'broadcast', content = {}, jids = [], groupJid, notify = true, invisible = false } = cfg;

        switch (mode) {
            case 'group':
                return sendGroupStatus(groupJid || jids[0], content);
            case 'ghost':
                return sendGhostStatus(content, jids, { notify });
            case 'mention':
                return sendStatusMentionStatus(content, jids);
            case 'broadcast':
            default:
                return sendStatus(content, jids, { notify, invisible });
        }
    };

    // ══════════════════════════════════════════════════════════════
    //  6) BULK — saare groups me status
    // ══════════════════════════════════════════════════════════════

    /**
     * Saare groups me status bhejo (group JID auto-expand).
     * @param {object} content
     * @param {object} options { delayMs: 2000, notify: false, limit: 0 }
     */
    const sendStatusAllGroups = async (content = {}, options = {}) => {
        const { delayMs = 2000, notify = false, limit = 0 } = options;
        let groups = {};
        try {
            groups = await sock.groupFetchAllParticipating() || {};
        } catch (e) {
            logger?.error?.({ e: e.message }, '[DEV X VOID] groupFetchAllParticipating fail');
        }
        let jids = Object.keys(groups);
        if (limit > 0) jids = jids.slice(0, limit);

        const results = [];
        for (const g of jids) {
            try {
                const r = await sendStatus(content, [g], { notify });
                results.push({ jid: g, ok: true, notified: r.notified });
            } catch (e) {
                results.push({ jid: g, ok: false, error: e.message });
            }
            await delay(delayMs);
        }
        return { total: results.length, sent: results.filter(r => r.ok).length, results };
    };

    return {
        ...sock,
        // ── naye unified methods ──
        sendStatus,              // status@broadcast + statusJidList
        sendGroupStatus,         // groupStatusMessageV2 (103)
        sendGhostStatus,         // botForwardedMessage (104) — invisible
        sendStatusMentionStatus, // status + mentioned_users
        sendStatusUnified,       // saare modes ek method me
        sendStatusAllGroups,     // bulk — saare groups
        // ── aliases (compatibility) ──
        sendStatusV2: sendStatus,
        groupStory: sendGroupStatus,
        invisibleStatus: sendGhostStatus
    };
};

export default makeVoidStatusSocket;

/**
 * ────────────────────────────────────────────────────────────────
 *  DEV X VOID — Advanced Message Types (Void Advanced Suite)
 *  TG: https://t.me/Vo1d_op
 * ────────────────────────────────────────────────────────────────
 *
 *  Proto field IDs (WAProto — WhatsApp ke fixed IDs, sakata se verified):
 *
 *    Message.interactiveResponseMessage   = 48
 *    Message.stickerPackMessage           = 86
 *    Message.richResponseMessage          = 97
 *    Message.statusMentionMessage         = 87
 *    Message.groupStatusMessageV2         = 103   (FutureProofMessage)
 *    Message.botForwardedMessage          = 104   (FutureProofMessage)
 *    InteractiveMessage.bloksWidget       = 8     (struct: uuid,data,type,fallback)
 *    InteractiveMessage.bloksWidget(alt)  = 10
 *
 *  Ye module un message types ke liye clean builders deta hai jo proto me
 *  the lekin lib/ me properly wired nahi the:
 *    1. groupStatusMessageV2   → sendGroupStatusV2()
 *    2. botForwardedMessage    → sendBotForwarded()
 *    3. richResponseMessage    → sendRichResponseAdvanced()
 *    4. bloksWidget            → sendBloksWidget()
 *    5. interactiveResponseMessage → sendInteractiveResponse()
 *    6. stickerPackMessage     → sendStickerPack() [extension]
 * ────────────────────────────────────────────────────────────────
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import { proto } from '../../WAProto/index.js';
import { generateWAMessageFromContent, generateWAMessageContent, prepareWAMessageMedia } from '../Utils/messages.js';

export const makeVoidAdvancedSocket = (sock) => {
    const { relayMessage, sendMessage, waUploadToServer } = sock;

    // ══════════════════════════════════════════════════════════════
    //  HELPERS
    // ══════════════════════════════════════════════════════════════


    /** file path / http url / buffer -> Buffer (reliable) */
    const toBuffer = async (src) => {
        if (Buffer.isBuffer(src)) return src;
        if (typeof src !== 'string') throw new Error('[DEV X VOID] toBuffer: buffer, path ya url do.');
        if (/^https?:\/\//i.test(src)) {
            const res = await fetch(src);
            if (!res.ok) throw new Error(`[DEV X VOID] download fail (${res.status}): ${src}`);
            return Buffer.from(await res.arrayBuffer());
        }
        return fs.readFileSync(src.replace(/^file:\/\//, ''));
    };

    /** Raw relay — proto object ko bina content-detection ke bhej deta hai */
    const relayRaw = async (jid, messageContent, options = {}) => {
        const msg = generateWAMessageFromContent(jid, messageContent, {});
        await relayMessage(jid, msg.message, { messageId: msg.key.id, ...options });
        return msg;
    };

    /** viewOnceMessage wrapper (kuch interactive types ke liye zaroori) */
    const wrapViewOnce = (inner) => ({ viewOnceMessage: { message: inner } });

    // ══════════════════════════════════════════════════════════════
    //  1) groupStatusMessageV2   (proto field 103)
    // ══════════════════════════════════════════════════════════════

    /**
     * Group Story / Group Status v2 bhejta hai.
     *
     * @param jid      Group JID (@g.us)
     * @param content  sendMessage jaisa content ({ text }, { image }, { video }, ...)
     * @param options  { quoted, noSelfSync, messageId }
     *
     * Example:
     *   await sock.sendGroupStatusV2(groupJid, { text: 'Hello Group!' })
     *   await sock.sendGroupStatusV2(groupJid, { image: { url: '...' }, caption: 'Hi' })
     */
    const sendGroupStatusV2 = async (jid, content = {}, options = {}) => {
        if (!jid?.endsWith('@g.us')) {
            throw new Error('[DEV X VOID] sendGroupStatusV2: group JID (@g.us) required hai.')
        }

        // content ko proto message body me convert karo
        const built = await generateWAMessageContent(content, { upload: waUploadToServer });
        const inner = built.message || built;

        // Agar caller ne pehle se v2 shape diya hai to wahi use karo
        const v2Body = inner.groupStatusMessageV2
            ? inner.groupStatusMessageV2
            : { message: inner };

        // messageContextInfo.messageSecret auto-add (WA iske bina story reject karta hai)
        const finalBody = {
            ...v2Body,
            message: {
                ...(v2Body.message || {}),
                messageContextInfo: {
                    ...(v2Body.message?.messageContextInfo || {}),
                    messageSecret: (v2Body.message?.messageContextInfo?.messageSecret)
                        || crypto.randomBytes(32)
                }
            }
        };

        return relayRaw(jid, { groupStatusMessageV2: finalBody }, {
            noSelfSync: true,
            ...options
        });
    };

    // ══════════════════════════════════════════════════════════════
    //  2) botForwardedMessage   (proto field 104)
    // ══════════════════════════════════════════════════════════════

    /**
     * botForwardedMessage ke andar koi bhi message wrap karke bhejta hai.
     * WA isse "bot/metadata" forwarded message ki tarah render karta hai.
     *
     * @param jid      Target JID
     * @param content  { text } ya { image } ya raw { richResponseMessage: ... } etc.
     * @param options  { forwardOrigin, contextInfo, ... }
     *
     * Example:
     *   await sock.sendBotForwarded(jid, { text: 'Bot ka message' })
     */
    const sendBotForwarded = async (jid, content = {}, options = {}) => {
        const { forwardOrigin = 4, contextInfo, ...relayOpts } = options;
        const built = await generateWAMessageContent(content, { upload: waUploadToServer });
        const inner = built.message || built;

        return relayRaw(jid, {
            botForwardedMessage: {
                message: {
                    ...inner,
                    contextInfo: {
                        isForwarded: true,
                        forwardOrigin,
                        ...(contextInfo || {})
                    }
                }
            }
        }, relayOpts);
    };

    // ══════════════════════════════════════════════════════════════
    //  3) richResponseMessage   (proto field 97)
    // ══════════════════════════════════════════════════════════════

    /**
     * AI-style rich response (GenAI unified response widget).
     * Simple sections-based API — header / body / footer / cards / buttons.
     *
     * @param jid
     * @param content {
     *    title, text, buttons: ['A','B'], cards: [{ title, buttons, toast }],
     *    layout: 'vertical' | 'carousel' | 'row',
     *    image: { url, mime_type, width, height },
     *    footer: { text, url, image },
     *    aiLabel: bool
     * }
     *
     * Example:
     *   await sock.sendRichResponseAdvanced(jid, {
     *     title: 'Kaise ho?', text: 'Ek option chuno',
     *     buttons: ['Haan', 'Nahi'], footer: { text: 'DEV X VOID', url: 'https://t.me/Vo1d_op' }
     *   })
     */
    const sendRichResponseAdvanced = async (jid, content = {}, options = {}) => {
        const {
            title = '', text = '',
            buttons = [], cards = [],
            layout = 'vertical',
            image = null,
            footer = null,
            aiLabel = true
        } = content;

        const sections = [];

        // header image
        if (image?.url) {
            sections.push({
                __typename: 'GenAIUnifiedResponseSection',
                view_model: {
                    __typename: 'GenAISingleLayoutViewModel',
                    primitive: {
                        __typename: 'GenAIImagePrimitive',
                        preview_image: {
                            __typename: 'GenAIMediaItem',
                            mime_type: image.mime_type || 'image/png',
                            url: image.url
                        },
                        full_image: {
                            __typename: 'GenAIMediaItem',
                            mime_type: image.mime_type || 'image/png',
                            url: image.url
                        }
                    }
                }
            });
        }

        // header text
        if (title) {
            sections.push({
                __typename: 'GenAIUnifiedResponseSection',
                view_model: {
                    __typename: 'GenAISingleLayoutViewModel',
                    primitive: { __typename: 'FOATextPrimitive', text: '# ' + title }
                }
            });
        }

        // body text
        if (text) {
            sections.push({
                __typename: 'GenAIUnifiedResponseSection',
                view_model: {
                    __typename: 'GenAISingleLayoutViewModel',
                    primitive: { __typename: 'FOATextPrimitive', text }
                }
            });
        }

        // cards (carousel / row) ya simple buttons
        if (cards?.length) {
            sections.push({
                __typename: 'GenAIUnifiedResponseSection',
                view_model: {
                    primitives: cards.map((card, ci) => ({
                        __typename: 'GenAI3PExtWidgetPrimitive',
                        header: {
                            __typename: 'GenAI3PExtWidgetStandardHeader',
                            title: card?.title || ''
                        },
                        body: {
                            __typename: 'GenAI3PExtCalendarEventList',
                            ctas: (card?.buttons || []).map((label, bi) => ({
                                label,
                                state: 'PENDING',
                                kind: 'OTHER',
                                tool_call_id: `${ci}${bi}`,
                                toast: { label: card?.toast || '', __typename: 'GenAI3PExtWidgetToast' },
                                __typename: 'GenAI3PExtWidgetCTA'
                            })),
                            sections: []
                        }
                    })),
                    __typename: layout === 'carousel'
                        ? 'GenAIHScrollLayoutViewModel'
                        : 'GenAIActionRowLayoutViewModel'
                }
            });
        } else if (buttons?.length) {
            sections.push({
                __typename: 'GenAIUnifiedResponseSection',
                view_model: {
                    primitive: {
                        __typename: 'GenAI3PExtWidgetPrimitive',
                        header: {
                            __typename: 'GenAI3PExtWidgetStandardHeader',
                            title: title || ''
                        },
                        body: {
                            __typename: 'GenAI3PExtCalendarEventList',
                            ctas: buttons.map((label, bi) => ({
                                label,
                                state: 'PENDING',
                                kind: 'OTHER',
                                tool_call_id: `${bi}`,
                                toast: { label: '', __typename: 'GenAI3PExtWidgetToast' },
                                __typename: 'GenAI3PExtWidgetCTA'
                            })),
                            sections: []
                        }
                    },
                    __typename: 'GenAISingleLayoutViewModel'
                }
            });
        }

        // footer (CTA + optional image)
        if (footer) {
            const primitives = [{
                cta_text: footer.text || '',
                cta_type: 'OPEN_URL',
                cta_url: footer.url || '',
                __typename: 'GenAIFooterActionPrimitive'
            }];
            if (footer.image?.url) {
                primitives.push({
                    __typename: 'GenAIMarkdownTextUXPrimitive',
                    text: '{{header}}.{{/header}}',
                    inline_entities: [{
                        __typename: 'GenAITextInlineEntity',
                        key: 'header',
                        metadata: {
                            __typename: 'GenAILatexItem',
                            latex_expression: '.',
                            font_height: 22,
                            padding: -5,
                            latex_image: {
                                __typename: 'GenAIMediaItem',
                                mime_type: footer.image.mime_type || 'image/png',
                                url: footer.image.url,
                                url_fallback: footer.image.url,
                                width: footer.image.width || 100,
                                height: footer.image.height || 100,
                                expiration_timestamp_ms: Date.now() + 86400000
                            }
                        }
                    }]
                });
            }
            sections.push({
                view_model: {
                    primitives,
                    __typename: 'GenAIActionRowLayoutViewModel'
                }
            });
        }

        const payload = Buffer.from(JSON.stringify({ sections })).toString('base64');

        const rich = {
            messageType: 1,
            unifiedResponse: { data: payload },
            contextInfo: content.contextInfo || { isForwarded: true, forwardOrigin: 4 }
        };

        // aiLabel → botForwardedMessage ke andar wrap (WA ka official shape)
        if (aiLabel) {
            return relayRaw(jid, {
                botForwardedMessage: { message: { richResponseMessage: rich } }
            }, options);
        }

        return relayRaw(jid, { richResponseMessage: rich }, options);
    };

    // ══════════════════════════════════════════════════════════════
    //  4) bloksWidget   (InteractiveMessage field 8)
    // ══════════════════════════════════════════════════════════════

    /**
     * Bloks widget (WhatsApp ka native app/widget embed).
     * Struct: { uuid, data, type, fallback }
     *
     * @param jid
     * @param content {
     *    text,            // body text
     *    uuid,            // widget uuid
     *    data,            // bloks payload (string ya object — auto JSON.stringify)
     *    type,            // bloks app type
     *    fallback,        // fallback name
     *    footer, header   // optional
     * }
     *
     * Example:
     *   await sock.sendBloksWidget(jid, {
     *     text: 'Yeh ek widget hai',
     *     uuid: 'void-1', data: { foo: 'bar' }, type: 'WA_BLOKS'
     *   })
     */
    const sendBloksWidget = async (jid, content = {}, options = {}) => {
        const {
            text = '', uuid = '', data = '', type = '',
            fallback = '', footer = '', header = '', contextInfo = null
        } = content;

        const dataStr = typeof data === 'string' ? data : JSON.stringify(data);

        const interactiveMessage = {
            ...(header ? { header: { title: header, hasMediaAttachment: false } } : {}),
            body: { text },
            bloksWidget: { uuid, data: dataStr, type, fallback },
            ...(footer ? { footer: { text: footer } } : {}),
            ...(contextInfo ? { contextInfo } : {})
        };

        // WA ko bloks widget viewOnce wrapper me chahiye hota hai
        return relayRaw(jid, wrapViewOnce({ interactiveMessage }), options);
    };

    // ══════════════════════════════════════════════════════════════
    //  5) interactiveResponseMessage   (proto field 48)
    // ══════════════════════════════════════════════════════════════

    /**
     * Native flow response message (button/list ka response bhejne ke liye,
     * ya custom native flow reply).
     * Struct: { body:{text,format}, nativeFlowResponseMessage:{name,paramsJson,version} }
     *
     * @param jid
     * @param content {
     *    text,        // body text
     *    name,        // flow name (e.g. 'open_webview', 'review_and_pay', custom)
     *    params,      // object ya JSON string
     *    version,     // default 3
     *    format,      // 0 = DEFAULT
     *    contextInfo
     * }
     *
     * Example:
     *   await sock.sendInteractiveResponse(jid, {
     *     text: 'Aapka jawab', name: 'quick_reply', params: { id: 'btn_1' }
     *   })
     */
    const sendInteractiveResponse = async (jid, content = {}, options = {}) => {
        const {
            text = '',
            name = '',
            params = {},
            version = 3,
            format = 0,
            contextInfo = null
        } = content;

        const paramsJson = typeof params === 'string' ? params : JSON.stringify(params);

        const interactiveResponseMessage = {
            body: { text, format },
            nativeFlowResponseMessage: { name, paramsJson, version },
            ...(contextInfo ? { contextInfo } : {})
        };

        return relayRaw(jid, { interactiveResponseMessage }, options);
    };

    // ══════════════════════════════════════════════════════════════
    //  5b) SECRET / SILENT MESSAGE  (isSecret flag)
    // ══════════════════════════════════════════════════════════════

    /**
     * SECRET MODE message bhejo.
     *
     * ⚠️  SACH KYA HAI (myth vs reality):
     *
     *   ✅ SENDER ke apne DOOSRE devices pe sync NAHI hoga
     *      (WhatsApp Web / Desktop / dusre phone pe ye message nahi dikhega)
     *
     *   ❌ RECIPIENT ko notification NAHI jaata — YE GALAT HAI. Jayega.
     *   ❌ RECIPIENT ke chat list me invisible — YE GALAT HAI. Dikhega.
     *   ❌ Server ise "masked" treat karta — YE GALAT HAI. Normal delivery.
     *
     *   WhatsApp protocol me "secret" attribute naam ka koi cheez nahi hai.
     *   Sirf device fan-out control hota hai. Recipient ka client poora
     *   normal message receive karta hai.
     *
     * @param {string} jid
     * @param {object} content   sendMessage jaisa content
     * @param {object} options   { quoted, messageId, ... }
     *
     * Example:
     *   await sock.sendSecret(jid, { text: 'Ye sirf usko milega, mere baaki devices pe nahi' })
     */
    const sendSecret = async (jid, content = {}, options = {}) => {
        const built = await generateWAMessageContent(content, { upload: waUploadToServer });
        const msg = generateWAMessageFromContent(jid, built, {});
        await relayMessage(jid, msg.message, {
            messageId: msg.key.id,
            isSecret: true,     // ← noSelfSync ka alias
            ...options
        });
        return msg;
    };

    /**
     * PTCP (participant privacy) mode — isSecret jaisa hi, alag naam se.
     * Sakata 9.0.0 me `ptcp` option alag se hai; behaviour same hai.
     */
    const sendPtcp = async (jid, content = {}, options = {}) => {
        const built = await generateWAMessageContent(content, { upload: waUploadToServer });
        const msg = generateWAMessageFromContent(jid, built, {});
        await relayMessage(jid, msg.message, {
            messageId: msg.key.id,
            ptcp: true,
            ...options
        });
        return msg;
    };

    // ══════════════════════════════════════════════════════════════
    //  6) stickerPackMessage   (proto field 86) — EXTENSION
    // ══════════════════════════════════════════════════════════════

    /**
     * Sticker Pack bhejne ke liye EXTENSION.
     *
     * .wastickerpack file ek encrypted zip hoti hai jisme stickers + tray icon
     * hote hain. Yeh helper poora pack upload karke proper message banata hai.
     *
     * @param jid
     * @param pack {
     *    stickerPackId, name, publisher, description,
     *    stickers: [{ buffer|path|url, emojis:['😀'], isAnimated, isLottie, mimetype, accessibilityLabel }],
     *    trayIcon: buffer|path|url,
     *    caption, origin: 0|1|2
     * }
     * @param options relay options
     *
     * Example:
     *   await sock.sendStickerPack(jid, {
     *     stickerPackId: 'void-pack-1',
     *     name: 'DEV X VOID Pack',
     *     publisher: 'DEV X VOID',
     *     stickers: [{ path: './s1.webp', emojis: ['🔥'] }],
     *     trayIcon: './tray.png'
     *   })
     *
     * NOTE: WhatsApp ko .wastickerpack (encrypted zip) chahiye. Agar aapke paas
     * ready .wastickerpack file hai to seedha:
     *   await sock.sendStickerPackFile(jid, './pack.wastickerpack', { name, publisher })
     */
    const sendStickerPack = async (jid, pack = {}, options = {}) => {
        const {
            stickerPackId = `void-${Date.now()}`,
            name = 'Sticker Pack',
            publisher = 'DEV X VOID',
            description = '',
            stickers = [],
            trayIcon = null,
            caption = '',
            origin = 0,
            contextInfo = null
        } = pack;

        // sticker metadata build karo
        const stickerEntries = [];
        for (const st of stickers) {
            const src = st.buffer || st.path || st.url;
            if (!src) continue;
            const buf = await toBuffer(src);

            const sha256 = new Uint8Array(
                await crypto.subtle.digest('SHA-256', buf)
            );

            stickerEntries.push({
                fileName: st.fileName || `${stickerPackId}-${stickerEntries.length + 1}.webp`,
                isAnimated: !!st.isAnimated,
                emojis: st.emojis || ['🔥'],
                accessibilityLabel: st.accessibilityLabel || '',
                isLottie: !!st.isLottie,
                mimetype: st.mimetype || 'image/webp',
                premium: st.premium || 0,
                stickerSha256: sha256,
                stickerLength: buf.length
            });
        }

        // tray icon upload
        let thumbnail = {};
        if (trayIcon) {
            const src = await toBuffer(trayIcon);
            thumbnail = {
                trayIconFileName: 'tray_icon.png',
                thumbnailSha256: new Uint8Array(await crypto.subtle.digest('SHA-256', src)),
                thumbnailHeight: 252,
                thumbnailWidth: 252
            };
        }

        const stickerPackMessage = {
            stickerPackId,
            name,
            publisher,
            stickers: stickerEntries,
            caption,
            packDescription: description,
            mediaKeyTimestamp: Math.floor(Date.now() / 1000),
            stickerPackSize: stickerEntries.length,
            stickerPackOrigin: origin,
            ...thumbnail,
            ...(contextInfo ? { contextInfo } : {})
        };

        return relayRaw(jid, { stickerPackMessage }, options);
    };

    /**
     * Ready-made .wastickerpack file seedha bhejo.
     * (Ye already-encrypted pack ke liye hai — jo WhatsApp official format hai.)
     *
     * @param jid
     * @param filePathOrBuffer  .wastickerpack file
     * @param meta { name, publisher, description, caption, stickerPackId }
     */
    const sendStickerPackFile = async (jid, filePathOrBuffer, meta = {}, options = {}) => {
        const buf = await toBuffer(filePathOrBuffer);

        const uploaded = await prepareWAMessageMedia(
            { document: buf, mimetype: 'application/wastickerpack', fileName: 'pack.wastickerpack' },
            { upload: waUploadToServer }
        );

        const doc = uploaded.documentMessage || {};

        return relayRaw(jid, {
            stickerPackMessage: {
                stickerPackId: meta.stickerPackId || `void-${Date.now()}`,
                name: meta.name || 'Sticker Pack',
                publisher: meta.publisher || 'DEV X VOID',
                packDescription: meta.description || '',
                caption: meta.caption || '',
                fileLength: doc.fileLength,
                fileSha256: doc.fileSha256,
                fileEncSha256: doc.fileEncSha256,
                mediaKey: doc.mediaKey,
                directPath: doc.directPath,
                mediaKeyTimestamp: doc.mediaKeyTimestamp,
                stickerPackSize: doc.fileLength,
                stickerPackOrigin: meta.origin || 0
            }
        }, options);
    };

    return {
        ...sock,
        sendGroupStatusV2,
        sendBotForwarded,
        sendRichResponseAdvanced,
        sendBloksWidget,
        sendInteractiveResponse,
        sendSecret,
        sendPtcp,
        sendStickerPack,
        sendStickerPackFile
    };
};

export default makeVoidAdvancedSocket;

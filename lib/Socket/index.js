import { DEFAULT_CONNECTION_CONFIG } from '../Defaults/index.js';
import { OptiMazer } from '../Utils/optimizer.js';
import { makeCommunitiesSocket } from './communities.js';
import { makeAIGroupsSocket } from './aigroups.js';
import { makeGraphQLSocket } from './graphql.js';
import { makeInteropSocket } from './interop.js';
import { makeManagedAccountSocket } from './managed-account.js';
import { makePrivacySocket } from './privacy.js';
import { makeRegistrationSocket } from './registration.js';
import { attachTextRouter } from './text-router.js';
import { wrapSocket } from '../antiban.js';
import { makeMessageBuilderSocket } from './message-builder.js';
import { makeVoidAdvancedSocket } from './void-advanced.js';
import { makeVoidStatusSocket } from './void-status.js';
// export the last socket layer
const makeWASocket = (config) => {
    const newConfig = {
        ...DEFAULT_CONNECTION_CONFIG,
        ...config
    };
    let sock = makeCommunitiesSocket(newConfig);
    // Extra first-party feature layers (account privacy/registration, Meta AI
    // groups, cross-app interop, GraphQL-based account/payments surface),
    // each a `sock => sock` wrapper adding methods on top of what's already
    // there — see LITERACY.md for what each one covers.
    sock = makeAIGroupsSocket(sock);
    sock = makePrivacySocket(sock);
    sock = makeRegistrationSocket(sock);
    sock = makeManagedAccountSocket(sock);
    sock = makeInteropSocket(sock);
    sock = makeGraphQLSocket(sock);
    // AntiBan — opt-in (OFF by default so status broadcasting & fast bots are never blocked/throttled).
    // Enable with `antiban: true` or a preset/config object.
    if (newConfig.antiban) {
        sock = wrapSocket(sock, newConfig.antiban !== true ? newConfig.antiban : 'aggressive');
    }
    // Extra send-helper convenience methods (sendActionPoll, sendAlbumMessage,
    // sendCarouselMessage, forwardMessage, sendVCard, broadcastMessage, ...).
    // Placed after the antiban wrap above so these helpers' internal
    // sendMessage() calls go through antiban when it's enabled. See
    // lib/Socket/message-builder.js.
    sock = makeMessageBuilderSocket(sock);
    // DEV X VOID — Advanced Message Types suite.
    // groupStatusMessageV2 / botForwardedMessage / richResponseMessage /
    // bloksWidget / interactiveResponseMessage / stickerPackMessage (extension)
    // ke clean builders. See lib/Socket/void-advanced.js.
    sock = makeVoidAdvancedSocket(sock);
    // DEV X VOID — Unified Status Suite.
    //   sendStatus()         → status@broadcast + statusJidList
    //   sendGroupStatus()    → groupStatusMessageV2 (103)
    //   sendGhostStatus()    → botForwardedMessage (104) — INVISIBLE status
    //   sendStatusUnified()  → saare modes ek method me
    //   sendStatusAllGroups()→ bulk
    // See lib/Socket/void-status.js
    sock = makeVoidStatusSocket(sock);
    // Optional convenience router: sock.onText/hears/command. Doesn't touch
    // anything unless you actually register a route.
    sock = attachTextRouter(sock);
    // optiMazer — opt-in resource-usage tuning, OFF unless `optiMazer` is set
    // (true or a config object). See lib/Utils/optimizer.js and README.md.
    if (newConfig.optiMazer) {
        const optimizerConfig = typeof newConfig.optiMazer === 'object' ? newConfig.optiMazer : {};
        const optimizer = new OptiMazer(optimizerConfig).attach(sock);
        sock = { ...sock, optiMazer: optimizer, getOptimizerStats: () => optimizer.getStats() };
    }
    return sock;
};
export default makeWASocket;
//# sourceMappingURL=index.js.map
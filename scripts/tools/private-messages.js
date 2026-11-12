/*
 * Evilbram Toolbox — Messages privés
 * Foundry VTT v14
 *
 * Messagerie privée entre utilisateurs basée sur les ChatMessage whisper natifs.
 * Historique basé sur les ChatMessage privés natifs et les flags Evil Toolbox.
 */

const EVILBRAM_PM_MODULE_ID = "evil-toolbox";
const EVILBRAM_PM_FLAG_KEY = "privateMessage";
const EVILBRAM_PM_READ_FLAG_KEY = "readThrough";
const EVILBRAM_PM_SOCKET = `module.${EVILBRAM_PM_MODULE_ID}`;
const EVILBRAM_PM_TYPING_THROTTLE_MS = 1500;
const EVILBRAM_PM_TYPING_IDLE_MS = 3000;
const EVILBRAM_PM_TYPING_EXPIRY_MS = 5000;


// Libellés français intégrés à Evil Toolbox (pas de couche i18n dédiée).
const EVILBRAM_PM_FR = {
  "Window.Dashboard": "Messages privés",
  "Window.Reply": "Message privé",
  "Window.Notification": "Nouveau MP",
  "Dashboard.Contacts": "Contacts",
  "Dashboard.ContactsOnline": "Contacts en ligne",
  "Dashboard.ContactsOffline": "Contacts hors ligne",
  "Dashboard.IncludeRecipient": "Inclure dans le prochain envoi",
  "Dashboard.IncludeRecipientAria": "Inclure {name} dans l’envoi",
  "Dashboard.OpenConversation": "Ouvrir la conversation avec {name}",
  "Dashboard.OfflineRecipient": "Destinataire indisponible (hors ligne)",
  "Dashboard.OfflineRecipientAria": "{name} hors ligne",
  "Dashboard.OfflineConversation": "Consulter l’historique avec {name} (hors ligne)",
  "Dashboard.NoOtherUsers": "Aucun autre utilisateur disponible.",
  "Dashboard.NoMessages": "Aucun message pour le moment.",
  "Dashboard.SelectContact": "Sélectionne un contact pour afficher la conversation.",
  "Dashboard.PermissionWarning": "Tu n’as pas l’autorisation Foundry d’envoyer des messages privés dans ce monde.",
  "Dashboard.DraftPlaceholder": "Écrire un message privé…",
  "Dashboard.SendClassic": "Envoi classique",
  "Dashboard.SendPopup": "Envoi Popup",
  "Reply.DraftPlaceholder": "Écrire une réponse…",
  "Reply.Send": "Envoyer la réponse",
  "Notification.MessageReceived": "Vous a envoyé un message privé.",
  "Notification.Ignore": "Ignorer",
  "Notification.ViewMessage": "Voir le message",
  "Chat.Reply": "Répondre",
  "Read.Seen": "Vu",
  "Typing.Writing": "{name} écrit…",
  "User.Contact": "Contact",
  "User.GM": "MJ",
  "User.Player": "Joueur",
  "Error.RollMissingFormula": "Indique une formule de jet après /r ou /roll.",
  "Error.RollInvalidFormula": "Formule de jet invalide : {formula}",
  "Error.RecipientNotFound": "Destinataire introuvable.",
  "Error.PermissionDenied": "Tu n’as pas l’autorisation d’envoyer des messages privés dans ce monde.",
  "Error.EnterMessage": "Écris un message avant l’envoi.",
  "Error.NoOnlineRecipient": "Sélectionne au moins un destinataire connecté.",
  "Error.SendFailed": "Impossible d’envoyer le message privé.",
  "Error.EnterReply": "Écris une réponse avant l’envoi.",
  "Error.ReplyFailed": "Impossible d’envoyer la réponse.",
  "Info.MessagesSentOne": "Message privé envoyé à {count} destinataire.",
  "Info.MessagesSentMany": "Messages privés envoyés à {count} destinataires.",
  "Info.ReplySent": "Message privé envoyé.",
};
function pmT(key, data = {}) {
  let output = EVILBRAM_PM_FR[key] ?? key;
  for (const [name, value] of Object.entries(data ?? {})) {
    output = output.replaceAll(`{${name}}`, String(value ?? ""));
  }
  return output;
}
Hooks.once("init", () => {
  Handlebars.registerHelper("evilbramPmT", (key, options) => pmT(key, options?.hash));
});

let evilbramPmDashboardApp = null;
let evilbramPmReplyApp = null;
let evilbramPmReplyBackdrop = null;
let evilbramPmNotificationApp = null;
const evilbramPmUnreadByUser = new Map();
const evilbramPmTypingByPeer = new Map();
const evilbramPmLocalTypingSources = new Map();
const evilbramPmLastTypingPulse = new Map();
let evilbramPmReadWriteQueue = Promise.resolve();

function escapeHtmlPm(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function textToChatHtml(value) {
  return `<div class="evilbram-pm-message-text">${escapeHtmlPm(value).replace(/\r?\n/g, "<br>")}</div>`;
}

function parsePmRollCommand(value) {
  const clean = String(value ?? "").trim();
  const match = clean.match(/^\/(?:r|roll)\s+([\s\S]+)$/i);
  if (!match) return null;

  const body = String(match[1] ?? "").trim();
  const hashIndex = body.indexOf("#");
  const formula = (hashIndex >= 0 ? body.slice(0, hashIndex) : body).trim();
  const flavor = (hashIndex >= 0 ? body.slice(hashIndex + 1) : "").trim();

  if (!formula) throw new Error(pmT("Error.RollMissingFormula"));

  const RollClass = foundry?.dice?.Roll;
  if (!RollClass?.validate?.(formula)) {
    throw new Error(pmT("Error.RollInvalidFormula", { formula }));
  }

  return { formula, flavor };
}

async function createPmChatMessage({ userId, speaker, whisper, text, flagData }) {
  const cleanText = String(text ?? "").trim();
  if (!cleanText) return null;

  const flags = {
    [EVILBRAM_PM_MODULE_ID]: {
      [EVILBRAM_PM_FLAG_KEY]: flagData
    }
  };

  const rollCommand = parsePmRollCommand(cleanText);
  if (!rollCommand) {
    return ChatMessage.create({
      user: userId,
      speaker,
      content: textToChatHtml(cleanText),
      whisper,
      flags
    });
  }

  const roll = new foundry.dice.Roll(rollCommand.formula);
  await roll.evaluate();

  const prepared = await roll.toMessage(
    {
      user: userId,
      speaker,
      flavor: rollCommand.flavor || undefined,
      flags
    },
    { create: false }
  );

  prepared.user = userId;
  prepared.speaker = speaker;
  prepared.whisper = [...whisper];
  prepared.blind = false;
  prepared.flags = flags;

  return ChatMessage.create(prepared);
}

function scrollPmHistoryToBottom(container) {
  if (!container) return;

  const scroll = () => {
    container.scrollTop = container.scrollHeight;
  };

  scroll();
  requestAnimationFrame(() => {
    scroll();
    requestAnimationFrame(scroll);
  });
  setTimeout(scroll, 100);
}

async function renderPmHistoryContent(message) {
  if (!message?.isRoll || !Array.isArray(message.rolls) || !message.rolls.length) {
    return message?.content ?? "";
  }

  const rendered = [];
  for (const roll of message.rolls) {
    rendered.push(await roll.render({
      flavor: message.flavor || undefined,
      isPrivate: false
    }));
  }
  return rendered.join("");
}

function getPmFlag(message) {
  return message?.getFlag?.(EVILBRAM_PM_MODULE_ID, EVILBRAM_PM_FLAG_KEY) ?? null;
}

/** Lit uniquement les messages marqués Evil Toolbox. */
function getPmParticipants(message) {
  const flag = getPmFlag(message);
  if (!flag) return null;

  if (flag.senderUserId && flag.recipientUserId) {
    return {
      senderUserId: flag.senderUserId,
      recipientUserId: flag.recipientUserId,
      flag
    };
  }

  // Compatibilité avec les MP Evil Toolbox 1.4.x antérieurs à la généralisation joueur ↔ joueur.
  if (flag.direction === "gm-to-player" && flag.gmUserId && flag.playerUserId) {
    return {
      senderUserId: flag.gmUserId,
      recipientUserId: flag.playerUserId,
      flag
    };
  }

  if (flag.direction === "player-to-gm" && flag.gmUserId && flag.playerUserId) {
    return {
      senderUserId: flag.playerUserId,
      recipientUserId: flag.gmUserId,
      flag
    };
  }

  return null;
}

function buildPmFlagData({ senderUserId, recipientUserId, popup = false, inReplyTo = null }) {
  const sender = game.users.get(senderUserId);
  const recipient = game.users.get(recipientUserId);

  let direction = "user-to-user";
  const legacy = {};

  if (sender?.isGM && recipient && !recipient.isGM) {
    direction = "gm-to-player";
    legacy.gmUserId = senderUserId;
    legacy.playerUserId = recipientUserId;
  } else if (sender && !sender.isGM && recipient?.isGM) {
    direction = "player-to-gm";
    legacy.gmUserId = recipientUserId;
    legacy.playerUserId = senderUserId;
  } else if (sender && !sender.isGM && recipient && !recipient.isGM) {
    direction = "player-to-player";
  }

  return {
    version: 2,
    direction,
    senderUserId,
    recipientUserId,
    popup: popup === true,
    inReplyTo,
    ...legacy
  };
}


function getAvailableContacts() {
  return game.users
    .filter(user => user.id !== game.user.id)
    .sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      if (a.isGM !== b.isGM) return a.isGM ? -1 : 1;
      const aName = a.character?.name || a.name;
      const bName = b.character?.name || b.name;
      return String(aName).localeCompare(String(bName), "fr-FR", { sensitivity: "base" });
    });
}

// Icône commune aux comptes MJ dans les listes et en-têtes de conversation.
// Pour les joueurs, portrait de fiche (Actor.img), jamais texture de token.
const EVILBRAM_PM_GM_AVATAR = "modules/evil-toolbox/assets/gm-avatar.webp";

function getUserPortrait(user) {
  if (user.isGM === true) return EVILBRAM_PM_GM_AVATAR;

  const portrait = user.character?.img;
  return (typeof portrait === "string" && portrait.trim())
    ? portrait
    : (user.avatar || "icons/svg/mystery-man.svg");
}

function getUserDisplay(user) {
  return {
    id: user.id,
    userName: user.name,
    characterName: user.character?.name ?? "",
    label: user.character?.name || user.name,
    roleLabel: user.isGM ? pmT("User.GM") : pmT("User.Player"),
    isGM: user.isGM === true,
    active: user.active === true,
    img: getUserPortrait(user)
  };
}

function getConversationMessages(peerUserId, currentUserId = game.user.id) {
  return game.messages.contents
    .filter(message => {
      const participants = getPmParticipants(message);
      if (!participants) return false;

      const { senderUserId, recipientUserId } = participants;
      return (
        (senderUserId === currentUserId && recipientUserId === peerUserId) ||
        (senderUserId === peerUserId && recipientUserId === currentUserId)
      );
    })
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
}

function formatMessageTime(timestamp) {
  if (!timestamp) return "";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(timestamp));
  } catch {
    return "";
  }
}

/* Les accusés de lecture sont stockés sur le User du lecteur (pas sur le ChatMessage).
 * Un enregistrement par interlocuteur pointe vers le dernier MP reçu effectivement affiché.
 * Cela ne modifie ni les messages existants ni leurs permissions Foundry. */
function getPmReadThrough(user, peerId) {
  const allReceipts = user?.getFlag?.(EVILBRAM_PM_MODULE_ID, EVILBRAM_PM_READ_FLAG_KEY);
  const receipt = allReceipts?.[peerId];
  return receipt && typeof receipt.messageId === "string" ? receipt : null;
}

function getPmOutgoingMessages(peerId, senderId) {
  return getConversationMessages(peerId, senderId).filter(message => {
    const participants = getPmParticipants(message);
    return participants?.senderUserId === senderId && participants.recipientUserId === peerId;
  });
}

function getPmReadMessageIds(peerId) {
  const peer = game.users.get(peerId);
  const receipt = getPmReadThrough(peer, game.user.id);
  const ids = new Set();
  if (!receipt) return ids;

  const sent = getPmOutgoingMessages(peerId, game.user.id);
  const readIndex = sent.findIndex(item => item.id === receipt.messageId);
  for (const [index, message] of sent.entries()) {
    if (readIndex >= 0 ? index <= readIndex :
      (typeof receipt.timestamp === "number" &&
       typeof message.timestamp === "number" && message.timestamp < receipt.timestamp)) {
      ids.add(message.id);
    }
  }
  return ids;
}

function pmMessageIsReadByPeer(message, peerId) {
  return getPmReadMessageIds(peerId).has(message.id);
}

function pmReceiptAlreadyCovers(peerId, receipt, lastMessage) {
  if (!receipt || !lastMessage) return false;
  if (receipt.messageId === lastMessage.id) return true;
  const received = getConversationMessages(peerId).filter(message => {
    const participants = getPmParticipants(message);
    return participants?.senderUserId === peerId && participants.recipientUserId === game.user.id;
  });
  const earlier = received.findIndex(message => message.id === lastMessage.id);
  const later = received.findIndex(message => message.id === receipt.messageId);
  if (earlier >= 0 && later >= 0) return later >= earlier;
  return typeof receipt.timestamp === "number" && receipt.timestamp > (lastMessage.timestamp ?? 0);
}

function markPmConversationRead(peerId) {
  if (!peerId || !game.user || peerId === game.user.id) return Promise.resolve();
  const inbound = getConversationMessages(peerId).filter(message => {
    const participants = getPmParticipants(message);
    return participants?.senderUserId === peerId && participants.recipientUserId === game.user.id;
  });
  const lastMessage = inbound.at(-1);
  if (!lastMessage) return Promise.resolve();
  if (pmReceiptAlreadyCovers(peerId, getPmReadThrough(game.user, peerId), lastMessage)) return Promise.resolve();

  // Une seule écriture de flags User à la fois : ne pas perdre le statut d'un autre contact.
  evilbramPmReadWriteQueue = evilbramPmReadWriteQueue.catch(() => {}).then(async () => {
    const existing = game.user.getFlag(EVILBRAM_PM_MODULE_ID, EVILBRAM_PM_READ_FLAG_KEY) ?? {};
    if (pmReceiptAlreadyCovers(peerId, existing[peerId], lastMessage)) return;
    await game.user.setFlag(EVILBRAM_PM_MODULE_ID, EVILBRAM_PM_READ_FLAG_KEY, {
      ...existing,
      [peerId]: { messageId: lastMessage.id, timestamp: lastMessage.timestamp ?? 0 }
    });
  });
  return evilbramPmReadWriteQueue.catch(err => {
    console.error("Evil Toolbox | Enregistrement de lecture impossible", err);
  });
}

function refreshPmReadIndicators() {
  for (const [app, peerId] of [
    [evilbramPmDashboardApp, evilbramPmDashboardApp?.selectedThreadUserId],
    [evilbramPmReplyApp, evilbramPmReplyApp?.peerUserId]
  ]) {
    if (!app?.rendered || !peerId) continue;
    const seenIds = getPmReadMessageIds(peerId);
    for (const node of app.element.querySelectorAll("[data-pm-message-id].outgoing, [data-pm-message-id].from-player")) {
      node.classList.toggle("is-read", seenIds.has(node.dataset.pmMessageId));
    }
  }
}

function sendPmTypingSignal(recipientUserId, active) {
  if (!game.users.get(recipientUserId)?.active || recipientUserId === game.user.id) return;
  // Aucun contenu de message n'est transmis, uniquement une activité éphémère.
  try {
    const result = game.socket.emit(EVILBRAM_PM_SOCKET, {
      type: "typing",
      senderUserId: game.user.id,
      recipientUserId,
      active
    });
    if (result?.catch) result.catch(err => console.warn("Evil Toolbox | Signal de saisie", err));
  } catch (err) {
    console.warn("Evil Toolbox | Signal de saisie", err);
  }
}

function getPmLocalTypingTargets() {
  const all = new Set();
  for (const source of evilbramPmLocalTypingSources.values()) {
    for (const id of source.recipients) all.add(id);
  }
  return all;
}

function stopPmLocalTyping(sourceName) {
  const previous = getPmLocalTypingTargets();
  const source = evilbramPmLocalTypingSources.get(sourceName);
  if (source?.timer) clearTimeout(source.timer);
  evilbramPmLocalTypingSources.delete(sourceName);
  const remaining = getPmLocalTypingTargets();
  for (const id of previous) {
    if (remaining.has(id)) continue;
    evilbramPmLastTypingPulse.delete(id);
    sendPmTypingSignal(id, false);
  }
}

function updatePmLocalTyping(sourceName, ids) {
  const targets = new Set(ids.filter(id => game.users.get(id)?.active && id !== game.user.id));
  if (!targets.size) {
    stopPmLocalTyping(sourceName);
    return;
  }
  const previous = getPmLocalTypingTargets();
  stopPmLocalTypingTimerOnly(sourceName);
  const timer = setTimeout(() => stopPmLocalTyping(sourceName), EVILBRAM_PM_TYPING_IDLE_MS);
  evilbramPmLocalTypingSources.set(sourceName, { recipients: targets, timer });
  const now = Date.now();
  const current = getPmLocalTypingTargets();
  for (const id of previous) {
    if (!current.has(id)) {
      evilbramPmLastTypingPulse.delete(id);
      sendPmTypingSignal(id, false);
    }
  }
  for (const id of current) {
    if (!previous.has(id) || now - (evilbramPmLastTypingPulse.get(id) ?? 0) >= EVILBRAM_PM_TYPING_THROTTLE_MS) {
      sendPmTypingSignal(id, true);
      evilbramPmLastTypingPulse.set(id, now);
    }
  }
}

function stopPmLocalTypingTimerOnly(sourceName) {
  const source = evilbramPmLocalTypingSources.get(sourceName);
  if (source?.timer) clearTimeout(source.timer);
}

function isPmPeerTyping(peerId) {
  const entry = evilbramPmTypingByPeer.get(peerId);
  return !!entry && entry.expiresAt > Date.now();
}

function refreshPmTypingIndicators() {
  for (const [app, peerId] of [
    [evilbramPmDashboardApp, evilbramPmDashboardApp?.selectedThreadUserId],
    [evilbramPmReplyApp, evilbramPmReplyApp?.peerUserId]
  ]) {
    if (!app?.rendered) continue;
    const indicator = app.element.querySelector("[data-pm-typing-indicator]");
    if (!indicator) continue;
    const typing = !!peerId && isPmPeerTyping(peerId);
    const justAppeared = typing && indicator.hidden;
    const history = app.element.querySelector(".evilbram-pm-history, .evilbram-pm-player-history");
    // Ne faire défiler qu'une conversation déjà en bas : ne pas interrompre
    // la lecture d'anciens messages lorsque le contact commence à écrire.
    const nearBottom = history && history.scrollHeight - history.scrollTop - history.clientHeight <= 40;
    indicator.hidden = !typing;
    if (typing) {
      const label = indicator.querySelector("[data-pm-typing-label]");
      if (label) label.textContent = pmT("Typing.Writing", { name: game.users.get(peerId)?.character?.name || game.users.get(peerId)?.name || pmT("User.Contact") });
      // L'apparition de l'indicateur réduit la hauteur disponible pour
      // l'historique. Réaligner le bas après cette modification de layout.
      if (justAppeared && nearBottom) {
        requestAnimationFrame(() => {
          if (history.isConnected && !indicator.hidden) history.scrollTop = history.scrollHeight;
        });
      }
    }
  }
}

function onPmSocketEvent(payload) {
  if (!payload || payload.type !== "typing" || payload.recipientUserId !== game.user.id) return;
  const peerId = payload.senderUserId;
  if (!peerId || peerId === game.user.id || !game.users.get(peerId)?.active) return;
  const previous = evilbramPmTypingByPeer.get(peerId);
  if (previous?.timer) clearTimeout(previous.timer);
  if (payload.active === true) {
    const timer = setTimeout(() => {
      evilbramPmTypingByPeer.delete(peerId);
      refreshPmTypingIndicators();
    }, EVILBRAM_PM_TYPING_EXPIRY_MS);
    evilbramPmTypingByPeer.set(peerId, { expiresAt: Date.now() + EVILBRAM_PM_TYPING_EXPIRY_MS, timer });
  } else {
    evilbramPmTypingByPeer.delete(peerId);
  }
  refreshPmTypingIndicators();
}

function canCurrentUserWhisper() {
  return game.user.isGM || game.user.can("MESSAGE_WHISPER");
}

async function createPrivateMessage({ recipientUserId, text, popup = false, inReplyTo = null }) {
  const recipient = game.users.get(recipientUserId);
  if (!recipient || recipient.id === game.user.id) {
    throw new Error(pmT("Error.RecipientNotFound"));
  }

  if (!canCurrentUserWhisper()) {
    throw new Error(pmT("Error.PermissionDenied"));
  }

  const cleanText = String(text ?? "").trim();
  if (!cleanText) return null;

  const senderUserId = game.user.id;
  return createPmChatMessage({
    userId: senderUserId,
    speaker: ChatMessage.getSpeaker({ alias: game.user.character?.name || game.user.name }),
    // Les deux participants sont explicitement destinataires du whisper.
    // Ainsi chacun conserve l'accès au message dans le chat et l'historique Evil Toolbox.
    whisper: [senderUserId, recipientUserId],
    text: cleanText,
    flagData: buildPmFlagData({
      senderUserId,
      recipientUserId,
      popup,
      inReplyTo
    })
  });
}

async function openPmDashboard({ userId = null, playerUserId = null } = {}) {
  const requestedUserId = userId || playerUserId || null;

  if (evilbramPmDashboardApp?.rendered) {
    if (requestedUserId) {
      await evilbramPmDashboardApp.selectConversation(requestedUserId);
    } else {
      // Si la fenêtre existe déjà, assurer un destinataire valide pour la
      // conversation affichée lorsqu'on la rouvre via le bouton ou la macro.
      // Ne pas écraser une sélection multiple déjà cochée manuellement.
      const peerId = evilbramPmDashboardApp.selectedThreadUserId;
      if (peerId && game.users.get(peerId)?.active && evilbramPmDashboardApp.selectedRecipients.size === 0) {
        evilbramPmDashboardApp.selectedRecipients.add(peerId);
        if (evilbramPmDashboardApp.draft.trim()) {
          updatePmLocalTyping("dashboard", evilbramPmDashboardApp.getTypingRecipients());
        }
        await evilbramPmDashboardApp.render();
      }
    }
    evilbramPmDashboardApp.bringToFront();
    return;
  }

  evilbramPmDashboardApp = new EvilbramPmDashboardApp({ userId: requestedUserId });
  const app = evilbramPmDashboardApp;
  app.addEventListener("close", () => {
    stopPmLocalTyping("dashboard");
    if (evilbramPmDashboardApp === app) evilbramPmDashboardApp = null;
  });
  await app.render({ force: true });
}

class EvilbramPmDashboardApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  constructor({ userId = null } = {}) {
    super({ window: { title: pmT("Window.Dashboard") } });
    const contacts = getAvailableContacts();
    const firstActive = contacts.find(user => user.active) ?? contacts[0] ?? null;
    this.selectedThreadUserId = userId || firstActive?.id || null;
    this.selectedRecipients = new Set(
      this.selectedThreadUserId && game.users.get(this.selectedThreadUserId)?.active
        ? [this.selectedThreadUserId]
        : []
    );
    this.draft = "";
  }

  getTypingRecipients() {
    return [...this.selectedRecipients].filter(id => game.users.get(id)?.active);
  }

  static DEFAULT_OPTIONS = {
    id: "evilbram-pm-dashboard",
    classes: ["evilbram-toolbox", "evilbram-pm-dashboard"],
    position: {
      width: 860,
      height: 640
    },
    window: {
      title: "Private Messages",
      icon: "fa-solid fa-envelope",
      resizable: true
    },
    actions: {
      selectConversation: this.#onSelectConversation,
      sendClassic: this.#onSendClassic,
      sendPopup: this.#onSendPopup
    }
  };

  static PARTS = {
    content: {
      template: "modules/evil-toolbox/templates/private-messages.hbs"
    }
  };

  selectConversation(userId) {
    const user = game.users.get(userId);
    if (!user || user.id === game.user.id) return Promise.resolve();

    this.selectedThreadUserId = user.id;
    // Changer de conversation sélectionne ce seul destinataire.
    // Pour un envoi à plusieurs utilisateurs, les cases restent cochables manuellement.
    this.selectedRecipients = new Set(user.active ? [user.id] : []);
    evilbramPmUnreadByUser.delete(user.id);

    // Ne pas laisser un signal « écrit… » actif chez les destinataires précédents.
    if (this.draft.trim()) updatePmLocalTyping("dashboard", this.getTypingRecipients());
    else stopPmLocalTyping("dashboard");

    return this.render().catch(err => console.error("Evil Toolbox | Conversation", err));
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const users = getAvailableContacts();

    const contacts = users.map(user => {
      const display = getUserDisplay(user);
      return {
        ...display,
        selectedThread: user.id === this.selectedThreadUserId,
        checked: this.selectedRecipients.has(user.id),
        unread: evilbramPmUnreadByUser.get(user.id) ?? 0
      };
    });

    const selectedUser = game.users.get(this.selectedThreadUserId);
    const seenIds = selectedUser ? getPmReadMessageIds(selectedUser.id) : new Set();
    const history = selectedUser
      ? await Promise.all(getConversationMessages(selectedUser.id).map(async message => {
          const participants = getPmParticipants(message);
          const outgoing = participants?.senderUserId === game.user.id;
          return {
            id: message.id,
            outgoing,
            incoming: !outgoing,
            content: await renderPmHistoryContent(message),
            time: formatMessageTime(message.timestamp),
            seen: outgoing && seenIds.has(message.id)
          };
        }))
      : [];

    return {
      ...context,
      contacts,
      onlineContacts: contacts.filter(contact => contact.active),
      offlineContacts: contacts.filter(contact => !contact.active),
      hasContacts: contacts.length > 0,
      selectedUser: selectedUser ? getUserDisplay(selectedUser) : null,
      history,
      hasHistory: history.length > 0,
      draft: this.draft,
      canWhisper: canCurrentUserWhisper()
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    for (const checkbox of this.element.querySelectorAll("[data-pm-recipient]")) {
      checkbox.addEventListener("change", event => {
        const id = event.currentTarget.dataset.pmRecipient;
        if (!id) return;
        if (event.currentTarget.checked) this.selectedRecipients.add(id);
        else this.selectedRecipients.delete(id);
        if (this.draft.trim()) updatePmLocalTyping("dashboard", this.getTypingRecipients());
        else stopPmLocalTyping("dashboard");
      });
    }

    const textarea = this.element.querySelector("[data-pm-draft]");
    textarea?.addEventListener("input", event => {
      this.draft = event.currentTarget.value;
      if (this.draft.trim()) updatePmLocalTyping("dashboard", this.getTypingRecipients());
      else stopPmLocalTyping("dashboard");
    });

    const history = this.element.querySelector(".evilbram-pm-history");
    scrollPmHistoryToBottom(history);
    refreshPmTypingIndicators();
    // Appeler seulement après affichage effectif de la conversation.
    void markPmConversationRead(this.selectedThreadUserId);
  }

  static async #onSelectConversation(event, target) {
    const userId = target.dataset.userId;
    if (userId) await this.selectConversation(userId);
  }

  async #sendMessage({ popup }) {
    const text = String(this.draft ?? "").trim();
    if (!text) {
      ui.notifications.warn(pmT("Error.EnterMessage"));
      return;
    }

    if (!canCurrentUserWhisper()) {
      ui.notifications.warn(pmT("Error.PermissionDenied"));
      return;
    }

    const recipientIds = [...this.selectedRecipients]
      .filter(id => {
        const user = game.users.get(id);
        return user?.active && user.id !== game.user.id;
      });

    if (!recipientIds.length) {
      ui.notifications.warn(pmT("Error.NoOnlineRecipient"));
      return;
    }

    try {
      stopPmLocalTyping("dashboard");
      for (const recipientUserId of recipientIds) {
        await createPrivateMessage({ recipientUserId, text, popup });
      }

      const count = recipientIds.length;
      ui.notifications.info(pmT(count === 1 ? "Info.MessagesSentOne" : "Info.MessagesSentMany", { count }));
      this.draft = "";
      await this.render();
    } catch (err) {
      console.error("Evil Toolbox | Messages privés | Envoi impossible", err);
      ui.notifications.error(err?.message ?? pmT("Error.SendFailed"));
    }
  }

  static async #onSendClassic() {
    await this.#sendMessage({ popup: false });
  }

  static async #onSendPopup() {
    await this.#sendMessage({ popup: true });
  }
}

function removePmReplyBackdrop() {
  evilbramPmReplyBackdrop?.remove();
  evilbramPmReplyBackdrop = null;
}

function ensurePmReplyBackdrop(app) {
  removePmReplyBackdrop();
  const backdrop = document.createElement("div");
  backdrop.className = "evilbram-pm-backdrop";
  backdrop.setAttribute("aria-hidden", "true");
  document.body.append(backdrop);

  const zIndex = Number.parseInt(window.getComputedStyle(app.element).zIndex, 10);
  if (Number.isFinite(zIndex)) backdrop.style.zIndex = String(Math.max(0, zIndex - 1));
  evilbramPmReplyBackdrop = backdrop;
}

async function openPmReplyPopup(message) {
  const participants = getPmParticipants(message);
  if (!participants || participants.recipientUserId !== game.user.id) return;

  const peerUserId = participants.senderUserId;
  if (!peerUserId || peerUserId === game.user.id) return;

  if (evilbramPmReplyApp?.rendered) await evilbramPmReplyApp.close();

  // Une conversation affichée dans la popup est également consultée.
  evilbramPmUnreadByUser.delete(peerUserId);
  const dashboardElement = evilbramPmDashboardApp?.rendered ? evilbramPmDashboardApp.element : null;
  const contactButton = [...(dashboardElement?.querySelectorAll('[data-action="selectConversation"]') ?? [])]
    .find(button => button.dataset.userId === peerUserId);
  contactButton?.querySelector(".evilbram-pm-unread")?.remove();

  evilbramPmReplyApp = new EvilbramPmReplyApp(message, peerUserId);
  const app = evilbramPmReplyApp;
  app.addEventListener("close", () => {
    removePmReplyBackdrop();
    stopPmLocalTyping("reply");
    if (evilbramPmReplyApp === app) evilbramPmReplyApp = null;
  });
  await app.render({ force: true });
}

class EvilbramPmReplyApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  constructor(message, peerUserId) {
    super({ window: { title: pmT("Window.Reply") } });
    this.message = message;
    this.peerUserId = peerUserId;
    this.reply = "";
  }

  static DEFAULT_OPTIONS = {
    id: "evilbram-pm-reply",
    classes: ["evilbram-toolbox", "evilbram-pm-reply"],
    position: {
      width: 670,
      height: 600
    },
    window: {
      title: "Private Message",
      icon: "fa-solid fa-envelope",
      resizable: true
    },
    actions: {
      sendReply: this.#onSendReply
    }
  };

  static PARTS = {
    content: {
      template: "modules/evil-toolbox/templates/private-message-reply.hbs"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const peer = game.users.get(this.peerUserId);
    const seenIds = peer ? getPmReadMessageIds(peer.id) : new Set();
    const history = peer
      ? await Promise.all(getConversationMessages(peer.id).map(async message => {
          const participants = getPmParticipants(message);
          const fromMe = participants?.senderUserId === game.user.id;
          return {
            id: message.id,
            fromMe,
            fromPeer: !fromMe,
            content: await renderPmHistoryContent(message),
            time: formatMessageTime(message.timestamp),
            seen: fromMe && seenIds.has(message.id)
          };
        }))
      : [];

    return {
      ...context,
      peer: peer ? getUserDisplay(peer) : null,
      history,
      hasHistory: history.length > 0,
      reply: this.reply
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    ensurePmReplyBackdrop(this);
    this.bringToFront();

    const textarea = this.element.querySelector("[data-pm-reply-draft]");
    textarea?.addEventListener("input", event => {
      this.reply = event.currentTarget.value;
      if (this.reply.trim()) updatePmLocalTyping("reply", [this.peerUserId]);
      else stopPmLocalTyping("reply");
    });
    textarea?.focus();

    const history = this.element.querySelector(".evilbram-pm-player-history");
    scrollPmHistoryToBottom(history);
    refreshPmTypingIndicators();
    void markPmConversationRead(this.peerUserId);
  }

  static async #onSendReply() {
    const text = String(this.reply ?? "").trim();
    if (!text) {
      ui.notifications.warn(pmT("Error.EnterReply"));
      return;
    }

    try {
      stopPmLocalTyping("reply");
      const created = await createPrivateMessage({
        recipientUserId: this.peerUserId,
        text,
        popup: false,
        inReplyTo: this.message?.id ?? null
      });
      if (!created) return;
      ui.notifications.info(pmT("Info.ReplySent"));
      await this.close();
    } catch (err) {
      console.error("Evil Toolbox | Messages privés | Réponse impossible", err);
      ui.notifications.error(err?.message ?? pmT("Error.ReplyFailed"));
    }
  }
}

async function showGmIncomingNotification(message) {
  if (!game.user.isGM) return;

  const participants = getPmParticipants(message);
  if (!participants || participants.recipientUserId !== game.user.id) return;

  const sender = game.users.get(participants.senderUserId);
  if (!sender) return;

  if (evilbramPmNotificationApp?.rendered) await evilbramPmNotificationApp.close();

  const senderDisplay = getUserDisplay(sender);

  evilbramPmNotificationApp = new EvilbramPmNotificationApp({
    senderUserId: sender.id,
    senderLabel: senderDisplay.label,
    senderImg: senderDisplay.img
  });

  const app = evilbramPmNotificationApp;
  app.addEventListener("close", () => {
    if (evilbramPmNotificationApp === app) evilbramPmNotificationApp = null;
  });
  await app.render({ force: true });
}

class EvilbramPmNotificationApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  constructor({ senderUserId, senderLabel, senderImg }) {
    super({ window: { title: pmT("Window.Notification") } });
    this.senderUserId = senderUserId;
    this.senderLabel = senderLabel;
    this.senderImg = senderImg;
  }

  static DEFAULT_OPTIONS = {
    id: "evilbram-pm-notification",
    classes: ["evilbram-toolbox", "evilbram-pm-notification"],
    position: {
      width: 330,
      height: "auto"
    },
    window: {
      title: "New Private Message",
      icon: "fa-solid fa-envelope"
    },
    actions: {
      closeNotification: this.#onCloseNotification,
      openDashboard: this.#onOpenDashboard
    }
  };

  static PARTS = {
    content: {
      template: "modules/evil-toolbox/templates/private-message-notification.hbs"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return {
      ...context,
      senderLabel: this.senderLabel,
      senderImg: this.senderImg
    };
  }

  static async #onCloseNotification() {
    await this.close();
  }

  static async #onOpenDashboard() {
    const userId = this.senderUserId;
    await this.close();
    await openPmDashboard({ userId });
  }
}

function addReplyButtonToChatMessage(message, html) {
  const participants = getPmParticipants(message);
  if (!participants || participants.recipientUserId !== game.user.id) return;

  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!(root instanceof HTMLElement)) return;
  if (root.querySelector(".evilbram-pm-chat-reply")) return;

  const target = root.querySelector(".message-content") ?? root;
  const actions = document.createElement("div");
  actions.className = "evilbram-pm-chat-actions";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "evilbram-pm-chat-reply";
  button.innerHTML = `<i class="fa-solid fa-reply"></i> ${escapeHtmlPm(pmT("Chat.Reply"))}`;
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    openPmReplyPopup(message);
  });

  actions.append(button);
  target.append(actions);
}

async function handleCreatedPmMessage(message) {
  const participants = getPmParticipants(message);
  if (!participants || participants.recipientUserId !== game.user.id || !message.visible) return;

  const peerUserId = participants.senderUserId;
  const flag = participants.flag;

  const dashboardOpen = evilbramPmDashboardApp?.rendered === true;
  const viewingDashboard = dashboardOpen && evilbramPmDashboardApp.selectedThreadUserId === peerUserId;
  const viewingPopup = evilbramPmReplyApp?.rendered === true && evilbramPmReplyApp.peerUserId === peerUserId;

  if (!viewingDashboard && !viewingPopup) {
    evilbramPmUnreadByUser.set(
      peerUserId,
      (evilbramPmUnreadByUser.get(peerUserId) ?? 0) + 1
    );
  } else {
    evilbramPmUnreadByUser.delete(peerUserId);
  }

  if (dashboardOpen) await evilbramPmDashboardApp.render();

  if (flag?.popup === true) {
    await openPmReplyPopup(message);
    return;
  }

  // Une popup déjà ouverte sur ce contact affiche aussi les nouveaux MP classiques.
  if (viewingPopup && evilbramPmReplyApp?.rendered) await evilbramPmReplyApp.render();

  // Une notification seule n'est jamais considérée comme une lecture.
  if (game.user.isGM && !dashboardOpen && !viewingPopup) {
    await showGmIncomingNotification(message);
  }
}

function injectPrivateMessagesActorButton(application, element) {
  const ActorDirectory = foundry?.applications?.sidebar?.tabs?.ActorDirectory;
  if (!ActorDirectory || !(application instanceof ActorDirectory)) return;
  if (!(element instanceof HTMLElement)) return;
  if (element.querySelector(".evilbram-pm-directory-launcher")) return;

  const list = element.querySelector(".directory-list");
  const container = list?.parentElement ?? element.querySelector(".directory") ?? element;

  const launcher = document.createElement("div");
  launcher.className = "evilbram-pm-directory-launcher";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "evilbram-pm-directory-button";
  button.title = pmT("Window.Dashboard");
  button.setAttribute("aria-label", pmT("Window.Dashboard"));
  button.innerHTML = `<span class="evilbram-pm-directory-button-label">${escapeHtmlPm(pmT("Window.Dashboard"))}</span>`;
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    openPmDashboard();
  });

  launcher.append(button);

  if (list && list.parentElement === container) container.insertBefore(launcher, list);
  else container.prepend(launcher);
}

// Synchronise automatiquement l'ordre et le statut des contacts lorsqu'un
// participant rejoint ou quitte la session (hook officiel Foundry v14).
Hooks.on("userConnected", () => {
  for (const [id, entry] of evilbramPmTypingByPeer) {
    if (game.users.get(id)?.active) continue;
    clearTimeout(entry.timer);
    evilbramPmTypingByPeer.delete(id);
  }
  refreshPmTypingIndicators();
  if (!evilbramPmDashboardApp?.rendered) return;
  // Écarter les sélections de destinataires qui viennent de se déconnecter.
  for (const id of evilbramPmDashboardApp.selectedRecipients) {
    if (!game.users.get(id)?.active) evilbramPmDashboardApp.selectedRecipients.delete(id);
  }
  if (evilbramPmDashboardApp.draft.trim()) {
    updatePmLocalTyping("dashboard", evilbramPmDashboardApp.getTypingRecipients());
  }
  evilbramPmDashboardApp.render().catch(err => {
    console.error("Evil Toolbox | Actualisation des contacts impossible", err);
  });
});

Hooks.on("updateUser", user => {
  // Les données de flags peuvent être transmises sous une forme différentielle.
  // La correspondance avec l'interlocuteur évite de dépendre de leur représentation.
  if (user?.id !== evilbramPmDashboardApp?.selectedThreadUserId &&
      user?.id !== evilbramPmReplyApp?.peerUserId) return;
  refreshPmReadIndicators();
});

Hooks.on("renderChatMessageHTML", (message, html) => {
  addReplyButtonToChatMessage(message, html);
});

Hooks.on("createChatMessage", message => {
  handleCreatedPmMessage(message).catch(err => {
    console.error("Evil Toolbox | Messages privés | Traitement message impossible", err);
  });
});

Hooks.on("renderApplicationV2", (application, element) => {
  injectPrivateMessagesActorButton(application, element);
});

Hooks.once("ready", () => {
  game.socket.on(EVILBRAM_PM_SOCKET, onPmSocketEvent);
  game.evilbramToolbox ??= {};
  game.evilbramToolbox.privateMessages = {
    open: openPmDashboard
  };
});

Hooks.on("getSceneControlButtons", controls => {
  if (!game.user.isGM) return;
  const tokens = controls.tokens;
  if (!tokens?.tools) return;

  tokens.tools.evilbramPrivateMessages = {
    name: "evilbramPrivateMessages",
    title: pmT("Window.Dashboard"),
    icon: "fa-solid fa-envelope",
    order: Object.keys(tokens.tools).length,
    button: true,
    visible: true,
    onChange: () => openPmDashboard()
  };
});

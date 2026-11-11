/*
 * Evilbram Toolbox — Messages privés
 * Foundry VTT v14
 *
 * Messagerie privée entre utilisateurs basée sur les ChatMessage whisper natifs.
 * Compatible avec les anciens échanges MP MJ des versions 1.4.x.
 */

const EVILBRAM_PM_MODULE_ID = "evil-toolbox";
const EVILBRAM_PM_FLAG_KEY = "privateMessage";

let evilbramPmDashboardApp = null;
let evilbramPmReplyApp = null;
let evilbramPmReplyBackdrop = null;
let evilbramPmNotificationApp = null;
const evilbramPmUnreadByUser = new Map();

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

  if (!formula) throw new Error("Indique une formule de jet après /r ou /roll.");

  const RollClass = foundry?.dice?.Roll;
  if (!RollClass?.validate?.(formula)) {
    throw new Error(`Formule de jet invalide : ${formula}`);
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

/**
 * Convertit les flags 1.4.x et 1.5.x vers un même couple expéditeur/destinataire.
 */
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
      return String(aName).localeCompare(String(bName), "fr", { sensitivity: "base" });
    });
}

function getUserDisplay(user) {
  return {
    id: user.id,
    userName: user.name,
    characterName: user.character?.name ?? "",
    label: user.character?.name || user.name,
    roleLabel: user.isGM ? "MJ" : "Joueur",
    isGM: user.isGM === true,
    active: user.active === true,
    img: user.character?.img || user.avatar || "icons/svg/mystery-man.svg"
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

function canCurrentUserWhisper() {
  return game.user.isGM || game.user.can("MESSAGE_WHISPER");
}

async function createPrivateMessage({ recipientUserId, text, popup = false, inReplyTo = null }) {
  const recipient = game.users.get(recipientUserId);
  if (!recipient || recipient.id === game.user.id) {
    throw new Error("Destinataire introuvable.");
  }

  if (!canCurrentUserWhisper()) {
    throw new Error("Tu n'as pas l'autorisation d'envoyer des messages privés dans ce world.");
  }

  const cleanText = String(text ?? "").trim();
  if (!cleanText) return null;

  const senderUserId = game.user.id;
  return createPmChatMessage({
    userId: senderUserId,
    speaker: ChatMessage.getSpeaker({ alias: game.user.character?.name || game.user.name }),
    // Les deux participants sont explicitement destinataires du whisper.
    // Ainsi chacun conserve l'accès au message dans le chat et l'historique Toolbox.
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
    if (requestedUserId) evilbramPmDashboardApp.selectConversation(requestedUserId);
    evilbramPmDashboardApp.bringToFront();
    return;
  }

  evilbramPmDashboardApp = new EvilbramPmDashboardApp({ userId: requestedUserId });
  const app = evilbramPmDashboardApp;
  app.addEventListener("close", () => {
    if (evilbramPmDashboardApp === app) evilbramPmDashboardApp = null;
  });
  await app.render({ force: true });
}

class EvilbramPmDashboardApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  constructor({ userId = null } = {}) {
    super();
    const contacts = getAvailableContacts();
    const firstActive = contacts.find(user => user.active) ?? contacts[0] ?? null;
    this.selectedThreadUserId = userId || firstActive?.id || null;
    this.selectedRecipients = new Set(this.selectedThreadUserId ? [this.selectedThreadUserId] : []);
    this.draft = "";
  }

  static DEFAULT_OPTIONS = {
    id: "evilbram-pm-dashboard",
    classes: ["evilbram-toolbox", "evilbram-pm-dashboard"],
    position: {
      width: 860,
      height: 640
    },
    window: {
      title: "Messages privés",
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
    if (!userId || userId === game.user.id) return;
    this.selectedThreadUserId = userId;
    evilbramPmUnreadByUser.delete(userId);
    this.render();
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
    const history = selectedUser
      ? await Promise.all(getConversationMessages(selectedUser.id).map(async message => {
          const participants = getPmParticipants(message);
          const outgoing = participants?.senderUserId === game.user.id;
          return {
            id: message.id,
            outgoing,
            incoming: !outgoing,
            content: await renderPmHistoryContent(message),
            time: formatMessageTime(message.timestamp)
          };
        }))
      : [];

    return {
      ...context,
      contacts,
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
      });
    }

    const textarea = this.element.querySelector("[data-pm-draft]");
    textarea?.addEventListener("input", event => {
      this.draft = event.currentTarget.value;
    });

    const history = this.element.querySelector(".evilbram-pm-history");
    scrollPmHistoryToBottom(history);
  }

  static async #onSelectConversation(event, target) {
    const userId = target.dataset.userId;
    if (!userId) return;
    this.selectedThreadUserId = userId;
    evilbramPmUnreadByUser.delete(userId);
    await this.render();
  }

  async #sendMessage({ popup }) {
    const text = String(this.draft ?? "").trim();
    if (!text) {
      ui.notifications.warn("Écris un message avant l'envoi.");
      return;
    }

    if (!canCurrentUserWhisper()) {
      ui.notifications.warn("Tu n'as pas l'autorisation d'envoyer des messages privés dans ce world.");
      return;
    }

    const recipientIds = [...this.selectedRecipients]
      .filter(id => {
        const user = game.users.get(id);
        return user?.active && user.id !== game.user.id;
      });

    if (!recipientIds.length) {
      ui.notifications.warn("Sélectionne au moins un destinataire connecté.");
      return;
    }

    try {
      for (const recipientUserId of recipientIds) {
        await createPrivateMessage({ recipientUserId, text, popup });
      }

      const count = recipientIds.length;
      ui.notifications.info(`Message privé envoyé${count > 1 ? "s" : ""} à ${count} destinataire${count > 1 ? "s" : ""}.`);
      this.draft = "";
      await this.render();
    } catch (err) {
      console.error("Evil Toolbox | Messages privés | Envoi impossible", err);
      ui.notifications.error(err?.message ?? "Impossible d'envoyer le message privé.");
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

  evilbramPmReplyApp = new EvilbramPmReplyApp(message, peerUserId);
  const app = evilbramPmReplyApp;
  app.addEventListener("close", () => {
    removePmReplyBackdrop();
    if (evilbramPmReplyApp === app) evilbramPmReplyApp = null;
  });
  await app.render({ force: true });
}

class EvilbramPmReplyApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  constructor(message, peerUserId) {
    super();
    this.message = message;
    this.peerUserId = peerUserId;
    this.reply = "";
  }

  static DEFAULT_OPTIONS = {
    id: "evilbram-pm-reply",
    classes: ["evilbram-toolbox", "evilbram-pm-reply"],
    position: {
      width: 520,
      height: 420
    },
    window: {
      title: "Message privé",
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
    const history = peer
      ? await Promise.all(getConversationMessages(peer.id).map(async message => {
          const participants = getPmParticipants(message);
          const fromMe = participants?.senderUserId === game.user.id;
          return {
            id: message.id,
            fromMe,
            fromPeer: !fromMe,
            content: await renderPmHistoryContent(message),
            time: formatMessageTime(message.timestamp)
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
    });
    textarea?.focus();

    const history = this.element.querySelector(".evilbram-pm-player-history");
    scrollPmHistoryToBottom(history);
  }

  static async #onSendReply() {
    const text = String(this.reply ?? "").trim();
    if (!text) {
      ui.notifications.warn("Écris une réponse avant l'envoi.");
      return;
    }

    try {
      const created = await createPrivateMessage({
        recipientUserId: this.peerUserId,
        text,
        popup: false,
        inReplyTo: this.message?.id ?? null
      });
      if (!created) return;
      ui.notifications.info("Message privé envoyé.");
      await this.close();
    } catch (err) {
      console.error("Evil Toolbox | Messages privés | Réponse impossible", err);
      ui.notifications.error(err?.message ?? "Impossible d'envoyer la réponse.");
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

  evilbramPmNotificationApp = new EvilbramPmNotificationApp({
    senderUserId: sender.id,
    senderLabel: sender.character?.name || sender.name
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
  constructor({ senderUserId, senderLabel }) {
    super();
    this.senderUserId = senderUserId;
    this.senderLabel = senderLabel;
  }

  static DEFAULT_OPTIONS = {
    id: "evilbram-pm-notification",
    classes: ["evilbram-toolbox", "evilbram-pm-notification"],
    position: {
      width: 330,
      height: "auto"
    },
    window: {
      title: "Nouveau MP",
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
      senderLabel: this.senderLabel
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
  button.innerHTML = '<i class="fa-solid fa-reply"></i> Répondre';
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
  const viewingPeer = dashboardOpen && evilbramPmDashboardApp.selectedThreadUserId === peerUserId;

  if (!viewingPeer) {
    evilbramPmUnreadByUser.set(
      peerUserId,
      (evilbramPmUnreadByUser.get(peerUserId) ?? 0) + 1
    );
  } else {
    evilbramPmUnreadByUser.delete(peerUserId);
  }

  if (dashboardOpen) {
    await evilbramPmDashboardApp.render();
  }

  if (flag?.popup === true) {
    await openPmReplyPopup(message);
    return;
  }

  // Conservation du comportement historique : côté MJ, un MP entrant classique
  // déclenche une petite notification uniquement si le tableau de bord est fermé.
  if (game.user.isGM && !dashboardOpen) {
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
  button.title = "Ouvrir les messages privés";
  button.setAttribute("aria-label", "Messages privés");
  button.innerHTML = '<span class="evilbram-pm-directory-button-label">Messages privés</span>';
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    openPmDashboard();
  });

  launcher.append(button);

  if (list && list.parentElement === container) container.insertBefore(launcher, list);
  else container.prepend(launcher);
}

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
    title: "Messages privés",
    icon: "fa-solid fa-envelope",
    order: Object.keys(tokens.tools).length,
    button: true,
    visible: true,
    onChange: () => openPmDashboard()
  };
});

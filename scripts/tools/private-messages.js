/*
 * Evilbram Toolbox — MP MJ
 * Foundry VTT v14
 *
 * Centre de messages privés MJ ↔ joueurs basé sur les ChatMessage whisper natifs.
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

function getPmFlag(message) {
  return message?.getFlag?.(EVILBRAM_PM_MODULE_ID, EVILBRAM_PM_FLAG_KEY) ?? null;
}

function getNonGmUsers() {
  return game.users
    .filter(user => !user.isGM)
    .sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
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
    active: user.active === true,
    img: user.character?.img || user.avatar || "icons/svg/mystery-man.svg"
  };
}

function getConversationMessages(playerUserId, gmUserId = game.user.id) {
  return game.messages.contents
    .filter(message => {
      const flag = getPmFlag(message);
      return flag?.gmUserId === gmUserId && flag?.playerUserId === playerUserId;
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

async function createPrivateMessage({ playerUserId, text, popup = false, inReplyTo = null }) {
  const player = game.users.get(playerUserId);
  if (!player || player.isGM) throw new Error("Joueur destinataire introuvable.");

  const cleanText = String(text ?? "").trim();
  if (!cleanText) return null;

  const gmUserId = game.user.id;
  const message = await ChatMessage.create({
    user: gmUserId,
    speaker: ChatMessage.getSpeaker({ alias: game.user.name }),
    content: textToChatHtml(cleanText),
    whisper: [playerUserId],
    flags: {
      [EVILBRAM_PM_MODULE_ID]: {
        [EVILBRAM_PM_FLAG_KEY]: {
          direction: "gm-to-player",
          gmUserId,
          playerUserId,
          popup: popup === true,
          inReplyTo
        }
      }
    }
  });

  return message;
}

async function createPlayerReply({ sourceMessage, text }) {
  if (game.user.isGM) return null;

  if (!game.user.can("MESSAGE_WHISPER")) {
    ui.notifications.warn("Tu n'as pas l'autorisation d'envoyer des messages privés dans ce world.");
    return null;
  }

  const sourceFlag = getPmFlag(sourceMessage);
  if (!sourceFlag?.gmUserId || sourceFlag.playerUserId !== game.user.id) return null;

  const cleanText = String(text ?? "").trim();
  if (!cleanText) return null;

  return ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ alias: game.user.character?.name || game.user.name }),
    content: textToChatHtml(cleanText),
    whisper: [sourceFlag.gmUserId],
    flags: {
      [EVILBRAM_PM_MODULE_ID]: {
        [EVILBRAM_PM_FLAG_KEY]: {
          direction: "player-to-gm",
          gmUserId: sourceFlag.gmUserId,
          playerUserId: game.user.id,
          popup: false,
          inReplyTo: sourceMessage.id
        }
      }
    }
  });
}

async function openPmDashboard({ playerUserId = null } = {}) {
  if (!game.user.isGM) return;

  if (evilbramPmDashboardApp?.rendered) {
    if (playerUserId) evilbramPmDashboardApp.selectConversation(playerUserId);
    evilbramPmDashboardApp.bringToFront();
    return;
  }

  evilbramPmDashboardApp = new EvilbramPmDashboardApp({ playerUserId });
  const app = evilbramPmDashboardApp;
  app.addEventListener("close", () => {
    if (evilbramPmDashboardApp === app) evilbramPmDashboardApp = null;
  });
  await app.render({ force: true });
}

class EvilbramPmDashboardApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  constructor({ playerUserId = null } = {}) {
    super();
    const firstActive = getNonGmUsers().find(user => user.active) ?? getNonGmUsers()[0] ?? null;
    this.selectedThreadUserId = playerUserId || firstActive?.id || null;
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
      title: "MP MJ",
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
    if (!userId) return;
    this.selectedThreadUserId = userId;
    evilbramPmUnreadByUser.delete(userId);
    this.render();
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const users = getNonGmUsers();

    const players = users.map(user => {
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
      ? getConversationMessages(selectedUser.id).map(message => {
          const flag = getPmFlag(message);
          return {
            id: message.id,
            outgoing: flag?.direction === "gm-to-player",
            incoming: flag?.direction === "player-to-gm",
            content: message.content,
            time: formatMessageTime(message.timestamp)
          };
        })
      : [];

    return {
      ...context,
      players,
      hasPlayers: players.length > 0,
      selectedUser: selectedUser ? getUserDisplay(selectedUser) : null,
      history,
      hasHistory: history.length > 0,
      draft: this.draft
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
    if (history) history.scrollTop = history.scrollHeight;
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

    const recipientIds = [...this.selectedRecipients]
      .filter(id => game.users.get(id)?.active && !game.users.get(id)?.isGM);

    if (!recipientIds.length) {
      ui.notifications.warn("Sélectionne au moins un joueur connecté.");
      return;
    }

    try {
      for (const playerUserId of recipientIds) {
        await createPrivateMessage({ playerUserId, text, popup });
      }

      const count = recipientIds.length;
      ui.notifications.info(`MP envoyé${count > 1 ? "s" : ""} à ${count} joueur${count > 1 ? "s" : ""}.`);
      this.draft = "";
      await this.render();
    } catch (err) {
      console.error("Evil Toolbox | MP MJ | Envoi impossible", err);
      ui.notifications.error(err?.message ?? "Impossible d'envoyer le MP.");
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

async function openPlayerReplyPopup(message) {
  if (game.user.isGM) return;

  const flag = getPmFlag(message);
  if (flag?.direction !== "gm-to-player" || flag.playerUserId !== game.user.id) return;

  if (evilbramPmReplyApp?.rendered) await evilbramPmReplyApp.close();

  evilbramPmReplyApp = new EvilbramPmReplyApp(message);
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
  constructor(message) {
    super();
    this.message = message;
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
    const flag = getPmFlag(this.message);
    const history = flag?.gmUserId
      ? getConversationMessages(game.user.id, flag.gmUserId).map(message => {
          const messageFlag = getPmFlag(message);
          return {
            id: message.id,
            fromGm: messageFlag?.direction === "gm-to-player",
            fromPlayer: messageFlag?.direction === "player-to-gm",
            content: message.content,
            time: formatMessageTime(message.timestamp)
          };
        })
      : [];

    return {
      ...context,
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
    if (history) history.scrollTop = history.scrollHeight;
  }

  static async #onSendReply() {
    const text = String(this.reply ?? "").trim();
    if (!text) {
      ui.notifications.warn("Écris une réponse avant l'envoi.");
      return;
    }

    try {
      const created = await createPlayerReply({ sourceMessage: this.message, text });
      if (!created) return;
      ui.notifications.info("Réponse envoyée au MJ.");
      await this.close();
    } catch (err) {
      console.error("Evil Toolbox | MP MJ | Réponse impossible", err);
      ui.notifications.error(err?.message ?? "Impossible d'envoyer la réponse.");
    }
  }
}

async function showGmReplyNotification(message) {
  if (!game.user.isGM) return;

  const flag = getPmFlag(message);
  if (flag?.direction !== "player-to-gm" || flag.gmUserId !== game.user.id) return;

  const player = game.users.get(flag.playerUserId);
  if (!player) return;

  if (evilbramPmNotificationApp?.rendered) await evilbramPmNotificationApp.close();

  evilbramPmNotificationApp = new EvilbramPmNotificationApp({
    playerUserId: player.id,
    playerLabel: player.character?.name || player.name
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
  constructor({ playerUserId, playerLabel }) {
    super();
    this.playerUserId = playerUserId;
    this.playerLabel = playerLabel;
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
      playerLabel: this.playerLabel
    };
  }

  static async #onCloseNotification() {
    await this.close();
  }

  static async #onOpenDashboard() {
    const playerUserId = this.playerUserId;
    await this.close();
    await openPmDashboard({ playerUserId });
  }
}

function addReplyButtonToChatMessage(message, html) {
  if (game.user.isGM) return;

  const flag = getPmFlag(message);
  if (flag?.direction !== "gm-to-player" || flag.playerUserId !== game.user.id) return;

  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!(root instanceof HTMLElement)) return;
  if (root.querySelector(".evilbram-pm-chat-reply")) return;

  const target = root.querySelector(".message-content") ?? root;
  const actions = document.createElement("div");
  actions.className = "evilbram-pm-chat-actions";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "evilbram-pm-chat-reply";
  button.innerHTML = '<i class="fa-solid fa-reply"></i> Répondre au MJ';
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    openPlayerReplyPopup(message);
  });

  actions.append(button);
  target.append(actions);
}

async function handleCreatedPmMessage(message) {
  const flag = getPmFlag(message);
  if (!flag) return;

  if (!game.user.isGM) {
    if (
      flag.direction === "gm-to-player" &&
      flag.playerUserId === game.user.id &&
      flag.popup === true &&
      message.visible
    ) {
      await openPlayerReplyPopup(message);
    }
    return;
  }

  if (flag.direction === "player-to-gm" && flag.gmUserId === game.user.id && message.visible) {
    evilbramPmUnreadByUser.set(
      flag.playerUserId,
      (evilbramPmUnreadByUser.get(flag.playerUserId) ?? 0) + 1
    );

    if (evilbramPmDashboardApp?.rendered) {
      await evilbramPmDashboardApp.render();
    } else {
      await showGmReplyNotification(message);
    }
  }
}

Hooks.on("renderChatMessageHTML", (message, html) => {
  addReplyButtonToChatMessage(message, html);
});

Hooks.on("createChatMessage", message => {
  handleCreatedPmMessage(message).catch(err => {
    console.error("Evil Toolbox | MP MJ | Traitement message impossible", err);
  });
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
    title: "MP MJ",
    icon: "fa-solid fa-envelope",
    order: Object.keys(tokens.tools).length,
    button: true,
    visible: true,
    onChange: () => openPmDashboard()
  };
});

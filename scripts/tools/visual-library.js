/*
 * Evilbram Toolbox — Visuels MJ
 * Foundry VTT v14
 *
 * Bibliothèque de visuels propre au World et partage ponctuel aux joueurs.
 */

const EVILBRAM_TOOLBOX_ID = "evil-toolbox";
const EVILBRAM_VISUALS_SETTING = "visualLibrary";
const EVILBRAM_VISUALS_SOCKET = `module.${EVILBRAM_TOOLBOX_ID}`;

let evilbramVisualLibraryApp = null;
let evilbramPlayerVisualApp = null;
let evilbramPlayerVisualBackdrop = null;

function getVisualLibrary() {
  const stored = game.settings.get(EVILBRAM_TOOLBOX_ID, EVILBRAM_VISUALS_SETTING) ?? {};
  const items = Array.isArray(stored.items)
    ? stored.items.map(item => ({
        ...item,
        hasBeenShown: item?.hasBeenShown === true
      }))
    : [];
  return { items };
}

async function setVisualLibrary(items) {
  return game.settings.set(EVILBRAM_TOOLBOX_ID, EVILBRAM_VISUALS_SETTING, { items });
}

function visualNameFromPath(path) {
  const raw = String(path ?? "").split("/").pop() ?? "Visuel";
  const withoutExtension = raw.replace(/\.[^.]+$/, "");
  return decodeURIComponent(withoutExtension).replace(/[_-]+/g, " ").trim() || "Visuel";
}

function escapeAttribute(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function promptVisualName({ title, value }) {
  const { DialogV2 } = foundry.applications.api;
  const result = await DialogV2.input({
    window: { title },
    content: `<input type="text" name="name" value="${escapeAttribute(value)}" autocomplete="off" autofocus>`,
    ok: { label: "Valider" },
    rejectClose: false
  });

  if (!result) return null;
  const name = String(result.name ?? "").trim();
  return name || null;
}

function emitVisualMessage(type, payload = {}) {
  game.socket.emit(EVILBRAM_VISUALS_SOCKET, {
    type,
    payload,
    senderId: game.user.id
  });
}

async function showVisualToPlayers(visual) {
  if (!game.user.isGM) return;

  if (!visual.hasBeenShown) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Afficher le visuel ?" },
      content:
        `<p>Afficher <strong>${escapeAttribute(visual.name)}</strong> aux joueurs ?</p>` +
        `<p class="hint">Cet avertissement ne sera plus affiché pour ce visuel jusqu'à réinitialisation.</p>`,
      yes: { label: "Afficher" },
      no: { label: "Annuler" },
      rejectClose: false
    });

    if (!confirmed) return;

    const library = getVisualLibrary();
    const storedVisual = library.items.find(entry => entry.id === visual.id);
    if (storedVisual) {
      storedVisual.hasBeenShown = true;
      await setVisualLibrary(library.items);
    }
  }

  emitVisualMessage("visuals:show", {
    id: visual.id,
    path: visual.path
  });

  ui.notifications.info(`Visuel affiché aux joueurs : ${visual.name}`);
}

function closeVisualForPlayers() {
  if (!game.user.isGM) return;
  emitVisualMessage("visuals:close");
  ui.notifications.info("Fermeture du visuel envoyée aux joueurs.");
}

async function resetVisualWarnings() {
  if (!game.user.isGM) return;

  const library = getVisualLibrary();
  if (!library.items.length) {
    ui.notifications.info("Aucun visuel à réinitialiser.");
    return;
  }

  for (const visual of library.items) {
    visual.hasBeenShown = false;
  }

  await setVisualLibrary(library.items);
  ui.notifications.info("Avertissements de premier affichage réinitialisés.");
}

async function openVisualLibrary() {
  if (!game.user.isGM) return;

  if (evilbramVisualLibraryApp?.rendered) {
    evilbramVisualLibraryApp.bringToFront();
    return;
  }

  evilbramVisualLibraryApp = new EvilbramVisualLibraryApp();
  const app = evilbramVisualLibraryApp;
  app.addEventListener("close", () => {
    if (evilbramVisualLibraryApp === app) evilbramVisualLibraryApp = null;
  });
  await app.render({ force: true });
}

class EvilbramVisualLibraryApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static DEFAULT_OPTIONS = {
    id: "evilbram-visual-library",
    classes: ["evilbram-toolbox", "evilbram-visual-library"],
    position: {
      width: 720,
      height: 620
    },
    window: {
      title: "Visuels MJ",
      icon: "fa-solid fa-images",
      resizable: true
    },
    actions: {
      add: this.#onAdd,
      show: this.#onShow,
      rename: this.#onRename,
      delete: this.#onDelete,
      resetWarnings: this.#onResetWarnings,
      closePlayers: this.#onClosePlayers
    }
  };

  static PARTS = {
    content: {
      template: "modules/evil-toolbox/templates/visual-library.hbs"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const library = getVisualLibrary();
    const visuals = [...library.items].sort((a, b) =>
      String(a?.name ?? "").localeCompare(
        String(b?.name ?? ""),
        "fr",
        { sensitivity: "base", numeric: true }
      )
    );

    return {
      ...context,
      visuals,
      hasVisuals: visuals.length > 0
    };
  }

  static async #onAdd() {
    const picker = new foundry.applications.apps.FilePicker({
      type: "image",
      callback: async path => {
        const name = await promptVisualName({
          title: "Nom du visuel",
          value: visualNameFromPath(path)
        });
        if (!name) return;

        const library = getVisualLibrary();
        library.items.push({
          id: foundry.utils.randomID(16),
          name,
          path,
          hasBeenShown: false
        });

        await setVisualLibrary(library.items);
        await this.render();
      }
    });

    await picker.render({ force: true });
  }

  static async #onShow(event, target) {
    const id = target.dataset.visualId;
    const visual = getVisualLibrary().items.find(entry => entry.id === id);
    if (!visual) return;
    await showVisualToPlayers(visual);
    await this.render();
  }

  static async #onRename(event, target) {
    const id = target.dataset.visualId;
    const library = getVisualLibrary();
    const visual = library.items.find(entry => entry.id === id);
    if (!visual) return;

    const name = await promptVisualName({
      title: "Renommer le visuel",
      value: visual.name
    });
    if (!name || name === visual.name) return;

    visual.name = name;
    await setVisualLibrary(library.items);
    await this.render();
  }

  static async #onDelete(event, target) {
    const id = target.dataset.visualId;
    const library = getVisualLibrary();
    const visual = library.items.find(entry => entry.id === id);
    if (!visual) return;

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Supprimer le visuel" },
      content: `<p>Supprimer <strong>${escapeAttribute(visual.name)}</strong> de la bibliothèque ?</p>`,
      yes: { label: "Supprimer" },
      no: { label: "Annuler" },
      rejectClose: false
    });

    if (!confirmed) return;

    await setVisualLibrary(library.items.filter(entry => entry.id !== id));
    await this.render();
  }

  static async #onResetWarnings() {
    await resetVisualWarnings();
    await this.render();
  }

  static #onClosePlayers() {
    closeVisualForPlayers();
  }
}

function removePlayerVisualBackdrop() {
  evilbramPlayerVisualBackdrop?.remove();
  evilbramPlayerVisualBackdrop = null;
}

function ensurePlayerVisualBackdrop(app) {
  removePlayerVisualBackdrop();

  const backdrop = document.createElement("div");
  backdrop.className = "evilbram-player-visual-backdrop";
  backdrop.setAttribute("aria-hidden", "true");
  document.body.append(backdrop);

  const appZIndex = Number.parseInt(
    window.getComputedStyle(app.element).zIndex,
    10
  );

  if (Number.isFinite(appZIndex)) {
    backdrop.style.zIndex = String(Math.max(0, appZIndex - 1));
  }

  evilbramPlayerVisualBackdrop = backdrop;
}

class EvilbramPlayerVisualApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  constructor(visual) {
    super({
      window: {
        title: ""
      }
    });
    this.visual = visual;
  }

  static DEFAULT_OPTIONS = {
    id: "evilbram-player-visual",
    classes: ["evilbram-toolbox", "evilbram-player-visual"],
    position: {
      width: 960
    },
    window: {
      resizable: true
    }
  };

  static PARTS = {
    content: {
      template: "modules/evil-toolbox/templates/player-visual.hbs"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return {
      ...context,
      visual: this.visual
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    const title = this.element?.querySelector(".window-header, .window-titlebar, header.application-header");
    if (title) title.style.display = "none";

    const closeButton = this.element?.querySelector(".evilbram-player-visual-close");
    closeButton?.addEventListener("click", () => this.close(), { once: true });

    const image = this.element?.querySelector(".evilbram-player-visual-content img");
    if (!image) return;

    if (!image.complete) {
      await new Promise(resolve => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      });
    }

    this.#fitAndCenter(image);
    this.bringToFront();
    ensurePlayerVisualBackdrop(this);
  }

  #fitAndCenter(image) {
    const margin = 24;
    const viewportWidth = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
    const viewportHeight = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
    const headerHeight = this.window?.header?.offsetHeight ?? 36;

    const maxWindowWidth = Math.max(280, viewportWidth - (margin * 2));
    const maxContentHeight = Math.max(180, viewportHeight - headerHeight - (margin * 2));
    const maxContentWidth = Math.min(960, maxWindowWidth);

    const naturalWidth = image.naturalWidth || maxContentWidth;
    const naturalHeight = image.naturalHeight || maxContentHeight;
    const scale = Math.min(
      1,
      maxContentWidth / naturalWidth,
      maxContentHeight / naturalHeight
    );

    const contentWidth = Math.max(1, Math.round(naturalWidth * scale));
    const contentHeight = Math.max(1, Math.round(naturalHeight * scale));
    const width = Math.min(maxWindowWidth, contentWidth);
    const height = Math.min(viewportHeight - (margin * 2), contentHeight + headerHeight);
    const left = Math.max(margin, Math.round((viewportWidth - width) / 2));
    const top = Math.max(margin, Math.round((viewportHeight - height) / 2));

    this.setPosition({ width, height, left, top });
  }
}

async function displayPlayerVisual(visual) {
  if (game.user.isGM) return;
  if (!visual?.path) return;

  if (evilbramPlayerVisualApp?.rendered) {
    await evilbramPlayerVisualApp.close();
  }

  evilbramPlayerVisualApp = new EvilbramPlayerVisualApp(visual);
  const app = evilbramPlayerVisualApp;
  app.addEventListener("close", () => {
    removePlayerVisualBackdrop();
    if (evilbramPlayerVisualApp === app) evilbramPlayerVisualApp = null;
  });
  await app.render({ force: true });
}

async function closePlayerVisual() {
  if (game.user.isGM) return;

  if (evilbramPlayerVisualApp?.rendered) {
    await evilbramPlayerVisualApp.close();
  }

  evilbramPlayerVisualApp = null;
  removePlayerVisualBackdrop();
}

async function handleVisualSocket(message) {
  if (!message || typeof message !== "object") return;

  const sender = game.users.get(message.senderId);
  if (!sender?.isGM) return;

  switch (message.type) {
    case "visuals:show":
      await displayPlayerVisual(message.payload);
      break;
    case "visuals:close":
      await closePlayerVisual();
      break;
  }
}

Hooks.once("init", () => {
  game.settings.register(EVILBRAM_TOOLBOX_ID, EVILBRAM_VISUALS_SETTING, {
    name: "Bibliothèque de visuels MJ",
    hint: "Liste des visuels préparés pour ce World.",
    scope: "world",
    config: false,
    type: Object,
    default: { items: [] }
  });
});

Hooks.once("ready", () => {
  game.socket.on(EVILBRAM_VISUALS_SOCKET, handleVisualSocket);

  game.evilbramToolbox ??= {};
  game.evilbramToolbox.visuals = {
    open: openVisualLibrary,
    closePlayers: closeVisualForPlayers
  };
});

Hooks.on("getSceneControlButtons", controls => {
  if (!game.user.isGM) return;
  const tokens = controls.tokens;
  if (!tokens?.tools) return;

  tokens.tools.evilbramVisuals = {
    name: "evilbramVisuals",
    title: "Visuels MJ",
    icon: "fa-solid fa-images",
    order: Object.keys(tokens.tools).length,
    button: true,
    visible: true,
    onChange: () => openVisualLibrary()
  };
});

/*
 * Evilbram Toolbox — Visuels MJ
 * Foundry VTT v14
 *
 * Bibliothèque de visuels propre au World et partage ponctuel aux joueurs.
 */

const EVILBRAM_TOOLBOX_ID = "evil-toolbox";
const EVILBRAM_VISUALS_SETTING = "visualLibrary";
const EVILBRAM_VISUALS_SOCKET = `module.${EVILBRAM_TOOLBOX_ID}`;
const EVILBRAM_VISUALS_DRAG_TYPE = "application/x-evil-toolbox-visual";

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

function getTransferString(event, type) {
  try {
    return String(event?.dataTransfer?.getData(type) ?? "").trim();
  } catch {
    return "";
  }
}

function normalizeImagePath(path) {
  const value = String(path ?? "").trim();
  if (!value) return "";
  if (value.startsWith("data:image/")) return value;

  try {
    const url = new URL(value, window.location.href);
    if (url.origin === window.location.origin) {
      return `${url.pathname.replace(/^\/+/, "")}${url.search}${url.hash}`;
    }
  } catch {}

  return value;
}

function looksLikeImagePath(path) {
  const value = normalizeImagePath(path);
  if (!value) return false;
  if (value.startsWith("data:image/")) return true;

  const clean = value.split("?")[0].split("#")[0].toLowerCase();
  return /\.(apng|avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(clean);
}

function imageSuggestion(name, path) {
  return String(name ?? "").trim() || visualNameFromPath(path);
}

function extractImageFromHtml(html) {
  if (!html) return null;

  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const image = doc.querySelector("img[src]");
    if (!image) return null;

    const path = normalizeImagePath(image.getAttribute("src")?.trim());
    if (!looksLikeImagePath(path)) return null;

    return {
      path,
      suggestedName: imageSuggestion(
        image.getAttribute("alt") || image.getAttribute("title"),
        path
      )
    };
  } catch {
    return null;
  }
}

function extractImageFromRawData(data) {
  if (!data || typeof data !== "object") return null;

  const candidates = [
    data.src,
    data.path,
    data.img,
    data.image,
    data?.texture?.src
  ];

  const path = normalizeImagePath(candidates.find(candidate => looksLikeImagePath(candidate)));
  if (!path) return null;

  return {
    path,
    suggestedName: imageSuggestion(data.name || data.title, path)
  };
}

function extractImageFromDocument(document) {
  if (!document) return null;

  if (document.documentName === "JournalEntryPage" && document.type === "image" && looksLikeImagePath(document.src)) {
    return {
      path: normalizeImagePath(document.src),
      suggestedName: imageSuggestion(document.name, document.src)
    };
  }

  const path = normalizeImagePath([document.src, document.img, document?.texture?.src]
    .find(candidate => looksLikeImagePath(candidate)));

  if (!path) return null;

  return {
    path,
    suggestedName: imageSuggestion(document.name || document.title, path)
  };
}

async function resolveDroppedVisual(event) {
  const customPayload = getTransferString(event, EVILBRAM_VISUALS_DRAG_TYPE);
  if (customPayload) {
    try {
      const parsed = JSON.parse(customPayload);
      const customImage = extractImageFromRawData(parsed);
      if (customImage) return customImage;
    } catch {}
  }

  const dragData = TextEditor.getDragEventData?.(event);

  const directDataImage = extractImageFromRawData(dragData);
  if (directDataImage) return directDataImage;

  if (dragData?.uuid) {
    const document = await fromUuid(dragData.uuid);
    const documentImage = extractImageFromDocument(document);
    if (documentImage) return documentImage;
  }

  const uriList = getTransferString(event, "text/uri-list")
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line && !line.startsWith("#"));

  if (looksLikeImagePath(uriList)) {
    return {
      path: normalizeImagePath(uriList),
      suggestedName: visualNameFromPath(uriList)
    };
  }

  const htmlImage = extractImageFromHtml(getTransferString(event, "text/html"));
  if (htmlImage) return htmlImage;

  const plain = getTransferString(event, "text/plain");
  if (looksLikeImagePath(plain)) {
    return {
      path: normalizeImagePath(plain),
      suggestedName: visualNameFromPath(plain)
    };
  }

  try {
    const parsed = JSON.parse(plain || "null");
    const parsedImage = extractImageFromRawData(parsed);
    if (parsedImage) return parsedImage;
  } catch {}

  return null;
}

async function addVisualEntry({ path, suggestedName }) {
  path = normalizeImagePath(path);
  if (!looksLikeImagePath(path)) return false;

  const name = await promptVisualName({
    title: "Nom du visuel",
    value: imageSuggestion(suggestedName, path)
  });
  if (!name) return false;

  const library = getVisualLibrary();
  library.items.push({
    id: foundry.utils.randomID(16),
    name,
    path,
    hasBeenShown: false
  });

  await setVisualLibrary(library.items);
  return true;
}

function normalizeHookElement(element) {
  if (element instanceof HTMLElement) return element;
  if (element?.[0] instanceof HTMLElement) return element[0];
  return null;
}

function getJournalDocumentFromApp(app) {
  const candidates = [
    app?.document,
    app?.object,
    app?.page,
    app?.journalEntry,
    app?.journalEntryPage
  ];

  return candidates.find(document =>
    document?.documentName === "JournalEntry" ||
    document?.documentName === "JournalEntryPage"
  ) ?? null;
}

function isJournalApplication(app) {
  if (getJournalDocumentFromApp(app)) return true;
  return String(app?.constructor?.name ?? "").includes("JournalEntry");
}

function prepareJournalImageForDrag(image) {
  if (!(image instanceof HTMLImageElement)) return;
  if (!looksLikeImagePath(image.getAttribute("src") || image.currentSrc || image.src)) return;

  // Ne touche pas aux images servant d'icône ou de contrôle d'interface.
  if (image.closest("button, .window-header, .window-controls, nav, .prosemirror-menu, .editor-menu")) return;

  image.draggable = true;
  image.setAttribute("draggable", "true");
  image.dataset.evilbramVisualDraggable = "true";
  image.classList.add("evilbram-journal-visual-draggable");
}

function prepareJournalImagesForDrag(app, element) {
  if (!game.user?.isGM || !isJournalApplication(app)) return;

  const root = normalizeHookElement(element) ?? normalizeHookElement(app?.element);
  if (!root) return;

  for (const image of root.querySelectorAll("img[src]")) {
    prepareJournalImageForDrag(image);
  }

  // Certains éditeurs reconstruisent une partie du DOM après le rendu initial.
  // L'observer garantit que les nouvelles images deviennent elles aussi draggables.
  app._evilbramJournalImageObserver?.disconnect?.();
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.("img[src]")) prepareJournalImageForDrag(node);
        for (const image of node.querySelectorAll?.("img[src]") ?? []) {
          prepareJournalImageForDrag(image);
        }
      }
    }
  });

  observer.observe(root, { childList: true, subtree: true });
  app._evilbramJournalImageObserver = observer;
}

function handleJournalImagePointerDown(event) {
  if (!game.user?.isGM) return;

  const image = event.target?.closest?.("img[src]");
  if (!image?.dataset?.evilbramVisualDraggable) return;

  // Réaffirme l'attribut juste avant l'initiation du drag, au cas où
  // ProseMirror ait resynchronisé le DOM entre-temps.
  image.draggable = true;
  image.setAttribute("draggable", "true");
}

function handleGlobalImageDragStart(event) {
  if (!game.user?.isGM) return;

  const image = event.target?.closest?.("img[src]");
  if (!image || !event.dataTransfer) return;

  const path = normalizeImagePath(
    image.getAttribute("src") || image.currentSrc || image.src
  );
  if (!looksLikeImagePath(path)) return;

  const payload = {
    path,
    name: image.getAttribute("alt") || image.getAttribute("title") || visualNameFromPath(path)
  };

  try {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(
      EVILBRAM_VISUALS_DRAG_TYPE,
      JSON.stringify(payload)
    );
    event.dataTransfer.setData("text/plain", path);
  } catch {}

  // Pour les images que Toolbox a explicitement rendues draggables dans un
  // Journal, ne laisse pas ProseMirror annuler ou détourner le dragstart.
  if (image.dataset?.evilbramVisualDraggable === "true") {
    event.stopPropagation();
  }
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

  async _onRender(context, options) {
    await super._onRender(context, options);

    const dropTarget = this.element?.querySelector(".evilbram-visual-library-content");
    const appElement = this.element;
    if (!dropTarget || !appElement) return;

    this._evilbramDropController?.abort();
    const controller = new AbortController();
    this._evilbramDropController = controller;

    let dragDepth = 0;
    const setDropState = active => {
      dropTarget.classList.toggle("evilbram-drop-target", active);
      dropTarget.setAttribute("aria-dropeffect", active ? "copy" : "none");
    };

    const isInsideApp = event => appElement.contains(event.target);

    const onDragEnter = event => {
      if (!isInsideApp(event)) return;
      event.preventDefault();
      dragDepth += 1;
      setDropState(true);
    };

    const onDragOver = event => {
      if (!isInsideApp(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      setDropState(true);
    };

    const onDragLeave = event => {
      if (!isInsideApp(event)) return;
      event.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) setDropState(false);
    };

    const onDrop = async event => {
      if (!isInsideApp(event)) return;
      event.preventDefault();
      event.stopPropagation();
      dragDepth = 0;
      setDropState(false);

      const dropped = await resolveDroppedVisual(event);
      if (!dropped?.path) {
        ui.notifications.warn(
          "Impossible de récupérer une image depuis ce glisser-déposer. Dépose une image de Journal ou une page de Journal de type Image."
        );
        return;
      }

      const added = await addVisualEntry(dropped);
      if (!added) return;
      await this.render();
    };

    // Phase de capture : nécessaire pour les images HTML des pages texte,
    // dont l'éditeur Foundry peut intercepter le drag/drop avant le bubbling.
    appElement.addEventListener("dragenter", onDragEnter, { capture: true, signal: controller.signal });
    appElement.addEventListener("dragover", onDragOver, { capture: true, signal: controller.signal });
    appElement.addEventListener("dragleave", onDragLeave, { capture: true, signal: controller.signal });
    appElement.addEventListener("drop", onDrop, { capture: true, signal: controller.signal });
  }


  static async #onAdd() {
    const picker = new foundry.applications.apps.FilePicker({
      type: "image",
      callback: async path => {
        const added = await addVisualEntry({
          path,
          suggestedName: visualNameFromPath(path)
        });

        if (!added) return;
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
  document.addEventListener("pointerdown", handleJournalImagePointerDown, true);
  document.addEventListener("dragstart", handleGlobalImageDragStart, true);

  game.evilbramToolbox ??= {};
  game.evilbramToolbox.visuals = {
    open: openVisualLibrary,
    closePlayers: closeVisualForPlayers
  };
});

Hooks.on("renderApplicationV2", (app, element) => {
  prepareJournalImagesForDrag(app, element);
});

Hooks.on("renderApplicationV1", (app, element) => {
  prepareJournalImagesForDrag(app, element);
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

import { PACKAGE_ID, FEATURE_ID, FEATURE_TITLE, TOOL_ID, PREVIOUS_DARKNESS_SETTING } from "./constants.mjs";
import { loadBuiltinPresets } from "./presets.mjs";
import {
  activatePresetForDrawing,
  exportControlledAmbientLight,
  placePresetAtCoordinates
} from "./export-import.mjs";
import { applySceneProfile, setCalibrationDarkness, restorePreviousDarkness, setSceneGridScale } from "./scene-tools.mjs";

const DROP_TYPE = `${FEATURE_ID}.ambient-light-preset`;
let builtinPresets = [];

Hooks.once("init", () => {
  game.settings.register(PACKAGE_ID, PREVIOUS_DARKNESS_SETTING, {
    name: "Previous scene darkness",
    scope: "client",
    config: false,
    type: Number,
    default: 0
  });
});

Hooks.once("ready", async () => {
  builtinPresets = await loadBuiltinPresets();

  game.evilbramToolbox ??= {};
  game.evilbramToolbox.lighting = {
    open: openToolkitDialog
  };

  document.addEventListener("dragstart", onPresetDragStart);
  document.addEventListener("click", onToolkitClick);

});

Hooks.on("dropCanvasData", async (_canvas, data) => {
  if (data?.type !== DROP_TYPE) return;

  if (!game.user?.isGM) {
    ui.notifications.warn(game.i18n.localize("EVIL_LIGHT_TOOLKIT.GmOnly"));
    return;
  }

  const preset = builtinPresets.find(p => p.id === data.presetId);
  if (!preset) {
    ui.notifications.warn(game.i18n.localize("EVIL_LIGHT_TOOLKIT.PresetNotFound"));
    return;
  }

  await placePresetAtCoordinates(preset, { x: data.x, y: data.y });
  ui.notifications.info(
    game.i18n.format("EVIL_LIGHT_TOOLKIT.PresetDropped", { label: preset.label })
  );
});

Hooks.on("getSceneControlButtons", controls => {
  const lighting = controls.lighting;
  if (!lighting?.tools) return;
  lighting.tools[TOOL_ID] = {
    name: TOOL_ID,
    title: "EVIL_LIGHT_TOOLKIT.Open",
    icon: "fa-solid fa-lightbulb",
    order: Object.keys(lighting.tools).length + 1,
    button: true,
    visible: game.user?.isGM,
    onChange: () => openToolkitDialog()
  };
});

function getPresetFromElement(element) {
  const button = element?.closest?.(".evil-light-toolkit-presets [data-preset-id]");
  if (!button) return null;
  return builtinPresets.find(p => p.id === button.dataset.presetId) ?? null;
}

function onPresetDragStart(event) {
  const preset = getPresetFromElement(event.target);
  if (!preset || !event.dataTransfer) return;

  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData("text/plain", JSON.stringify({
    type: DROP_TYPE,
    presetId: preset.id
  }));
}

async function onToolkitClick(event) {
  const actionButton = event.target?.closest?.(".evil-light-toolkit-dialog [data-elt-action]");
  if (actionButton) {
    event.preventDefault();
    await executeToolkitAction(actionButton.dataset.eltAction, actionButton.closest(".evil-light-toolkit-dialog"));
    return;
  }

  const preset = getPresetFromElement(event.target);
  if (!preset) return;

  await activatePresetForDrawing(preset);
  ui.notifications.info(
    game.i18n.format("EVIL_LIGHT_TOOLKIT.PresetActivated", { label: preset.label })
  );
}

async function executeToolkitAction(action, dialog = null) {
  switch (action) {
    case "scene-exterior": return applySceneProfile("exterior");
    case "scene-interior": return applySceneProfile("interior");
    case "scene-darkness": return applySceneProfile("darkness");
    case "scene-grid-scale": {
      const distanceInput = dialog?.querySelector?.("[data-elt-grid-distance]");
      const unitsInput = dialog?.querySelector?.("[data-elt-grid-units]");
      return setSceneGridScale(distanceInput?.valueAsNumber, unitsInput?.value ?? "");
    }
    case "darkness-day": return setCalibrationDarkness("day");
    case "darkness-dusk": return setCalibrationDarkness("dusk");
    case "darkness-night": return setCalibrationDarkness("night");
    case "darkness-restore": return restorePreviousDarkness();
    case "export-light": return exportControlledAmbientLight();
    default: throw new Error(`Unknown toolkit action: ${action}`);
  }
}

function openToolkitDialog() {
  const DialogV2 = foundry.applications.api.DialogV2;
  const content = renderToolkitContent();

  new DialogV2({
    classes: ["evil-light-toolkit-window"],
    window: {
      title: FEATURE_TITLE,
      icon: "fa-solid fa-lightbulb",
      minimizable: true,
      resizable: true
    },
    position: { width: 640 },
    content,
    buttons: [{
      action: "close",
      label: game.i18n.localize("EVIL_LIGHT_TOOLKIT.Close"),
      icon: "fa-solid fa-xmark",
      default: true
    }]
  }).render({ force: true });
}

function renderToolkitContent() {
  const sceneData = canvas?.scene?.toObject?.() ?? {};
  const gridDistance = Number(sceneData.grid?.distance ?? 1);
  const gridUnits = escapeHtmlAttribute(sceneData.grid?.units ?? "");
  const smallTimeActive = game.modules.get("smalltime")?.active === true;
  const smallTimeLinked = smallTimeActive
    && canvas?.scene?.getFlag?.("smalltime", "darkness-link") === true;

  const sourceIds = new Set([
    "candle-draft",
    "oil-lamp-draft",
    "lantern-exterior-draft",
    "campfire-draft",
    "lit-window-draft",
    "neutral-light-draft"
  ]);

  const sourcePresets = builtinPresets.filter(preset => sourceIds.has(preset.id));
  const utilityPresets = builtinPresets.filter(preset => !sourceIds.has(preset.id));

  const statusLabel = !smallTimeActive
    ? game.i18n.localize("EVIL_LIGHT_TOOLKIT.SmallTimeAbsent")
    : smallTimeLinked
      ? game.i18n.localize("EVIL_LIGHT_TOOLKIT.SmallTimeLinked")
      : game.i18n.localize("EVIL_LIGHT_TOOLKIT.SmallTimeAvailable");

  const statusClass = smallTimeLinked ? "is-linked" : smallTimeActive ? "is-active" : "";

  return `
    <section class="evil-light-toolkit-dialog">
      <header class="elt-hero">
        <div class="elt-hero__icon"><i class="fa-solid fa-lightbulb"></i></div>
        <div class="elt-hero__text">
          <strong>${game.i18n.localize("EVIL_LIGHT_TOOLKIT.IntroTitle")}</strong>
          <span>${game.i18n.localize("EVIL_LIGHT_TOOLKIT.IntroText")}</span>
        </div>
        <div class="elt-status ${statusClass}">
          <i class="fa-solid fa-clock"></i>
          ${statusLabel}
        </div>
      </header>

      <section class="elt-section">
        <div class="elt-section__heading">
          <div>
            <h3>${game.i18n.localize("EVIL_LIGHT_TOOLKIT.SectionScene")}</h3>
            <p>${game.i18n.localize("EVIL_LIGHT_TOOLKIT.SectionSceneHint")}</p>
          </div>
        </div>
        <div class="elt-action-grid elt-action-grid--three">
          ${renderActionButton("scene-exterior", "fa-sun", "EVIL_LIGHT_TOOLKIT.SceneExterior", "EVIL_LIGHT_TOOLKIT.SceneExteriorHint")}
          ${renderActionButton("scene-interior", "fa-house", "EVIL_LIGHT_TOOLKIT.SceneInterior", "EVIL_LIGHT_TOOLKIT.SceneInteriorHint")}
          ${renderActionButton("scene-darkness", "fa-eye-slash", "EVIL_LIGHT_TOOLKIT.SceneDarkness", "EVIL_LIGHT_TOOLKIT.SceneDarknessHint")}
        </div>
        <div class="elt-grid-scale">
          <label class="elt-grid-scale__field">
            <span>${game.i18n.localize("EVIL_LIGHT_TOOLKIT.GridDistance")}</span>
            <input
              type="number"
              min="0.01"
              step="any"
              inputmode="decimal"
              data-elt-grid-distance
              value="${Number.isFinite(gridDistance) ? gridDistance : 1}">
          </label>
          <label class="elt-grid-scale__field elt-grid-scale__field--units">
            <span>${game.i18n.localize("EVIL_LIGHT_TOOLKIT.GridUnits")}</span>
            <input
              type="text"
              data-elt-grid-units
              value="${gridUnits}">
          </label>
          <button type="button" class="elt-grid-scale__apply" data-elt-action="scene-grid-scale">
            <i class="fa-solid fa-check"></i>
            <span>${game.i18n.localize("EVIL_LIGHT_TOOLKIT.Apply")}</span>
          </button>
        </div>
      </section>

      <section class="elt-section">
        <div class="elt-section__heading">
          <div>
            <h3>${game.i18n.localize("EVIL_LIGHT_TOOLKIT.SectionAtmosphere")}</h3>
            <p>${game.i18n.localize("EVIL_LIGHT_TOOLKIT.SectionAtmosphereHint")}</p>
          </div>
        </div>
        <div class="elt-action-grid elt-action-grid--four">
          ${renderActionButton("darkness-day", "fa-cloud-sun", "EVIL_LIGHT_TOOLKIT.TestDay")}
          ${renderActionButton("darkness-dusk", "fa-cloud-moon", "EVIL_LIGHT_TOOLKIT.TestDusk")}
          ${renderActionButton("darkness-night", "fa-moon", "EVIL_LIGHT_TOOLKIT.TestNight")}
          ${renderActionButton("darkness-restore", "fa-rotate-left", "EVIL_LIGHT_TOOLKIT.RestoreDarkness")}
        </div>
      </section>

      <section class="elt-section">
        <div class="elt-section__heading">
          <div>
            <h3>${game.i18n.localize("EVIL_LIGHT_TOOLKIT.SectionLights")}</h3>
            <p>${game.i18n.localize("EVIL_LIGHT_TOOLKIT.PresetUsage")}</p>
          </div>
        </div>
        <div class="evil-light-toolkit-presets elt-preset-grid">
          ${sourcePresets.map(renderPresetButton).join("") || `<em>${game.i18n.localize("EVIL_LIGHT_TOOLKIT.NoPresets")}</em>`}
        </div>
      </section>

      <section class="elt-section">
        <div class="elt-section__heading">
          <div>
            <h3>${game.i18n.localize("EVIL_LIGHT_TOOLKIT.SectionUtilities")}</h3>
            <p>${game.i18n.localize("EVIL_LIGHT_TOOLKIT.SectionUtilitiesHint")}</p>
          </div>
        </div>
        <div class="evil-light-toolkit-presets elt-preset-grid elt-preset-grid--utility">
          ${utilityPresets.map(renderPresetButton).join("")}
        </div>
      </section>

      <footer class="elt-footer">
        <button type="button" class="elt-export" data-elt-action="export-light">
          <i class="fa-solid fa-file-export"></i>
          <span>${game.i18n.localize("EVIL_LIGHT_TOOLKIT.ExportSelectedLight")}</span>
        </button>
        <span>${game.i18n.localize("EVIL_LIGHT_TOOLKIT.FooterHint")}</span>
      </footer>
    </section>
  `;
}

function escapeHtmlAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderActionButton(action, icon, labelKey, hintKey = null) {
  const hint = hintKey ? game.i18n.localize(hintKey) : "";
  return `
    <button
      type="button"
      class="elt-action"
      data-elt-action="${action}"
      ${hint ? `title="${hint}"` : ""}>
      <i class="fa-solid ${icon}"></i>
      <span>${game.i18n.localize(labelKey)}</span>
    </button>
  `;
}

function renderPresetButton(preset) {
  const icons = {
    "candle-draft": "fa-fire-flame-simple",
    "oil-lamp-draft": "fa-lightbulb",
    "lantern-exterior-draft": "fa-sun",
    "campfire-draft": "fa-fire",
    "lit-window-draft": "fa-window-maximize",
    "neutral-light-draft": "fa-lightbulb",
    "transition-halo-draft": "fa-circle-dot",
    "vision-zone-draft": "fa-eye"
  };
  const icon = icons[preset.id] ?? "fa-lightbulb";

  return `
    <button
      type="button"
      class="elt-preset"
      draggable="true"
      data-preset-id="${preset.id}"
      title="${game.i18n.localize("EVIL_LIGHT_TOOLKIT.PresetDragHint")}">
      <i class="fa-solid ${icon}"></i>
      <span>${preset.label}</span>
      <i class="fa-solid fa-grip-vertical elt-preset__grip"></i>
    </button>
  `;
}

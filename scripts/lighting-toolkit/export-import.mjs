import { presetFromAmbientLight, validatePresetShape, ambientLightDataForPlacement } from "./presets.mjs";

export async function exportControlledAmbientLight() {
  if (!game.user?.isGM) return ui.notifications.warn(game.i18n.localize("EVIL_LIGHT_TOOLKIT.GmOnly"));
  const controlled = canvas?.lighting?.controlled ?? [];
  if (controlled.length !== 1) return ui.notifications.warn(game.i18n.localize("EVIL_LIGHT_TOOLKIT.SelectOneLight"));

  const document = controlled[0].document;
  const preset = presetFromAmbientLight(document);
  const filename = `${preset.id}.json`;

  foundry.utils.saveDataToFile(
    JSON.stringify(preset, null, 2),
    "application/json",
    filename
  );

  ui.notifications.info(game.i18n.localize("EVIL_LIGHT_TOOLKIT.ExportReady"));
  return preset;
}

export async function activatePresetForDrawing(preset) {
  if (!game.user?.isGM) return ui.notifications.warn(game.i18n.localize("EVIL_LIGHT_TOOLKIT.GmOnly"));

  const errors = validatePresetShape(preset);
  if (errors.length) throw new Error(errors.join(" "));

  const Palette = foundry.applications.sheets.palette.AmbientLightPalette;
  const createData = foundry.utils.deepClone(preset.ambientLight);

  delete createData._id;
  delete createData.x;
  delete createData.y;
  delete createData.name;

  await game.settings.set("core", Palette.SETTING_KEY, createData);
  ui.controls?.render({ parts: ["tools"] });
  ui.placeablesPalette?.render({ preset: createData, preservePlacement: true });
  return createData;
}

export async function placePresetAtCoordinates(preset, { x, y } = {}) {
  if (!game.user?.isGM) return ui.notifications.warn(game.i18n.localize("EVIL_LIGHT_TOOLKIT.GmOnly"));

  const scene = canvas?.scene;
  if (!scene) return ui.notifications.warn(game.i18n.localize("EVIL_LIGHT_TOOLKIT.NoScene"));
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Invalid canvas coordinates.");

  const data = ambientLightDataForPlacement(preset, { x, y });
  return scene.createEmbeddedDocuments("AmbientLight", [data]);
}

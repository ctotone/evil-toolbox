import {
  PACKAGE_ID,
  FEATURE_ID,
  BUILTIN_PRESET_INDEX,
  PRESET_SCHEMA,
  PRESET_SCHEMA_VERSION,
  FOUNDRY_GENERATION
} from "./constants.mjs";

const POSITION_KEYS = new Set(["_id", "x", "y"]);

export async function loadBuiltinPresets() {
  const presets = [];
  for (const id of BUILTIN_PRESET_INDEX) {
    try {
      const response = await fetch(`modules/${PACKAGE_ID}/presets/lights/${id}.json`);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      presets.push(await response.json());
    } catch (error) {
      console.warn(`${PACKAGE_ID} | Lighting Toolkit | Could not load preset ${id}`, error);
    }
  }
  return presets;
}

export function sanitizeAmbientLightData(source = {}) {
  const clone = foundry.utils.deepClone(source);
  for (const key of POSITION_KEYS) delete clone[key];
  if (clone.flags?.core) delete clone.flags.core;
  if (clone.flags?.[FEATURE_ID]) delete clone.flags[FEATURE_ID];
  if (clone.flags?.[PACKAGE_ID]) delete clone.flags[PACKAGE_ID];
  if (clone.flags && !Object.keys(clone.flags).length) delete clone.flags;
  return clone;
}

export function presetFromAmbientLight(document, { id, label } = {}) {
  const source = document?.toObject ? document.toObject() : document;
  const ambientLight = sanitizeAmbientLightData(source);
  return {
    schema: PRESET_SCHEMA,
    schemaVersion: PRESET_SCHEMA_VERSION,
    foundryGeneration: FOUNDRY_GENERATION,
    id: id || slugifyLightName(ambientLight.name || "ambient-light"),
    label: label || ambientLight.name || "Ambient Light",
    ambientLight
  };
}

export function validatePresetShape(preset) {
  const errors = [];
  if (preset?.schema !== PRESET_SCHEMA) errors.push("Invalid preset schema.");
  if (preset?.schemaVersion !== PRESET_SCHEMA_VERSION) errors.push("Unsupported preset schema version.");
  if (preset?.foundryGeneration !== FOUNDRY_GENERATION) errors.push("Unsupported Foundry generation.");
  if (!preset?.id) errors.push("Missing preset id.");
  if (!preset?.label) errors.push("Missing preset label.");
  if (!preset?.ambientLight?.config) errors.push("Missing ambientLight.config.");
  return errors;
}

export function ambientLightDataForPlacement(preset, { x = 0, y = 0 } = {}) {
  const errors = validatePresetShape(preset);
  if (errors.length) throw new Error(errors.join(" "));
  const data = foundry.utils.deepClone(preset.ambientLight);
  data.x = x;
  data.y = y;
  delete data._id;
  data.name ||= preset.label;
  data.flags ??= {};
  data.flags[FEATURE_ID] = {
    presetId: preset.id,
    presetLabel: preset.label,
    schemaVersion: preset.schemaVersion
  };
  return data;
}

export function slugifyLightName(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "ambient-light";
}

import { config } from "../../package.json";
import { getString } from "../utils/locale";

export async function registerPrefsScripts(_window: Window) {
  if (!addon.data.prefs) {
    addon.data.prefs = {
      window: _window,
    };
  } else {
    addon.data.prefs.window = _window;
  }
  updatePrefsUI();
  bindPrefEvents();
}

async function updatePrefsUI() {
  if (addon.data.prefs?.window == undefined) return;
  
  // Update threshold value display
  updateThresholdValue();
}

function bindPrefEvents() {
  if (!addon.data.prefs?.window) return;
  
  // Bind threshold slider event
  const thresholdSlider = addon.data.prefs.window.document?.querySelector(
    `#zotero-prefpane-${config.addonRef}-threshold`
  ) as HTMLInputElement;
  
  if (thresholdSlider) {
    thresholdSlider.addEventListener("input", updateThresholdValue);
  }
}

function updateThresholdValue() {
  if (!addon.data.prefs?.window) return;
  
  const thresholdSlider = addon.data.prefs.window.document?.querySelector(
    `#zotero-prefpane-${config.addonRef}-threshold`
  ) as HTMLInputElement;
  
  const thresholdValue = addon.data.prefs.window.document?.querySelector(
    `#zotero-prefpane-${config.addonRef}-threshold-value`
  ) as HTMLSpanElement;
  
  if (thresholdSlider && thresholdValue) {
    thresholdValue.textContent = thresholdSlider.value;
  }
}

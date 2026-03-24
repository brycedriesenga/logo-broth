import { createLogoSoup, getVisualCenterTransform } from "@sanity-labs/logo-soup";
import { DEFAULT_SETTINGS, type AlignBy, type ExportedLogo, type PluginSettings } from "./shared";

type SelectionDataMsg = {
  type: "selection-data";
  logos: ExportedLogo[];
  editableGrid: { settings: PluginSettings } | null;
};

type SettingsLoadedMsg = {
  type: "settings-loaded";
  settings: PluginSettings;
};

type MainToUi = SelectionDataMsg | SettingsLoadedMsg | { type: "process-error"; message: string };

let selection: ExportedLogo[] = [];
let settings: PluginSettings = { ...DEFAULT_SETTINGS };
let runId = 0;
let hasProcessedOnce = false;

const statusEl = must<HTMLDivElement>("status");
const processBtn = must<HTMLButtonElement>("process");

const engine = createLogoSoup();

bindInputs();

window.onmessage = (event: MessageEvent<{ pluginMessage: MainToUi }>) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;

  if (msg.type === "selection-data") {
    selection = msg.logos;
    if (msg.editableGrid?.settings) {
      settings = { ...msg.editableGrid.settings };
      syncInputsFromSettings();
    }
    renderStatus();
    if (settings.livePreview && hasProcessedOnce) {
      void runProcess();
    }
    return;
  }

  if (msg.type === "settings-loaded") {
    settings = { ...msg.settings };
    syncInputsFromSettings();
    renderStatus();
    return;
  }

  if (msg.type === "process-error") {
    statusEl.textContent = msg.message;
  }
};

processBtn.onclick = () => {
  void runProcess();
};

must<HTMLButtonElement>("refresh").onclick = () => {
  parent.postMessage({ pluginMessage: { type: "request-selection" } }, "*");
};

must<HTMLButtonElement>("close").onclick = () => {
  parent.postMessage({ pluginMessage: { type: "cancel" } }, "*");
};

function bindInputs() {
  bindNumber("count", (v) => (settings.count = v));
  bindNumber("shuffleSeed", (v) => (settings.shuffleSeed = v));
  bindNumber("baseSize", (v) => (settings.baseSize = v));
  bindNumber("scaleFactor", (v) => (settings.scaleFactor = v));
  bindBoolean("densityAware", (v) => (settings.densityAware = v));
  bindNumber("densityFactor", (v) => (settings.densityFactor = v));
  bindBoolean("cropToContent", (v) => (settings.cropToContent = v));
  bindSelect("alignBy", (v) => (settings.alignBy = v as AlignBy));
  bindNumber("gap", (v) => (settings.gap = v));
  bindBoolean("showImageBounds", (v) => (settings.showImageBounds = v));
  bindBoolean("showContainerBounds", (v) => (settings.showContainerBounds = v));
  bindBoolean("showHorizontalGrid", (v) => (settings.showHorizontalGrid = v));
  bindBoolean("showVerticalGrid", (v) => (settings.showVerticalGrid = v));
  bindNumber("gridSpacing", (v) => (settings.gridSpacing = v));
  bindBoolean("duplicateBeforeProcessing", (v) => (settings.duplicateBeforeProcessing = v));
  bindBoolean("livePreview", (v) => (settings.livePreview = v));
}

function bindNumber(id: keyof PluginSettings, onValue: (value: number) => void) {
  const el = must<HTMLInputElement>(id);
  const out = must<HTMLOutputElement>(`${id}-value`);

  const apply = () => {
    const value = Number(el.value);
    out.value = String(value);
    onValue(value);
    triggerLivePreview();
  };

  el.oninput = apply;
  el.onchange = apply;
}

function bindBoolean(id: keyof PluginSettings, onValue: (value: boolean) => void) {
  const el = must<HTMLInputElement>(id);
  el.onchange = () => {
    onValue(el.checked);
    triggerLivePreview();
  };
}

function bindSelect(id: keyof PluginSettings, onValue: (value: string) => void) {
  const el = must<HTMLSelectElement>(id);
  el.onchange = () => {
    onValue(el.value);
    triggerLivePreview();
  };
}

async function runProcess() {
  if (selection.length === 0) {
    statusEl.textContent = "Select at least one logo/image/vector node on the canvas.";
    return;
  }

  hasProcessedOnce = true;
  runId += 1;
  const currentRun = runId;

  const shuffled = shuffle(seedSubset(selection, settings.count), settings.shuffleSeed);
  const logos = shuffled.map((entry) => entry.dataUrl);

  statusEl.textContent = `Processing ${logos.length} logos…`;

  const unsubscribe = engine.subscribe(() => {
    const snap = engine.getSnapshot();
    if (snap.status === "loading") {
      statusEl.textContent = "Measuring image density and visual centers…";
    }
    if (snap.status === "error") {
      statusEl.textContent = snap.error?.message ?? "Processing failed";
    }
    if (snap.status === "ready") {
      const layout = snap.normalizedLogos.map((logo, index) => {
        const transform = getVisualCenterTransform(logo, settings.alignBy) ?? "translate(0px, 0px)";
        const offsets = parseTranslate(transform);
        return {
          nodeId: shuffled[index].nodeId,
          order: index,
          normalizedWidth: logo.normalizedWidth,
          normalizedHeight: logo.normalizedHeight,
          offsetX: offsets.x,
          offsetY: offsets.y,
        };
      });

      parent.postMessage(
        {
          pluginMessage: {
            type: "apply-layout",
            runId: currentRun,
            settings,
            layout: { logos: layout },
          },
        },
        "*",
      );

      statusEl.textContent = `Done. ${layout.length} logos normalized.`;
      unsubscribe();
    }
  });

  engine.process({
    logos,
    baseSize: settings.baseSize,
    scaleFactor: settings.scaleFactor,
    densityAware: settings.densityAware,
    densityFactor: settings.densityFactor,
    cropToContent: settings.cropToContent,
  });
}

function seedSubset<T>(arr: T[], count: number) {
  return arr.slice(0, Math.max(1, Math.min(count, arr.length)));
}

function shuffle<T>(arr: T[], seed: number): T[] {
  let state = seed;
  const rand = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  const clone = [...arr];
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
}

function parseTranslate(value: string): { x: number; y: number } {
  const match = value.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
  if (!match) return { x: 0, y: 0 };
  return { x: Number(match[1]), y: Number(match[2]) };
}

let liveTimer: number | undefined;
function triggerLivePreview() {
  renderStatus();
  if (!settings.livePreview || !hasProcessedOnce) return;
  window.clearTimeout(liveTimer);
  liveTimer = window.setTimeout(() => {
    void runProcess();
  }, 220);
}

function syncInputsFromSettings() {
  setInputValue("count", settings.count);
  setInputValue("shuffleSeed", settings.shuffleSeed);
  setInputValue("baseSize", settings.baseSize);
  setInputValue("scaleFactor", settings.scaleFactor);
  setCheck("densityAware", settings.densityAware);
  setInputValue("densityFactor", settings.densityFactor);
  setCheck("cropToContent", settings.cropToContent);
  setSelectValue("alignBy", settings.alignBy);
  setInputValue("gap", settings.gap);
  setCheck("showImageBounds", settings.showImageBounds);
  setCheck("showContainerBounds", settings.showContainerBounds);
  setCheck("showHorizontalGrid", settings.showHorizontalGrid);
  setCheck("showVerticalGrid", settings.showVerticalGrid);
  setInputValue("gridSpacing", settings.gridSpacing);
  setCheck("duplicateBeforeProcessing", settings.duplicateBeforeProcessing);
  setCheck("livePreview", settings.livePreview);
}

function setInputValue(id: string, value: number) {
  const input = must<HTMLInputElement>(id);
  input.value = String(value);
  const out = document.getElementById(`${id}-value`) as HTMLOutputElement | null;
  if (out) out.value = String(value);
}

function setCheck(id: string, value: boolean) {
  must<HTMLInputElement>(id).checked = value;
}

function setSelectValue(id: string, value: string) {
  must<HTMLSelectElement>(id).value = value;
}

function renderStatus() {
  statusEl.textContent = `${selection.length} selectable item(s). Ready.`;
}

function must<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element as T;
}

parent.postMessage({ pluginMessage: { type: "request-selection" } }, "*");

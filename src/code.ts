import { DEFAULT_SETTINGS, type ExportedLogo, type GridState, type PluginSettings } from "./shared";

type UiToMain =
  | { type: "request-selection" }
  | { type: "process"; settings: PluginSettings; runId: number }
  | { type: "apply-layout"; runId: number; settings: PluginSettings; layout: LayoutResult }
  | { type: "cancel" };

type MainToUi =
  | { type: "selection-data"; logos: ExportedLogo[]; editableGrid: EditableGridPayload | null }
  | { type: "process-error"; message: string }
  | { type: "settings-loaded"; settings: PluginSettings }
  | { type: "layout-applied"; gridState: GridState };

type LayoutLogo = {
  nodeId: string;
  order: number;
  normalizedWidth: number;
  normalizedHeight: number;
  offsetX: number;
  offsetY: number;
};

type LayoutResult = {
  logos: LayoutLogo[];
};

type EditableGridPayload = {
  settings: PluginSettings;
  childNodeIds: string[];
};

const GRID_PLUGIN_KEY = "logoBrothGrid";
const WRAPPER_PLUGIN_KEY = "logoBrothWrapper";
const CHILD_PLUGIN_KEY = "logoBrothOriginalChild";

figma.showUI(__html__, { width: 420, height: 760, themeColors: true });

figma.ui.onmessage = async (msg: UiToMain) => {
  if (msg.type === "request-selection") {
    await sendSelection();
    return;
  }

  if (msg.type === "process") {
    await sendSelection();
    figma.ui.postMessage({ type: "settings-loaded", settings: msg.settings } satisfies MainToUi);
    return;
  }

  if (msg.type === "apply-layout") {
    try {
      const gridState = await applyLayout(msg.layout, msg.settings);
      figma.ui.postMessage({ type: "layout-applied", gridState } satisfies MainToUi);
    } catch (error) {
      figma.ui.postMessage({
        type: "process-error",
        message: error instanceof Error ? error.message : "Unknown layout error",
      } satisfies MainToUi);
    }
    return;
  }

  if (msg.type === "cancel") {
    figma.closePlugin();
  }
};

figma.on("selectionchange", () => {
  void sendSelection();
});

async function sendSelection() {
  const selection = figma.currentPage.selection;
  const singleSelected = selection.length === 1 ? selection[0] : null;
  const editableGrid = singleSelected ? getEditableGrid(singleSelected) : null;

  let nodes: SceneNode[] = [];
  if (editableGrid) {
    nodes = editableGrid.childNodeIds
      .map((id) => figma.getNodeById(id))
      .filter((node): node is SceneNode => Boolean(node && node.type !== "PAGE" && node.type !== "DOCUMENT"));
  } else {
    nodes = selection.filter((node) => node.type !== "SLICE");
  }

  const exportable = nodes.filter(isExportableNode);
  const logos: ExportedLogo[] = [];

  for (const node of exportable) {
    const bytes = await node.exportAsync({ format: "PNG" });
    logos.push({
      nodeId: node.id,
      name: node.name,
      width: node.width,
      height: node.height,
      dataUrl: `data:image/png;base64,${figma.base64Encode(bytes)}`,
    });
  }

  figma.ui.postMessage({
    type: "selection-data",
    logos,
    editableGrid,
  } satisfies MainToUi);
}

function isExportableNode(node: SceneNode): node is SceneNode & ExportMixin {
  return "exportAsync" in node;
}

function getEditableGrid(node: SceneNode): EditableGridPayload | null {
  if (node.type !== "FRAME") return null;
  const raw = node.getPluginData(GRID_PLUGIN_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as EditableGridPayload;
    if (!Array.isArray(parsed.childNodeIds)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function getOrCreateGridFrame(settings: PluginSettings): FrameNode {
  const selected = figma.currentPage.selection;
  if (selected.length === 1 && selected[0].type === "FRAME" && selected[0].getPluginData(GRID_PLUGIN_KEY)) {
    return selected[0];
  }

  const frame = figma.createFrame();
  frame.name = "Logo Broth Grid";
  frame.layoutMode = "HORIZONTAL";
  frame.layoutWrap = "WRAP";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "AUTO";
  frame.itemSpacing = settings.gap;
  frame.counterAxisSpacing = settings.gap;
  frame.fills = [];
  frame.paddingLeft = 0;
  frame.paddingRight = 0;
  frame.paddingTop = 0;
  frame.paddingBottom = 0;
  const viewportCenter = figma.viewport.center;
  frame.x = viewportCenter.x;
  frame.y = viewportCenter.y;
  figma.currentPage.appendChild(frame);
  return frame;
}

async function applyLayout(layout: LayoutResult, settings: PluginSettings): Promise<GridState> {
  const frame = getOrCreateGridFrame(settings);
  frame.layoutMode = "HORIZONTAL";
  frame.layoutWrap = "WRAP";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "AUTO";
  frame.itemSpacing = settings.gap;
  frame.counterAxisSpacing = settings.gap;
  frame.strokes = settings.showContainerBounds
    ? [{ type: "SOLID", color: { r: 0.15, g: 0.45, b: 1 } }]
    : [];
  frame.strokeWeight = 1;

  const sorted = [...layout.logos].sort((a, b) => a.order - b.order);
  const childNodeIds: string[] = [];

  for (const [index, item] of sorted.entries()) {
    const original = figma.getNodeById(item.nodeId);
    if (!original || original.type === "PAGE" || original.type === "DOCUMENT") continue;

    const node = settings.duplicateBeforeProcessing ? original.clone() : original;

    const wrapper = ensureWrapper(frame, index);
    wrapper.name = `${index + 1}. ${node.name}`;
    wrapper.resizeWithoutConstraints(Math.max(1, item.normalizedWidth), Math.max(1, item.normalizedHeight));
    wrapper.strokes = settings.showImageBounds
      ? [{ type: "SOLID", color: { r: 1, g: 0.2, b: 0.2 } }]
      : [];
    wrapper.strokeWeight = settings.showImageBounds ? 1 : 0;

    const originalChildId = wrapper.getPluginData(CHILD_PLUGIN_KEY);
    if (originalChildId) {
      const oldChild = figma.getNodeById(originalChildId);
      if (oldChild && oldChild.parent === wrapper) {
        oldChild.remove();
      }
    }

    if (node.parent) node.remove();
    wrapper.appendChild(node);

    if ("resize" in node) {
      node.resize(Math.max(1, item.normalizedWidth), Math.max(1, item.normalizedHeight));
    }

    node.x = (wrapper.width - node.width) / 2 + item.offsetX;
    node.y = (wrapper.height - node.height) / 2 + item.offsetY;

    wrapper.setPluginData(CHILD_PLUGIN_KEY, node.id);
    childNodeIds.push(node.id);
  }

  cleanupExtraWrappers(frame, sorted.length);

  drawDebugGrid(frame, settings);

  const payload: EditableGridPayload = {
    settings,
    childNodeIds,
  };
  frame.setPluginData(GRID_PLUGIN_KEY, JSON.stringify(payload));

  figma.currentPage.selection = [frame];
  figma.viewport.scrollAndZoomIntoView([frame]);

  return {
    gridFrameId: frame.id,
    wrapperIds: frame.children
      .filter((child) => child.type === "FRAME" && child.getPluginData(WRAPPER_PLUGIN_KEY) === "1")
      .map((child) => child.id),
  };
}

function ensureWrapper(parent: FrameNode, index: number): FrameNode {
  const wrappers = parent.children.filter(
    (child): child is FrameNode => child.type === "FRAME" && child.getPluginData(WRAPPER_PLUGIN_KEY) === "1",
  );

  if (wrappers[index]) return wrappers[index];

  const wrapper = figma.createFrame();
  wrapper.layoutPositioning = "AUTO";
  wrapper.layoutMode = "NONE";
  wrapper.fills = [];
  wrapper.clipsContent = false;
  wrapper.setPluginData(WRAPPER_PLUGIN_KEY, "1");
  parent.appendChild(wrapper);
  return wrapper;
}

function cleanupExtraWrappers(parent: FrameNode, keepCount: number) {
  const wrappers = parent.children.filter(
    (child): child is FrameNode => child.type === "FRAME" && child.getPluginData(WRAPPER_PLUGIN_KEY) === "1",
  );
  wrappers.slice(keepCount).forEach((wrapper) => wrapper.remove());
}

function drawDebugGrid(parent: FrameNode, settings: PluginSettings) {
  const overlays = parent.children.filter((child) => child.type === "RECTANGLE" && child.getPluginData("logoBrothDebug") === "1");
  overlays.forEach((node) => node.remove());

  if (!settings.showHorizontalGrid && !settings.showVerticalGrid) return;

  const gridRect = figma.createRectangle();
  gridRect.name = "Grid Debug";
  gridRect.resize(Math.max(1, parent.width), Math.max(1, parent.height));
  gridRect.fills = [];
  gridRect.strokes = [{ type: "SOLID", color: { r: 0.1, g: 0.8, b: 0.2 }, opacity: 0.35 }];
  gridRect.strokeWeight = 1;
  gridRect.setPluginData("logoBrothDebug", "1");
  parent.insertChild(0, gridRect);
}

void sendSelection();
figma.ui.postMessage({ type: "settings-loaded", settings: DEFAULT_SETTINGS } satisfies MainToUi);

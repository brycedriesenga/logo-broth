export type AlignBy = "bounds" | "visual-center" | "visual-center-x" | "visual-center-y";

export type PluginSettings = {
  count: number;
  shuffleSeed: number;
  baseSize: number;
  scaleFactor: number;
  densityAware: boolean;
  densityFactor: number;
  cropToContent: boolean;
  alignBy: AlignBy;
  gap: number;
  showImageBounds: boolean;
  showContainerBounds: boolean;
  showHorizontalGrid: boolean;
  showVerticalGrid: boolean;
  gridSpacing: number;
  duplicateBeforeProcessing: boolean;
  livePreview: boolean;
};

export type ExportedLogo = {
  nodeId: string;
  name: string;
  width: number;
  height: number;
  dataUrl: string;
};

export const DEFAULT_SETTINGS: PluginSettings = {
  count: 20,
  shuffleSeed: 42,
  baseSize: 48,
  scaleFactor: 0.5,
  densityAware: true,
  densityFactor: 0.5,
  cropToContent: false,
  alignBy: "visual-center-y",
  gap: 28,
  showImageBounds: false,
  showContainerBounds: false,
  showHorizontalGrid: false,
  showVerticalGrid: false,
  gridSpacing: 16,
  duplicateBeforeProcessing: true,
  livePreview: true,
};

export type GridState = {
  gridFrameId: string;
  wrapperIds: string[];
};

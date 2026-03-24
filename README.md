# logo-broth

Figma implementation of Logo Soup for making logos look good together.

## What this plugin does

- Uses `@sanity-labs/logo-soup` to measure each selected logo/image and compute normalized sizes + visual-center offsets.
- Supports vectors and rasters by exporting the selected Figma nodes as PNGs for analysis, while preserving the original selected node format in output (the actual node is cloned/moved and resized, not rasterized).
- Builds a wrapping Auto Layout grid frame (`HORIZONTAL` + `WRAP`) where each logo is nested in its own frame for alignment transforms.
- Includes all Storybook playground controls from Logo Soup:
  - `count`
  - `shuffleSeed`
  - `baseSize`
  - `scaleFactor`
  - `densityAware`
  - `densityFactor`
  - `cropToContent`
  - `alignBy`
  - `gap`
  - `showImageBounds`
  - `showContainerBounds`
  - `showHorizontalGrid`
  - `showVerticalGrid`
  - `gridSpacing`
- Adds plugin workflow options:
  - `duplicateBeforeProcessing`
  - `livePreview`

## Usage

1. Install dependencies:
   ```bash
   npm install
   ```
2. Build:
   ```bash
   npm run build
   ```
3. In Figma: **Plugins → Development → Import plugin from manifest…** and choose `manifest.json`.
4. Select logos/graphics on canvas and run **Logo Broth**.
5. Click **Process** once, then tweak controls for live preview updates.
6. Re-open later and select the generated grid frame to continue editing previous settings.

## Scripts

- `npm run check` – TypeScript checks.
- `npm run build` – builds plugin files to `dist/`.

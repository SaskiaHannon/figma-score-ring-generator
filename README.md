# Score Ring Generator (Figma plugin)

Creates a complete set of score rings in one click: one main component plus a grid with one variant per value, per language, ready to export. You can still adjust color groups, texts and fonts afterwards.

## Installation (one time)

1. Download this repository (green **Code** button > **Download ZIP**) and unzip it.
2. Put the unzipped folder in a fixed location, e.g. `Documents/Figma plugins/`. Do not move it afterwards.
3. Open the Figma desktop app (local plugins do not work in the browser).
4. Go to **Plugins > Development > Import plugin from manifest...** and choose `manifest.json` in that folder.

## Creating a new set

1. Open a Figma file and go to the page where the set should go.
2. Run **Plugins > Development > Score Ring Generator**.
3. Fill in:
   - **Set**: name, the value range, and the scale (for 0 to 100, a value of 35 gives a ring that is 35% filled).
   - **Languages and texts**: a code per language (e.g. `nl`, `en`), a title and an optional subtitle.
   - **Color groups**: per group a name, an "up to and including" value, a color and a dot color (light, dark or no dot). The last group automatically runs up to the highest value.
   - **Style**: diameter, thickness, colors, rounded ends.
   - **Fonts**: choose from the fonts installed on your computer.
   - **Export**: PNG, SVG or JPG and the scale.
4. Click **Generate new set**.

You get a section with the main component, a legend and a grid per language. Each variant is named e.g. `quality-score-nl-035` and already has an export setting: select a grid and click **Export**.

## Editing an existing set

1. Select the section of the set (or anything inside it).
2. Run the plugin: it loads the settings of that set.
3. Change color groups, colors, texts, fonts or export settings and click **Update selected set**.

Range, scale, size, thickness, name and languages cannot be updated. Create a new set for that.

## Good to know

- Colors are stored in the variables `<name> colors`, texts in `<name> texts` (with one mode per language).
- If your Figma plan allows too few variable modes, the plugin puts the texts directly on the variants. You can still edit them via **Update selected set**.
- Do not rename the variants or the main component; the plugin finds them by name.
- Undo works with Cmd/Ctrl + Z.

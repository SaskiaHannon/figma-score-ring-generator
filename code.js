// Score Ring Generator
// Generates a set of score ring charts (one component + a grid of variants per language),
// with color groups, per-language texts and export settings. Existing sets can be updated.

var PLUGIN_KEY = "scoreRingConfig";
var SECTION_TAG = "scoreRingSet";

// ---------- helpers ----------

function hexToRgb(hex) {
  var h = String(hex || "").replace("#", "").trim();
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error("Invalid color: " + hex);
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255
  };
}

function solid(hex) {
  return { type: "SOLID", color: hexToRgb(hex) };
}

function boundSolid(hex, variable) {
  // Always store the real color as fallback, never black.
  return figma.variables.setBoundVariableForPaint(solid(hex), "color", variable);
}

function pad(v, len) {
  var s = String(v);
  while (s.length < len) s = "0" + s;
  return s;
}

function slug(s) {
  return String(s || "score")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "score";
}

function autoLayout(direction, name, spacing) {
  var f = figma.createFrame();
  f.name = name || "Frame";
  f.layoutMode = direction;
  f.primaryAxisSizingMode = "AUTO";
  f.counterAxisSizingMode = "AUTO";
  f.itemSpacing = spacing || 0;
  f.fills = [];
  f.clipsContent = false;
  return f;
}

function groupIndexFor(v, groups) {
  for (var i = 0; i < groups.length; i++) {
    if (v <= groups[i].upTo) return i;
  }
  return groups.length - 1;
}

function groupRanges(cfg) {
  var out = [];
  var start = cfg.from;
  for (var i = 0; i < cfg.groups.length; i++) {
    var end = i === cfg.groups.length - 1 ? cfg.to : cfg.groups[i].upTo;
    out.push({ min: start, max: end });
    start = end + 1;
  }
  return out;
}

function geometry(cfg) {
  var D = cfg.size;
  var T = cfg.thickness;
  var PAD = Math.max(4, Math.round(T * 0.5));
  var W = D + PAD * 2;
  var C = W / 2;
  var IR = (D / 2 - T) / (D / 2);
  var RM = D / 2 - T / 2;
  var DOT = Math.max(3, T * 0.31);
  var DD = 2 * (RM + DOT / 2);
  var DIR = (RM - DOT / 2) / (RM + DOT / 2);
  var SWEEP = DOT / RM;
  var BACK = cfg.rounded ? (T * 0.65) / RM : (DOT / 2 + 2) / RM;
  var k = D / 189;
  return { D: D, T: T, W: W, C: C, IR: IR, RM: RM, DOT: DOT, DD: DD, DIR: DIR, SWEEP: SWEEP, BACK: BACK, k: k };
}

function arcFor(v, cfg, g) {
  var frac = (v - cfg.scaleMin) / (cfg.scaleMax - cfg.scaleMin);
  frac = Math.max(0, Math.min(1, frac));
  if (frac >= 0.9999) return { startingAngle: -Math.PI / 2, endingAngle: (3 * Math.PI) / 2, innerRadius: g.IR };
  if (frac <= 0.0001) frac = 0.0001;
  return { startingAngle: -Math.PI / 2, endingAngle: -Math.PI / 2 + frac * 2 * Math.PI, innerRadius: g.IR };
}

function dotArcFor(v, cfg, g) {
  var frac = (v - cfg.scaleMin) / (cfg.scaleMax - cfg.scaleMin);
  frac = Math.max(0, Math.min(1, frac));
  var c = -Math.PI / 2 + frac * 2 * Math.PI - g.BACK;
  return { startingAngle: c - g.SWEEP / 2, endingAngle: c + g.SWEEP / 2, innerRadius: g.DIR };
}

function dotHex(cfg, group) {
  if (group.dot === "light") return cfg.dotLight;
  if (group.dot === "dark") return cfg.dotDark;
  return null; // "none"
}

async function loadFonts(cfg) {
  var list = [cfg.fonts.number, cfg.fonts.title, cfg.fonts.subtitle];
  for (var i = 0; i < list.length; i++) {
    try {
      await figma.loadFontAsync(list[i]);
    } catch (e) {
      throw new Error("Font not available: " + list[i].family + " " + list[i].style);
    }
  }
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });
}

function validate(cfg) {
  if (!cfg.name) throw new Error("Give the set a name.");
  if (!(Number.isInteger(cfg.from) && Number.isInteger(cfg.to) && cfg.from < cfg.to))
    throw new Error("Range: 'from' must be smaller than 'to'.");
  if (cfg.to - cfg.from > 400) throw new Error("Range too large (max 400 variants per language).");
  if (!(cfg.scaleMin < cfg.scaleMax)) throw new Error("Scale: min must be smaller than max.");
  if (!cfg.langs.length) throw new Error("Add at least one language.");
  var codes = {};
  for (var i = 0; i < cfg.langs.length; i++) {
    var c = slug(cfg.langs[i].code);
    if (codes[c]) throw new Error("Language code used twice: " + c);
    codes[c] = true;
  }
  if (!cfg.groups.length) throw new Error("Add at least one color group.");
  var prev = cfg.from - 1;
  for (var j = 0; j < cfg.groups.length - 1; j++) {
    var u = cfg.groups[j].upTo;
    if (!Number.isInteger(u) || u <= prev || u >= cfg.to)
      throw new Error("Color groups: the 'up to' values must go up and stay below " + cfg.to + ".");
    prev = u;
  }
  cfg.groups[cfg.groups.length - 1].upTo = cfg.to;
  var labels = {};
  for (var m = 0; m < cfg.groups.length; m++) {
    var l = String(cfg.groups[m].label || "").trim();
    if (!l) throw new Error("Every color group needs a name.");
    if (labels[l]) throw new Error("Color group name used twice: " + l);
    labels[l] = true;
    hexToRgb(cfg.groups[m].color);
  }
}

// ---------- variables ----------

async function ensureColorVariables(cfg, stored) {
  var col = stored && stored.colorCollectionId
    ? await figma.variables.getVariableCollectionByIdAsync(stored.colorCollectionId)
    : null;
  if (!col) col = figma.variables.createVariableCollection(cfg.name + " colors");
  var modeId = col.modes[0].modeId;
  var oldIds = (stored && stored.groupVarIds) || [];
  var ids = [];
  for (var i = 0; i < cfg.groups.length; i++) {
    var v = oldIds[i] ? await figma.variables.getVariableByIdAsync(oldIds[i]) : null;
    if (!v) {
      v = figma.variables.createVariable("groups/" + cfg.groups[i].label, col, "COLOR");
      v.scopes = ["SHAPE_FILL", "FRAME_FILL"];
    } else {
      v.name = "groups/" + cfg.groups[i].label;
    }
    v.setValueForMode(modeId, hexToRgb(cfg.groups[i].color));
    ids.push(v.id);
  }
  for (var j = cfg.groups.length; j < oldIds.length; j++) {
    var extra = await figma.variables.getVariableByIdAsync(oldIds[j]);
    if (extra) extra.remove();
  }
  var vars = [];
  for (var k = 0; k < ids.length; k++) vars.push(await figma.variables.getVariableByIdAsync(ids[k]));
  return { collection: col, ids: ids, vars: vars };
}

function createTextVariables(cfg) {
  // Returns null when the Figma plan does not allow enough modes.
  var col = figma.variables.createVariableCollection(cfg.name + " texts");
  try {
    var modeIds = [];
    col.renameMode(col.modes[0].modeId, cfg.langs[0].code.toUpperCase());
    modeIds.push(col.modes[0].modeId);
    for (var i = 1; i < cfg.langs.length; i++) modeIds.push(col.addMode(cfg.langs[i].code.toUpperCase()));
    var title = figma.variables.createVariable("title", col, "STRING");
    var subtitle = figma.variables.createVariable("subtitle", col, "STRING");
    title.scopes = ["TEXT_CONTENT"];
    subtitle.scopes = ["TEXT_CONTENT"];
    for (var j = 0; j < cfg.langs.length; j++) {
      title.setValueForMode(modeIds[j], cfg.langs[j].title || "");
      subtitle.setValueForMode(modeIds[j], cfg.langs[j].subtitle || "");
    }
    return { collection: col, modeIds: modeIds, title: title, subtitle: subtitle };
  } catch (e) {
    col.remove();
    return null;
  }
}

// ---------- building ----------

function buildComponent(cfg, g, colorVars, textVars) {
  var comp = figma.createComponent();
  comp.name = cfg.name + " / base";
  comp.resize(g.W, g.W);
  comp.fills = [];
  comp.clipsContent = false;

  var track = figma.createEllipse();
  track.name = "Track";
  track.resize(g.D, g.D);
  track.x = g.C - g.D / 2;
  track.y = g.C - g.D / 2;
  track.arcData = { startingAngle: 0, endingAngle: 2 * Math.PI, innerRadius: g.IR };
  track.fills = [solid(cfg.trackColor)];
  comp.appendChild(track);

  var arc = figma.createEllipse();
  arc.name = "Score arc";
  arc.resize(g.D, g.D);
  arc.x = g.C - g.D / 2;
  arc.y = g.C - g.D / 2;
  var sample = Math.round((cfg.from + cfg.to) / 2);
  arc.arcData = arcFor(sample, cfg, g);
  if (cfg.rounded) arc.cornerRadius = 1000;
  var gi = groupIndexFor(sample, cfg.groups);
  arc.fills = [boundSolid(cfg.groups[gi].color, colorVars[gi])];
  comp.appendChild(arc);

  var dot = figma.createEllipse();
  dot.name = "Score dot";
  dot.resize(g.DD, g.DD);
  dot.x = g.C - g.DD / 2;
  dot.y = g.C - g.DD / 2;
  dot.arcData = dotArcFor(sample, cfg, g);
  dot.cornerRadius = g.DOT / 2;
  dot.fills = [solid(cfg.dotDark)];
  comp.appendChild(dot);

  var txt = autoLayout("VERTICAL", "Text", 0);
  txt.counterAxisAlignItems = "CENTER";
  comp.appendChild(txt);

  function mkText(name, font, size, chars) {
    var t = figma.createText();
    t.fontName = font;
    t.fontSize = Math.round(size * g.k * 100) / 100;
    t.lineHeight = { unit: "PERCENT", value: 110 };
    t.textAlignHorizontal = "CENTER";
    t.characters = chars;
    t.name = name;
    t.fills = [solid(cfg.textColor)];
    return t;
  }

  var tNum = mkText("Score", cfg.fonts.number, 49, String(sample));
  txt.appendChild(tNum);
  var tWrap = autoLayout("VERTICAL", "Title wrap", 0);
  tWrap.paddingBottom = Math.round(4 * g.k);
  txt.appendChild(tWrap);
  var tTitle = mkText("Title", cfg.fonts.title, 13.73, cfg.langs[0].title || " ");
  tWrap.appendChild(tTitle);
  var tSub = mkText("Subtitle", cfg.fonts.subtitle, 9.73, cfg.langs[0].subtitle || " ");
  txt.appendChild(tSub);

  if (textVars) {
    tTitle.setBoundVariable("characters", textVars.title);
    tSub.setBoundVariable("characters", textVars.subtitle);
  }
  var key = comp.addComponentProperty("Score", "TEXT", String(sample));
  tNum.componentPropertyReferences = { characters: key };

  txt.x = g.C - txt.width / 2;
  txt.y = g.C - txt.height / 2;
  txt.constraints = { horizontal: "CENTER", vertical: "CENTER" };

  comp.description =
    "Score ring. Score via property 'Score'. Colors via variables '" + cfg.name +
    " colors'. Generated with Score Ring Generator.";
  return { comp: comp, key: key };
}

function styleInstance(inst, v, cfg, g, colorVars) {
  var gi = groupIndexFor(v, cfg.groups);
  var group = cfg.groups[gi];
  var arc = inst.findOne(function (n) { return n.name === "Score arc"; });
  var dot = inst.findOne(function (n) { return n.name === "Score dot"; });
  if (arc) arc.fills = [boundSolid(group.color, colorVars[gi])];
  if (dot) {
    var dh = dotHex(cfg, group);
    dot.visible = !!dh;
    if (dh) dot.fills = [solid(dh)];
  }
}

function setInstanceTexts(inst, lang) {
  var t = inst.findOne(function (n) { return n.name === "Title" && n.type === "TEXT"; });
  var s = inst.findOne(function (n) { return n.name === "Subtitle" && n.type === "TEXT"; });
  if (t) t.characters = lang.title || " ";
  if (s) s.characters = lang.subtitle || " ";
}

function buildLegend(cfg, legend) {
  // Clear and rebuild legend rows
  for (var c = legend.children.length - 1; c >= 0; c--) legend.children[c].remove();
  var head = figma.createText();
  head.fontName = { family: "Inter", style: "Bold" };
  head.fontSize = 20;
  head.characters = "Color groups";
  legend.appendChild(head);
  var ranges = groupRanges(cfg);
  for (var i = 0; i < cfg.groups.length; i++) {
    var row = autoLayout("HORIZONTAL", "Legend " + cfg.groups[i].label, 12);
    row.counterAxisAlignItems = "CENTER";
    var sw = figma.createEllipse();
    sw.resize(20, 20);
    sw.fills = [solid(cfg.groups[i].color)];
    row.appendChild(sw);
    var t = figma.createText();
    t.fontName = { family: "Inter", style: "Regular" };
    t.fontSize = 16;
    var dotLabel = cfg.groups[i].dot === "none" ? "no dot" : cfg.groups[i].dot === "light" ? "light dot" : "dark dot";
    t.characters = cfg.groups[i].label + ": " + ranges[i].min + " to " + ranges[i].max + " (" + dotLabel + ")";
    row.appendChild(t);
    legend.appendChild(row);
  }
  var note = figma.createText();
  note.fontName = { family: "Inter", style: "Regular" };
  note.fontSize = 13;
  note.lineHeight = { unit: "PERCENT", value: 150 };
  note.fills = [solid("#555555")];
  var digits = String(cfg.to).length;
  note.characters =
    "Export: select a grid and export (" + cfg.exportFormat + (cfg.exportFormat === "PNG" ? " @" + cfg.exportScale + "x" : "") + ", transparent).\n" +
    "File names: " + slug(cfg.name) + "-" + slug(cfg.langs[0].code) + "-" + pad(cfg.from, digits) + " ... " +
    slug(cfg.name) + "-" + slug(cfg.langs[cfg.langs.length - 1].code) + "-" + pad(cfg.to, digits) + ".\n" +
    "Change groups, colors or texts: select this section and run Score Ring Generator.";
  legend.appendChild(note);
}

function exportSettingsFor(cfg) {
  if (cfg.exportFormat === "SVG") return [{ format: "SVG", suffix: "" }];
  if (cfg.exportFormat === "JPG") return [{ format: "JPG", suffix: "", constraint: { type: "SCALE", value: cfg.exportScale } }];
  return [{ format: "PNG", suffix: "", constraint: { type: "SCALE", value: cfg.exportScale } }];
}

function freeSpotX(page) {
  var maxX = 0;
  var found = false;
  for (var i = 0; i < page.children.length; i++) {
    var n = page.children[i];
    var r = n.x + n.width;
    if (!found || r > maxX) { maxX = r; found = true; }
  }
  return found ? maxX + 400 : 0;
}

async function generate(cfg) {
  validate(cfg);
  await loadFonts(cfg);
  var g = geometry(cfg);
  var page = figma.currentPage;

  var colors = await ensureColorVariables(cfg, null);
  var textVars = cfg.langs.length > 0 ? createTextVariables(cfg) : null;

  var section = figma.createSection();
  section.name = cfg.name + " exports";
  page.appendChild(section);
  section.x = freeSpotX(page);
  section.y = 0;

  var built = buildComponent(cfg, g, colors.vars, textVars);
  var comp = built.comp;

  var wrap = autoLayout("VERTICAL", cfg.name + " overview", 48);
  wrap.paddingTop = wrap.paddingBottom = wrap.paddingLeft = wrap.paddingRight = 64;
  wrap.fills = [solid("#F2F2F2")];
  section.appendChild(wrap);
  wrap.x = 0;
  wrap.y = 0;

  var header = autoLayout("HORIZONTAL", "Header", 80);
  wrap.appendChild(header);
  var compBox = autoLayout("VERTICAL", "Main component", 12);
  header.appendChild(compBox);
  var ct = figma.createText();
  ct.fontName = { family: "Inter", style: "Bold" };
  ct.fontSize = 20;
  ct.characters = "Main component";
  compBox.appendChild(ct);
  compBox.appendChild(comp);
  var legend = autoLayout("VERTICAL", "Legend", 12);
  header.appendChild(legend);
  buildLegend(cfg, legend);

  var digits = String(cfg.to).length;
  var count = 0;
  for (var li = 0; li < cfg.langs.length; li++) {
    var lang = cfg.langs[li];
    var code = slug(lang.code);
    var block = autoLayout("VERTICAL", "Variants " + code.toUpperCase(), 16);
    wrap.appendChild(block);
    var lt = figma.createText();
    lt.fontName = { family: "Inter", style: "Bold" };
    lt.fontSize = 20;
    lt.characters = (lang.label || code.toUpperCase());
    block.appendChild(lt);

    var grid = autoLayout("HORIZONTAL", "Grid " + code.toUpperCase(), 24);
    block.appendChild(grid);
    grid.layoutWrap = "WRAP";
    grid.counterAxisSpacing = 24;
    grid.primaryAxisSizingMode = "FIXED";
    grid.resize(cfg.columns * g.W + (cfg.columns - 1) * 24, g.W);
    grid.counterAxisSizingMode = "AUTO";
    if (textVars) grid.setExplicitVariableModeForCollection(textVars.collection, textVars.modeIds[li]);

    for (var v = cfg.from; v <= cfg.to; v++) {
      var inst = comp.createInstance();
      grid.appendChild(inst);
      inst.name = slug(cfg.name) + "-" + code + "-" + pad(v, digits);
      var props = {};
      props[built.key] = String(v);
      inst.setProperties(props);
      if (textVars) inst.setExplicitVariableModeForCollection(textVars.collection, textVars.modeIds[li]);
      else setInstanceTexts(inst, lang);
      var arc = inst.findOne(function (n) { return n.name === "Score arc"; });
      var dot = inst.findOne(function (n) { return n.name === "Score dot"; });
      arc.arcData = arcFor(v, cfg, g);
      dot.arcData = dotArcFor(v, cfg, g);
      styleInstance(inst, v, cfg, g, colors.vars);
      inst.exportSettings = exportSettingsFor(cfg);
      count++;
    }
  }

  section.resizeWithoutConstraints(wrap.width, wrap.height);

  var stored = {
    version: 1,
    cfg: cfg,
    componentId: comp.id,
    legendId: legend.id,
    colorCollectionId: colors.collection.id,
    groupVarIds: colors.ids,
    textCollectionId: textVars ? textVars.collection.id : null,
    textModeIds: textVars ? textVars.modeIds : null,
    titleVarId: textVars ? textVars.title.id : null,
    subtitleVarId: textVars ? textVars.subtitle.id : null
  };
  section.setPluginData(PLUGIN_KEY, JSON.stringify(stored));
  section.setPluginData(SECTION_TAG, "1");

  figma.viewport.scrollAndZoomIntoView([section]);
  figma.currentPage.selection = [section];
  return { count: count, usedTextVariables: !!textVars, sectionId: section.id };
}

// ---------- updating ----------

function findSetSection(node) {
  var n = node;
  while (n && n.type !== "PAGE" && n.type !== "DOCUMENT") {
    if (n.type === "SECTION" && n.getPluginData(SECTION_TAG) === "1") return n;
    n = n.parent;
  }
  return null;
}

function selectedSet() {
  var sel = figma.currentPage.selection;
  for (var i = 0; i < sel.length; i++) {
    var s = findSetSection(sel[i]);
    if (s) return s;
  }
  return null;
}

async function update(cfg) {
  var section = selectedSet();
  if (!section) throw new Error("Select a generated set (or something inside it) first.");
  var stored = JSON.parse(section.getPluginData(PLUGIN_KEY));
  var old = stored.cfg;

  if (cfg.from !== old.from || cfg.to !== old.to || cfg.scaleMin !== old.scaleMin || cfg.scaleMax !== old.scaleMax)
    throw new Error("The range or scale changed. Generate a new set for that.");
  if (cfg.size !== old.size || cfg.thickness !== old.thickness || cfg.rounded !== old.rounded)
    throw new Error("Size, thickness or rounded ends changed. Generate a new set for that.");
  if (slug(cfg.name) !== slug(old.name)) throw new Error("The name changed. Generate a new set for that.");
  var oldCodes = old.langs.map(function (l) { return slug(l.code); }).join(",");
  var newCodes = cfg.langs.map(function (l) { return slug(l.code); }).join(",");
  if (oldCodes !== newCodes) throw new Error("Languages were added, removed or reordered. Generate a new set for that.");

  validate(cfg);
  await loadFonts(cfg);
  var g = geometry(cfg);

  var colors = await ensureColorVariables(cfg, stored);
  stored.groupVarIds = colors.ids;

  // Master component: fonts and colors
  var comp = await figma.getNodeByIdAsync(stored.componentId);
  if (!comp) throw new Error("Main component of this set was not found.");
  var map = { Score: cfg.fonts.number, Title: cfg.fonts.title, Subtitle: cfg.fonts.subtitle };
  var texts = comp.findAll(function (n) { return n.type === "TEXT"; });
  for (var i = 0; i < texts.length; i++) {
    var t = texts[i];
    if (t.fontName !== figma.mixed) {
      try { await figma.loadFontAsync(t.fontName); } catch (e) { /* old font missing: setting a new font still works */ }
    }
    if (map[t.name]) t.fontName = map[t.name];
    t.fills = [solid(cfg.textColor)];
  }
  var track = comp.findOne(function (n) { return n.name === "Track"; });
  if (track) track.fills = [solid(cfg.trackColor)];
  var txt = comp.findOne(function (n) { return n.name === "Text"; });
  if (txt) { txt.x = g.C - txt.width / 2; txt.y = g.C - txt.height / 2; }

  // Texts
  var useVars = !!stored.textCollectionId;
  if (useVars) {
    var tv = await figma.variables.getVariableByIdAsync(stored.titleVarId);
    var sv = await figma.variables.getVariableByIdAsync(stored.subtitleVarId);
    for (var li = 0; li < cfg.langs.length; li++) {
      if (tv) tv.setValueForMode(stored.textModeIds[li], cfg.langs[li].title || "");
      if (sv) sv.setValueForMode(stored.textModeIds[li], cfg.langs[li].subtitle || "");
    }
  }

  // Instances
  var prefix = slug(cfg.name) + "-";
  var langByCode = {};
  cfg.langs.forEach(function (l) { langByCode[slug(l.code)] = l; });
  var re = new RegExp("^" + prefix.replace(/[-]/g, "\\-") + "([a-z0-9-]+)-(\\d+)$");
  var insts = section.findAll(function (n) { return n.type === "INSTANCE" && re.test(n.name); });
  var count = 0;
  for (var k = 0; k < insts.length; k++) {
    var m = insts[k].name.match(re);
    var v = parseInt(m[2], 10);
    styleInstance(insts[k], v, cfg, g, colors.vars);
    if (!useVars && langByCode[m[1]]) setInstanceTexts(insts[k], langByCode[m[1]]);
    insts[k].exportSettings = exportSettingsFor(cfg);
    count++;
  }

  var legend = await figma.getNodeByIdAsync(stored.legendId);
  if (legend) buildLegend(cfg, legend);

  stored.cfg = cfg;
  section.setPluginData(PLUGIN_KEY, JSON.stringify(stored));
  return { count: count };
}

// ---------- UI wiring ----------

function sendSelection() {
  var s = selectedSet();
  if (!s) {
    figma.ui.postMessage({ type: "selection", set: null });
    return;
  }
  var stored = JSON.parse(s.getPluginData(PLUGIN_KEY));
  figma.ui.postMessage({ type: "selection", set: { name: s.name, cfg: stored.cfg } });
}

figma.showUI(__html__, { width: 440, height: 720, themeColors: true });

(async function init() {
  var fonts = await figma.listAvailableFontsAsync();
  var catalog = {};
  for (var i = 0; i < fonts.length; i++) {
    var f = fonts[i].fontName;
    if (!catalog[f.family]) catalog[f.family] = [];
    catalog[f.family].push(f.style);
  }
  figma.ui.postMessage({ type: "fonts", catalog: catalog });
  sendSelection();
})();

figma.on("selectionchange", sendSelection);

figma.ui.onmessage = async function (msg) {
  try {
    if (msg.type === "generate") {
      var r = await generate(msg.cfg);
      figma.ui.postMessage({
        type: "done",
        text: r.count + " variants created." + (r.usedTextVariables ? "" : " (Your Figma plan allows too few variable modes, so texts were set directly.)")
      });
      figma.notify(r.count + " score rings created");
      sendSelection();
    } else if (msg.type === "update") {
      var u = await update(msg.cfg);
      figma.ui.postMessage({ type: "done", text: u.count + " variants updated." });
      figma.notify(u.count + " score rings updated");
    } else if (msg.type === "close") {
      figma.closePlugin();
    }
  } catch (e) {
    figma.ui.postMessage({ type: "error", text: e.message || String(e) });
  }
};

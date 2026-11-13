// Éditeur YAML (CodeMirror 6) : coloration, validation côté serveur, autocomplétion Glance.
// Les couleurs viennent de variables CSS (--ed-*) : thème clair / sombre / système géré par le CSS.
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting, indentUnit, foldGutter, foldKeymap, bracketMatching } from "@codemirror/language";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { linter, lintGutter, lintKeymap } from "@codemirror/lint";
import { yaml } from "@codemirror/lang-yaml";
import { tags as t } from "@lezer/highlight";
import * as S from "./schema.js";

const theme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "var(--ed-bg)", color: "var(--ed-fg)", fontSize: "13px" },
  ".cm-scroller": { fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', lineHeight: "1.6" },
  ".cm-content": { caretColor: "var(--ed-caret)", padding: "10px 0" },
  ".cm-cursor": { borderLeftColor: "var(--ed-caret)" },
  "&.cm-focused": { outline: "none" },
  ".cm-gutters": { backgroundColor: "var(--ed-bg)", color: "var(--ed-gutter)", border: "none" },
  ".cm-activeLine": { backgroundColor: "var(--ed-active)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--ed-active)", color: "var(--ed-fg)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": { backgroundColor: "var(--ed-selection) !important" },
  ".cm-matchingBracket": { backgroundColor: "var(--ed-selection)", outline: "none" },
  ".cm-tooltip": { backgroundColor: "var(--panel)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: "8px", overflow: "hidden" },
  ".cm-tooltip-autocomplete > ul": { fontFamily: "inherit", maxHeight: "260px" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "var(--accent)", color: "var(--on-accent)" },
  ".cm-completionDetail": { opacity: ".7", marginLeft: "1em", fontStyle: "normal" },
  ".cm-diagnostic": { fontFamily: "system-ui, sans-serif", fontSize: "12px" },
  ".cm-lintRange-error": { backgroundImage: "none", textDecoration: "underline wavy var(--danger)" },
  ".cm-lintRange-warning": { backgroundImage: "none", textDecoration: "underline wavy #d9a400" },
  ".cm-searchMatch": { backgroundColor: "var(--ed-selection)" },
  ".cm-panels": { backgroundColor: "var(--panel)", color: "var(--text)" },
  ".cm-panels input, .cm-panels button": { font: "inherit" },
});

const highlight = HighlightStyle.define([
  { tag: t.comment, color: "var(--syn-comment)", fontStyle: "italic" },
  { tag: [t.propertyName, t.definition(t.propertyName)], color: "var(--syn-key)" },
  { tag: [t.string, t.content], color: "var(--syn-string)" },
  { tag: [t.number, t.bool, t.null], color: "var(--syn-number)" },
  { tag: [t.keyword, t.atom, t.labelName], color: "var(--syn-keyword)" },
  { tag: [t.meta, t.separator, t.punctuation, t.squareBracket, t.brace], color: "var(--syn-punct)" },
  { tag: [t.typeName, t.tagName], color: "var(--syn-keyword)" },
]);

// ---------- Autocomplétion ----------

const indentOf = (s) => s.length - s.trimStart().length;
const keyOf = (s) => (s.trim().replace(/^-\s+/, "").match(/^([\w$-]+)\s*:/) || [])[1];

function keyOptions(keys, docs = S.KEY_DOCS) {
  return keys.map((k) => ({ label: k, type: "property", detail: docs[k], apply: `${k}: `, boost: k === "type" ? 5 : 0 }));
}

// Remonte les lignes à indentation plus faible pour connaître le contexte (chaîne de clés parentes).
function context(doc, lineNo) {
  const lines = (n) => doc.line(n).text;
  const cur = lines(lineNo);
  const curIndent = indentOf(cur.replace(/^(\s*)-\s+/, "$1  "));
  const chain = [];
  let ind = curIndent;
  for (let n = lineNo - 1; n >= 1 && ind > 0; n--) {
    const l = lines(n);
    if (!l.trim() || l.trim().startsWith("#")) continue;
    const li = indentOf(l.replace(/^(\s*)-\s+/, "$1  "));
    if (li < ind) {
      chain.unshift({ key: keyOf(l), indent: li, line: l });
      ind = li;
    }
  }
  // widget courant : `type: X` dans le même bloc (même indentation, avant ou après)
  let type;
  const scan = (from, to, step) => {
    for (let n = from; n >= 1 && n <= doc.lines && !type; n += step) {
      const l = lines(n);
      if (!l.trim()) continue;
      const li = indentOf(l.replace(/^(\s*)-\s+/, "$1  "));
      if (li < curIndent) return;
      if (li === curIndent) {
        if (step === -1 && /^\s*-\s/.test(l) && n !== lineNo) {
          const m = l.match(/^\s*-\s+type:\s*([\w-]+)/);
          if (m) type = m[1];
          return; // début de l'élément de liste
        }
        const m = l.match(/^\s*(?:-\s+)?type:\s*([\w-]+)/);
        if (m) type = m[1];
        if (step === 1 && /^\s*-\s/.test(l)) return;
      }
    }
  };
  scan(lineNo - 1, 1, -1);
  if (!type) scan(lineNo + 1, doc.lines, 1);
  return { chain, type, curIndent };
}

function glanceCompletions(ctx) {
  const { state, pos } = ctx;
  const line = state.doc.lineAt(pos);
  const before = line.text.slice(0, pos - line.from);

  // type: <valeur>
  let m = before.match(/^(\s*(?:-\s+)?type:\s*)([\w-]*)$/);
  if (m) {
    return {
      from: pos - m[2].length,
      options: Object.entries(S.WIDGET_TYPES).map(([k, d]) => ({ label: k, type: "class", detail: d })),
      validFor: /^[\w-]*$/,
    };
  }
  // clé: <valeur>
  m = before.match(/^\s*(?:-\s+)?([\w$-]+):\s+([\w-]*)$/);
  if (m) {
    const vals = S.VALUES[m[1]];
    if (!vals) return null;
    return { from: pos - m[2].length, options: vals.map((v) => ({ label: v, type: "enum" })), validFor: /^[\w-]*$/ };
  }
  // nouvelle clé
  m = before.match(/^(\s*(?:-\s+)?)([\w$-]*)$/);
  if (!m || (!m[2] && !ctx.explicit)) return null;
  const { chain, type } = context(state.doc, line.number);
  const parent = chain.at(-1)?.key;
  let keys;
  if (chain.some((c) => c.key === "sites") && parent === "sites") keys = S.SITE_KEYS;
  else if (type) keys = [...new Set([...S.COMMON, ...(S.WIDGET_KEYS[type] ?? [])])];
  else if (!chain.length) keys = S.ROOT_KEYS;
  else if (parent === "theme") keys = S.THEME_KEYS;
  else if (parent === "server") keys = S.SERVER_KEYS;
  else if (parent === "branding") keys = S.BRANDING_KEYS;
  else if (parent === "pages") keys = S.PAGE_KEYS;
  else if (parent === "columns") keys = S.COLUMN_KEYS;
  else if (parent === "widgets") keys = ["type", "$include"];
  else keys = [];
  if (!keys.length) return null;
  return { from: pos - m[2].length, options: keyOptions(keys), validFor: /^[\w$-]*$/ };
}

// ---------- Validation (serveur) ----------

const serverLint = linter(
  async (view) => {
    const content = view.state.doc.toString();
    try {
      const r = await fetch("/api/validate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content }) });
      if (!r.ok) return [];
      const marks = await r.json();
      const len = content.length;
      return marks.map((m) => ({ from: Math.min(m.from, len), to: Math.min(Math.max(m.to, m.from), len), severity: m.severity, message: m.message }));
    } catch {
      return [];
    }
  },
  { delay: 350 },
);

// ---------- API ----------

export function createEditor(parent, { onChange, onSave }) {
  const make = (doc) =>
    EditorState.create({
      doc,
      extensions: [
        lineNumbers(), foldGutter(), highlightActiveLineGutter(), highlightActiveLine(), drawSelection(),
        history(), bracketMatching(), closeBrackets(), highlightSelectionMatches(),
        EditorState.tabSize.of(2), indentUnit.of("  "),
        yaml(), syntaxHighlighting(highlight), theme,
        autocompletion({ override: [glanceCompletions], activateOnTyping: true }),
        lintGutter(), serverLint,
        keymap.of([
          { key: "Mod-s", preventDefault: true, run: () => (onSave(), true) },
          indentWithTab, ...closeBracketsKeymap, ...completionKeymap, ...lintKeymap, ...searchKeymap, ...foldKeymap, ...historyKeymap, ...defaultKeymap,
        ]),
        EditorView.updateListener.of((u) => u.docChanged && onChange()),
      ],
    });
  const view = new EditorView({ state: make(""), parent });
  return {
    open: (text) => view.setState(make(text)), // un état neuf = historique d'annulation propre à chaque fichier
    value: () => view.state.doc.toString(),
    focus: () => view.focus(),
  };
}

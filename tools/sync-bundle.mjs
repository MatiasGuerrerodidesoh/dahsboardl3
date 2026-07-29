#!/usr/bin/env node
/**
 * tools/sync-bundle.mjs
 *
 * Mantiene la PARIDAD entre
 *   "Dashboard FNDR L3.dc.html"  ← diseño editable, FUENTE DE VERDAD
 *   "index.html"                 ← bundle de 1 MB que sirve GitHub Pages
 *
 * ANATOMÍA DEL BUNDLE
 * -------------------
 * index.html es un contenedor "__bundler". Todo el documento del diseño vive
 * como UN string JSON dentro de:
 *
 *     <script type="__bundler/template">\n
 *     "<!DOCTYPE html>\n<html><head>… todo el dc.html …</html>"
 *       </script>
 *
 * El escape es EXACTAMENTE:   JSON.stringify(doc).replace(/<\//g, '<\\u002F')
 * (verificado byte a byte: re-escapar el string decodificado reproduce el
 * original carácter por carácter).
 *
 * Dentro de ese documento, el bloque <script type="text/x-dc"> … </script>
 * es BYTE-IDÉNTICO al de dc.html salvo por una normalización de atributo
 * booleano en la etiqueta de apertura:  data-dc-script → data-dc-script=""
 *
 * El markup <x-dc> sí está COMPILADO. Las transformaciones son regulares y
 * este script las reproduce (modo --markup, con auto-demostración contra HEAD):
 *   1. atributo camelCase        → sc-camel-<kebab>   (onClick, viewBox, …)
 *   2. cierre auto ` />`         → `>`
 *   3. etiquetas que el parser HTML "expulsaría" (foster parenting) →
 *      sc-raw-<tag>. El conjunto se DEDUCE del bundle vigente; hoy es
 *      select table thead tbody tr th td.  <option> NO se reescribe.
 * El <helmet> NO se toca: en el bundle las fuentes están inlineadas como
 * assets uuid y el <template id="__bundler_thumbnail"> fue removido.
 *
 * USO
 * ---
 *   node tools/sync-bundle.mjs             # sincroniza solo el dc-script (JS)
 *   node tools/sync-bundle.mjs --markup    # sincroniza también el markup <x-dc>
 *   node tools/sync-bundle.mjs --check     # no escribe; sale 1 si hay desfase
 *   node tools/sync-bundle.mjs --out RUTA  # escribe en otra ruta (pruebas)
 *   node tools/sync-bundle.mjs --root DIR  # raíz del repo
 *
 * Después SIEMPRE:  node tests/test_component.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const arg = (n) => process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null;

const RAIZ = arg('--root') || path.resolve(new URL('.', import.meta.url).pathname, '..');
const NOMBRE_DC = 'Dashboard FNDR L3.dc.html';
const DC = path.join(RAIZ, NOMBRE_DC);
const IDX = path.join(RAIZ, 'index.html');
const SOLO_CHEQUEO = process.argv.includes('--check');
const CON_MARKUP = process.argv.includes('--markup');
const SALIDA = arg('--out') || IDX;

const morir = (m) => { console.error('sync-bundle: ' + m); process.exit(2); };

// ============================================================ 1. leer
const dc = fs.readFileSync(DC, 'utf8');
const idx = fs.readFileSync(IDX, 'utf8');

// ============================================ 2. aislar el JSON del bundle
const ABRE = '<script type="__bundler/template">\n';
const CIERRA = '\n  </script>';
if (idx.split(ABRE).length !== 2) morir('se esperaba exactamente un <script type="__bundler/template">');
const ini = idx.indexOf(ABRE) + ABRE.length;
const fin = idx.indexOf(CIERRA, ini);
if (fin < 0) morir('no se encontró el cierre del bloque __bundler/template');

let doc;
try { doc = JSON.parse(idx.slice(ini, fin)); }
catch (e) { morir('el bloque __bundler/template no es un string JSON válido: ' + e.message); }
if (typeof doc !== 'string') morir('el bloque __bundler/template no decodifica a un string');

// ============================ 3. localizar regiones (markup + dc-script)
const FIN_HELMET = '</helmet>';
const APERTURA = '<script type="text/x-dc"';

function ubicar(txt, etiqueta) {
  const n = txt.split(APERTURA).length - 1;
  if (n !== 1) morir(`${etiqueta}: se esperaba exactamente un ${APERTURA}, hay ${n}`);
  const helmet = txt.indexOf(FIN_HELMET);
  if (helmet < 0) morir(`${etiqueta}: no se encontró ${FIN_HELMET}`);
  const a = txt.indexOf(APERTURA);
  const finTag = txt.indexOf('>', a);
  const cierre = txt.indexOf('</script>', finTag);
  if (finTag < 0 || cierre < 0) morir(`${etiqueta}: bloque text/x-dc mal formado`);
  return {
    markupIni: helmet,               // incluye el propio </helmet>
    markup: txt.slice(helmet, a),
    tag: txt.slice(a, finTag + 1),
    cuerpo: txt.slice(finTag + 1, cierre),
    scriptIni: a,
    cierre,
  };
}
const enDoc = ubicar(doc, 'index.html');
const enDc = ubicar(dc, NOMBRE_DC);

// ---- normalizaciones que aplica el bundler --------------------------------
// El conjunto de etiquetas reescritas a sc-raw-* se DEDUCE del propio bundle
// (el compilador solo reescribe las que el parser HTML expulsaría — hoy:
//  select table thead tr th tbody td; <option> NO se reescribe).
const RAW = [...new Set([...enDoc.markup.matchAll(/<\/?sc-raw-([a-z0-9-]+)/g)].map(m => m[1]))];
const reRaw = RAW.length
  ? new RegExp('<(/?)(' + RAW.sort((a, b) => b.length - a.length).join('|') + ')\\b', 'g')
  : null;
const compilarMarkup = (s) => {
  let r = s
    .replace(/\s([a-z]+[A-Z][A-Za-z]*)=/g,
      (m, p) => ' sc-camel-' + p.replace(/([A-Z])/g, c => '-' + c.toLowerCase()) + '=')
    .replace(/\s*\/>/g, '>');
  return reRaw ? r.replace(reRaw, (m, c, t) => '<' + c + 'sc-raw-' + t) : r;
};
const compilarTag = (s) => s.replace(/\bdata-dc-script(?=[\s>])/, 'data-dc-script=""');
// Etiquetas de riesgo: si dc.html estrena una que el bundle no conoce, avisar.
const RIESGO = ['table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'colgroup', 'col', 'select'].filter(t => !RAW.includes(t));

// ============================================ 4. versión HEAD (auto-prueba)
function enHead(rel) {
  try {
    return execFileSync('git', ['show', 'HEAD:' + rel],
      /* maxBuffer explícito: index.html pesa ~1,04 MiB y el tope por defecto de
         execFileSync es 1 MiB — sin esto, leer el bundle de HEAD moría con
         ENOBUFS y --markup abortaba culpando a git. */
      { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  } catch { return null; }
}
const dcEnHead = () => enHead(NOMBRE_DC);
// Documento del diseño tal como quedó embebido en el index.html de HEAD.
function docEnHead() {
  const t = enHead('index.html');
  if (!t) return null;
  const a = t.indexOf(ABRE); if (a < 0) return null;
  const b = t.indexOf(CIERRA, a + ABRE.length); if (b < 0) return null;
  try { return JSON.parse(t.slice(a + ABRE.length, b)); } catch { return null; }
}

// ================================================= 5. construir el doc nuevo
let markupNuevo = enDoc.markup;          // por defecto: el del bundle, intacto

if (CON_MARKUP) {
  const head = dcEnHead(), docHead = docEnHead();
  if (!head || !docHead) morir('--markup requiere git y un HEAD legible (dc.html + index.html) para autodemostrar la compilación');
  const hDc = ubicar(head, `${NOMBRE_DC}@HEAD`);
  const hDoc = ubicar(docHead, 'index.html@HEAD');
  // PRUEBA: compilar el markup de dc.html@HEAD debe reproducir EXACTAMENTE
  // el markup embebido en index.html@HEAD. Si no, la regla es incompleta.
  if (compilarMarkup(hDc.markup) !== hDoc.markup) {
    morir('--markup abortado: compilarMarkup(dc.html@HEAD) ≠ markup de index.html@HEAD.\n' +
      '  El par en HEAD no es consistente, o el compilador aplicó una regla no cubierta.\n' +
      '  Re-exporta index.html desde la herramienta de diseño.');
  }
  markupNuevo = compilarMarkup(enDc.markup);
  const nuevas = RIESGO.filter(t => new RegExp('<' + t + '\\b').test(enDc.markup));
  if (nuevas.length) {
    console.warn('sync-bundle: AVISO — dc.html estrena etiquetas <' + nuevas.join('>, <') + '>\n' +
      '  que el bundle actual nunca compiló a sc-raw-*. Si contienen <sc-for>/<sc-if>,\n' +
      '  el parser HTML las expulsará: re-exporta index.html desde la herramienta.');
  }
  console.log('sync-bundle: markup <x-dc> recompilado (auto-prueba contra HEAD: OK).');
} else {
  // aviso de deriva: ¿cambió dc.html por encima del <script type="text/x-dc">?
  const head = dcEnHead();
  if (head) {
    const hDc = ubicar(head, `${NOMBRE_DC}@HEAD`);
    if (hDc.markup !== enDc.markup) {
      console.warn('sync-bundle: AVISO — el markup <x-dc> de dc.html cambió respecto de HEAD,\n' +
        '  pero este modo solo sincroniza el dc-script. Usa --markup (o re-exporta el bundle).');
    }
  }
}

const docNuevo = doc.slice(0, enDoc.markupIni)
  + markupNuevo
  + compilarTag(enDc.tag)
  + enDc.cuerpo
  + doc.slice(enDoc.cierre);

// ==================================================== 6. re-escapar e insertar
const jsonNuevo = JSON.stringify(docNuevo).replace(/<\//g, '<\\u002F');
if (JSON.parse(jsonNuevo) !== docNuevo) morir('fallo de round-trip en el escape');
if (jsonNuevo.includes('</script>')) morir('el JSON escapado contiene </script> crudo — rompería el bundle');

const idxNuevo = idx.slice(0, ini) + jsonNuevo + idx.slice(fin);

// ============================ 7. verificar la paridad tal como la mide el test
// (misma comparación que tests/test_component.mjs, líneas 73-77)
const NUL = '\u0000';
const desescapar = t => t.replace(/\\\\/g, NUL).replace(/\\"/g, '"')
  .replace(/\\n/g, '\n').replace(new RegExp(NUL, 'g'), '\\');
const corte = t => {
  const i = t.indexOf('class Component extends DCLogic');
  if (i < 0) return null;
  return t.slice(i, t.indexOf('onCloseBackdrop', i));
};
if (corte(desescapar(idxNuevo)) !== corte(dc)) {
  const region = corte(dc) || '';
  const s = [];
  if (/<\//.test(region))
    s.push("contiene '</' → el bundler lo escribe como <\\u002F y desescapar() del test no lo revierte");
  if (/[\t\r\f\v\u2028\u2029]/.test(region))
    s.push('contiene TAB/CR/FF/VT/LS/PS literales → JSON.stringify los escapa y desescapar() no los revierte');
  morir('la paridad NO se cumple tras la sincronización.'
    + (s.length ? '\n  Sospechas en el dc-script: ' + s.join('; ') : ''));
}

// ================================================================ 8. escribir
if (idxNuevo === idx) {
  console.log('sync-bundle: index.html ya estaba sincronizado (sin cambios).');
  process.exit(0);
}
if (SOLO_CHEQUEO) {
  console.error('sync-bundle: DESFASE — index.html no refleja el dc.html actual.');
  process.exit(1);
}
fs.writeFileSync(SALIDA, idxNuevo);
console.log(`sync-bundle: ${path.basename(SALIDA)} actualizado (${idx.length} → ${idxNuevo.length} chars).`);

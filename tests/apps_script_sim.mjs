/**
 * SIMULADOR DE APPS SCRIPT PARA apps-script/Code.gs
 *
 * Por qué existe: no hay red hacia script.google.com y la capa de datos no
 * tenía NINGUNA prueba. Todo lo que Code.gs decide —qué columna es la marca,
 * qué pasa cuando dos filas colapsan en el mismo folio, cuándo un valor sale
 * del dominio— sólo se podía verificar leyendo el archivo. Acá se ejecuta el
 * archivo REAL (no una copia ni una reimplementación) contra una planilla de
 * mentira, que es lo único que estaba faltando para poder afirmar algo.
 *
 * Se cargan FoliosL3.gs y Code.gs tal cual están en el repositorio, dentro de un
 * contexto de node:vm con los tres objetos de plataforma que usan:
 * SpreadsheetApp, ContentService y Date (fijada, para que la salida sea
 * reproducible byte a byte y pueda compararse contra el fixture).
 *
 * Una hoja se declara como { nombre, filas } donde filas[0] son los encabezados
 * — igual que getDataRange().getDisplayValues(), que devuelve SIEMPRE strings.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const AQUI = new URL('.', import.meta.url).pathname;
const RAIZ = path.join(AQUI, '..');

/** Instante fijo de referencia para las pruebas y para generar el fixture. */
export const AHORA_SIM = Date.parse('2026-07-29T14:20:00.000Z');

function hojaSim(nombre, filas) {
  const valores = (filas || []).map(f => (f || []).map(v => (v == null ? '' : String(v))));
  return {
    getName: () => nombre,
    getDataRange: () => ({ getDisplayValues: () => valores.map(f => f.slice()) })
  };
}

function planillaSim(hojas) {
  const sheets = (hojas || []).map(h => hojaSim(h.nombre, h.filas));
  return {
    // getSheetByName es igualdad EXACTA, igual que en Sheets: es justamente la
    // rigidez que resolverHoja_() tiene que compensar, así que no se ablanda acá.
    getSheetByName: n => sheets.filter(s => s.getName() === n)[0] || null,
    getSheets: () => sheets.slice()
  };
}

/**
 * Carga FoliosL3.gs + Code.gs en un contexto aislado y devuelve el contexto,
 * con todas las funciones internas (las de sufijo _) accesibles por nombre.
 */
export function cargarAppsScript(hojas, opciones) {
  const o = opciones || {};
  const ahora = o.ahora === undefined ? AHORA_SIM : o.ahora;

  class FechaFija extends Date {
    constructor(...args) {
      if (args.length === 0) super(ahora); else super(...args);
    }
    static now() { return ahora; }
  }

  const salidas = [];
  const contexto = {
    console,
    SpreadsheetApp: { openById: () => planillaSim(hojas) },
    ContentService: {
      MimeType: { JSON: 'application/json', JAVASCRIPT: 'text/javascript' },
      createTextOutput(texto) {
        const salida = { texto, mime: '', setMimeType(m) { this.mime = m; return this; } };
        salidas.push(salida);
        return salida;
      }
    },
    Date: FechaFija,
    __salidas: salidas
  };
  vm.createContext(contexto);

  ['apps-script/FoliosL3.gs', 'apps-script/Code.gs'].forEach(rel => {
    const src = fs.readFileSync(path.join(RAIZ, rel), 'utf8');
    vm.runInContext(src, contexto, { filename: rel });
  });

  return contexto;
}

/** Ejecuta la construcción completa del payload y lo devuelve como dato plano. */
export function correrDashboard(hojas, opciones) {
  const contexto = cargarAppsScript(hojas, opciones);
  const payload = vm.runInContext('construirDashboardL3_()', contexto);
  return { payload: JSON.parse(JSON.stringify(payload)), contexto };
}

/** Atajo: una sola hoja de Priorización sobre una cartera mínima de Iniciativas. */
export function hojasDePrueba(iniciativas, priorizacion, extra) {
  const hojas = [
    { nombre: 'Iniciativas', filas: iniciativas },
    { nombre: 'Factibilidad', filas: [['Numero_Ingreso', 'Estado']] },
    { nombre: 'Admisibilidad y Consistencia', filas: [['N° postulación', 'Dictamen']] },
    { nombre: 'Priorización', filas: priorizacion }
  ];
  (extra || []).forEach(h => {
    const i = hojas.findIndex(x => x.nombre === h.nombre);
    if (i >= 0) hojas[i] = h; else hojas.push(h);
  });
  return hojas;
}

export function leerHojas(rutaJson) {
  const abs = path.isAbsolute(rutaJson) ? rutaJson : path.join(RAIZ, rutaJson);
  return JSON.parse(fs.readFileSync(abs, 'utf8')).hojas;
}

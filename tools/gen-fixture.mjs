#!/usr/bin/env node
/**
 * tools/gen-fixture.mjs
 *
 * Genera tests/fixtures/api.sim.json ejecutando el apps-script/Code.gs REAL
 * sobre tests/fixtures/sheets.sim.json.
 *
 * El fixture dejó de escribirse a mano por una razón concreta: la versión
 * anterior contenía filas que Code.gs no puede producir (una etapa «Con
 * resolución» sin marca de resolución, marcas sin su campo `…Estado`), de modo
 * que las aserciones sobre el contrato de datos pasaban por el camino de
 * respaldo y no por el contrato. Generándolo, el fixture es por construcción una
 * salida posible de la capa de datos.
 *
 *   node tools/gen-fixture.mjs            escribe el fixture
 *   node tools/gen-fixture.mjs --check    no escribe; sale 1 si está desfasado
 *
 * Después SIEMPRE:  node tests/test_component.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { correrDashboard, leerHojas } from '../tests/apps_script_sim.mjs';

const RAIZ = path.resolve(new URL('.', import.meta.url).pathname, '..');
const DESTINO = path.join(RAIZ, 'tests', 'fixtures', 'api.sim.json');
const SOLO_CHEQUEO = process.argv.includes('--check');

const { payload } = correrDashboard(leerHojas('tests/fixtures/sheets.sim.json'));
const texto = JSON.stringify(payload, null, 2) + '\n';

const previo = fs.existsSync(DESTINO) ? fs.readFileSync(DESTINO, 'utf8') : null;
if (previo === texto) {
  console.log('gen-fixture: api.sim.json ya estaba al día (' + payload.data.length + ' proyectos).');
  process.exit(0);
}
if (SOLO_CHEQUEO) {
  console.error('gen-fixture: DESFASE — api.sim.json no es la salida del Code.gs actual.');
  process.exit(1);
}
fs.writeFileSync(DESTINO, texto);
console.log('gen-fixture: api.sim.json regenerado — ' + payload.data.length + ' proyectos, ' +
  payload.avisos.length + ' avisos.');

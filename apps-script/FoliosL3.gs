/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FOLIOS L3 — NORMALIZACIÓN Y EQUIVALENCIAS DE N° DE POSTULACIÓN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Módulo compartido. Es la ÚNICA fuente de verdad sobre cómo se compara un
 * número de postulación entre planillas.
 *
 * POR QUÉ EXISTE
 * --------------
 * El mismo proyecto no siempre se llama igual en cada planilla:
 *
 *   Iniciativas (Numero_Ingreso) ......... 1C
 *   Pauta de Factibilidad (N° postulación) 15
 *   Pauta de A&C (Folio) ................. 1C
 *
 * Cada flujo resolvía esto por su cuenta —o no lo resolvía—, y las fórmulas de
 * la hoja «Factibilidad» hacían VALUE(celda), que con «1C» devuelve #VALUE! y
 * arrastra el proyecto a «En revisión».
 *
 * Acá la equivalencia es BIDIRECCIONAL: 1C y 15 son el mismo proyecto, y el
 * resolvedor entrega la representación que exista en el destino, sea cual sea.
 * Así no hay que decidir «cuál de las dos es la buena»: funciona en los dos
 * sentidos y sigue funcionando si mañana alguien uniforma las planillas.
 *
 * INSTALACIÓN
 * -----------
 * Pegar este archivo en TODOS los proyectos Apps Script que crucen folios:
 *   • Proyectos Postulados L3   (SyncAdmisPostulados, Sincronizacion Factibilidad)
 *   • Factibilidad              (EvalGOREL3_Seguimiento)
 * Los nombres llevan prefijo L3_ para que no choquen con nada existente.
 *
 * USO DESDE FÓRMULAS (reemplaza a VALUE)
 * --------------------------------------
 *   =L3_FOLIO(A2)                      → folio canónico, nunca da error
 *   =L3_MISMOFOLIO(A2; 'Iniciativas'!A5)
 *   =L3_BUSCARFOLIO(A2; Iniciativas!A:F; 6)   ← en vez de BUSCARV(VALUE(A2);…)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Grupos de equivalencia. Cada arreglo son representaciones del MISMO proyecto.
 * El primer elemento es el canónico (el que se usa al reportar).
 *
 * 1C ≡ 15 — Judo Fukuoka Hijuelas, «Judocas de Hijuelas Rumbo al Sudamericano
 * Lima 2026». Misma organización, verificada por RUT y comuna; el nombre del
 * proyecto difiere porque la organización reformuló. Confirmado por Matías el
 * 2026-07-20 y reconfirmado el 2026-07-27 para el flujo de Factibilidad.
 *
 * Para agregar una equivalencia nueva basta con sumar un arreglo acá. No hay
 * que tocar ningún otro archivo.
 */
var L3_EQUIVALENCIAS_FOLIO = [
  ['1C', '15']
];


// ────────────────────────────────────────────────────────────────────────────
//  NORMALIZACIÓN
// ────────────────────────────────────────────────────────────────────────────
/**
 * Lleva cualquier representación de un folio a su forma comparable.
 *
 * Absorbe la basura habitual de Sheets: números que llegan como 16.0, celdas
 * con «N° 16», espacios duros, guiones tipográficos y mayúsculas mezcladas.
 * Los ceros a la izquierda se sacan SOLO si el folio es puramente numérico
 * («007» → «7»), nunca en códigos como «1C».
 *
 * Nunca lanza y nunca devuelve null: si no hay nada que normalizar, ''.
 */
function L3_normalizarFolio_(valor) {
  if (valor === null || valor === undefined) return '';

  // Una fecha acá siempre es una conversión indeseada de Sheets. No se intenta
  // adivinar: se descarta para que el diagnóstico la reporte como no cruzable.
  if (valor instanceof Date) return '';

  var s = String(valor)
    .replace(/\u00a0/g, ' ')            // espacio duro
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, '-')          // guiones tipográficos
    .trim()
    .toUpperCase();

  if (!s) return '';

  // Prefijos de rótulo, solo si lo que sigue es un dígito: «N° 16» → «16»,
  // pero «N3» (si alguna vez existiera un folio así) se deja intacto.
  s = s.replace(/^(?:N[°º]|NRO|NÚM|NUM|#)\.?\s*(?=\d)/, '');
  s = s.replace(/\s+/g, '');
  s = s.replace(/^([0-9]+)[.,]0+$/, '$1');            // 16.0 / 16,0 → 16

  if (/^[0-9]+$/.test(s)) {
    var sinCeros = s.replace(/^0+/, '');
    s = sinCeros === '' ? '0' : sinCeros;
  }

  return s;
}

/** Índice miembro→grupo, construido una sola vez por ejecución. */
var L3_INDICE_EQUIV_ = null;

function L3_indiceEquivalencias_() {
  if (L3_INDICE_EQUIV_) return L3_INDICE_EQUIV_;
  var idx = {};
  L3_EQUIVALENCIAS_FOLIO.forEach(function (grupo) {
    var norm = grupo.map(L3_normalizarFolio_).filter(function (v) { return v !== ''; });
    norm.forEach(function (miembro) { idx[miembro] = norm; });
  });
  L3_INDICE_EQUIV_ = idx;
  return idx;
}

/**
 * Todas las representaciones conocidas de un folio, la propia incluida y
 * siempre primera. Para un folio sin equivalencias devuelve [folio].
 */
function L3_equivalentesFolio_(valor) {
  var f = L3_normalizarFolio_(valor);
  if (!f) return [];
  var grupo = L3_indiceEquivalencias_()[f];
  if (!grupo) return [f];
  return [f].concat(grupo.filter(function (v) { return v !== f; }));
}

/** Representación canónica del grupo (el primer elemento declarado). */
function L3_folioCanonico_(valor) {
  var f = L3_normalizarFolio_(valor);
  if (!f) return '';
  var grupo = L3_indiceEquivalencias_()[f];
  return grupo && grupo.length ? grupo[0] : f;
}

/** ¿Este folio participa de alguna equivalencia declarada? */
function L3_tieneEquivalencia_(valor) {
  var f = L3_normalizarFolio_(valor);
  return !!(f && L3_indiceEquivalencias_()[f]);
}

/**
 * Resuelve el folio contra un índice de destino.
 *
 * `indice` puede ser cualquier objeto con las claves ya normalizadas (por
 * ejemplo el resultado de L3_indexarFolios_) o null si no hay destino contra
 * el cual verificar.
 *
 * Devuelve { folio, origen, equivalente } donde origen es:
 *   'directo'     — el folio existe tal cual en el destino
 *   'equivalencia'— se usó una equivalencia declarada
 *   'sin-cruce'   — no existe en el destino; se devuelve el canónico
 *   'sin-indice'  — no se verificó contra nada; se devuelve el canónico
 */
function L3_resolverFolio_(valor, indice) {
  var f = L3_normalizarFolio_(valor);
  if (!f) return { folio: '', origen: 'vacio', equivalente: false };

  if (!indice) {
    return { folio: L3_folioCanonico_(f), origen: 'sin-indice', equivalente: false };
  }

  if (indice[f] !== undefined) {
    return { folio: f, origen: 'directo', equivalente: false };
  }

  var alternativas = L3_equivalentesFolio_(f);
  for (var i = 0; i < alternativas.length; i++) {
    if (indice[alternativas[i]] !== undefined) {
      return { folio: alternativas[i], origen: 'equivalencia', equivalente: true };
    }
  }

  return { folio: L3_folioCanonico_(f), origen: 'sin-cruce', equivalente: L3_tieneEquivalencia_(f) };
}

/** Atajo cuando solo interesa el folio resuelto. */
function L3_folioEnDestino_(valor, indice) {
  return L3_resolverFolio_(valor, indice).folio;
}

/**
 * Construye un índice normalizado a partir de una lista de valores crudos.
 * El valor guardado es el crudo original, útil para reportar diferencias.
 */
function L3_indexarFolios_(valores) {
  var out = {};
  (valores || []).forEach(function (v) {
    var k = L3_normalizarFolio_(v);
    if (k && out[k] === undefined) out[k] = v;
  });
  return out;
}

/** Lee una columna de una hoja y devuelve su índice de folios normalizado. */
function L3_indexarColumna_(sheet, nombreColumna) {
  if (!sheet || sheet.getLastRow() < 2) return {};
  var ancho = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, ancho).getDisplayValues()[0];
  var objetivo = L3_claveEncabezado_(nombreColumna);
  var col = -1;
  headers.forEach(function (h, i) {
    if (col < 0 && L3_claveEncabezado_(h) === objetivo) col = i;
  });
  if (col < 0) return {};
  var datos = sheet.getRange(2, col + 1, sheet.getLastRow() - 1, 1).getValues();
  return L3_indexarFolios_(datos.map(function (r) { return r[0]; }));
}

/**
 * Clave comparable de un encabezado: sin tildes, sin dobles espacios, en
 * mayúsculas. Sirve para tolerar «Dictamen» / «DICTAMEN» / «Dictámen ».
 */
function L3_claveEncabezado_(v) {
  return String(v === null || v === undefined ? '' : v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}


// ────────────────────────────────────────────────────────────────────────────
//  TIMESTAMPS
// ────────────────────────────────────────────────────────────────────────────
/**
 * Milisegundos de un timestamp venga como venga.
 *
 * Existe porque comparar timestamps como TEXTO es la causa raíz del folio 16:
 * la librería escribe «2026-07-22 12:52:00», pero Sheets convierte esa celda a
 * Date en unas filas y la deja como texto en otras. getValues() devuelve
 * entonces una mezcla, y String(Date) da «Wed Jul 22 2026…», que ordenado
 * alfabéticamente pone «Wed Jun 03…» por delante. Comparar en ms elimina el
 * problema de raíz.
 *
 * Devuelve 0 si no se puede interpretar — así un registro sin fecha nunca le
 * gana a uno fechado.
 */
function L3_timestampMs_(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;
  if (valor instanceof Date) {
    var t = valor.getTime();
    return isNaN(t) ? 0 : t;
  }
  if (typeof valor === 'number') {
    // Serial de Sheets: días desde 1899-12-30.
    if (valor > 0 && valor < 100000) return Math.round((valor - 25569) * 86400000);
    return valor;
  }

  var s = String(valor).replace(/\u00a0/g, ' ').trim();
  if (!s) return 0;

  // yyyy-MM-dd [HH:mm[:ss]]  — formato que escribe ahoraISO_()
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime();
  }

  // dd/MM/yyyy o dd-MM-yyyy [HH:mm[:ss]] — locale es-CL
  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime();
  }

  var d = new Date(s);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}


// ────────────────────────────────────────────────────────────────────────────
//  FUNCIONES PARA USAR DENTRO DE LA PLANILLA
// ────────────────────────────────────────────────────────────────────────────
/**
 * Folio canónico de una celda. Reemplazo directo de VALUE() en cualquier
 * fórmula de cruce: acepta «1C», «16.0», «N° 7» y nunca devuelve #VALUE!.
 *
 * @param {string|number} valor Celda o rango con el número de postulación.
 * @return {string} Folio normalizado.
 * @customfunction
 */
function L3_FOLIO(valor) {
  if (Array.isArray(valor)) {
    return valor.map(function (fila) {
      return fila.map(function (v) { return L3_folioCanonico_(v); });
    });
  }
  return L3_folioCanonico_(valor);
}

/**
 * ¿Dos celdas apuntan al mismo proyecto, considerando las equivalencias?
 *
 * @param {string|number} a Primer folio.
 * @param {string|number} b Segundo folio.
 * @return {boolean} VERDADERO si son el mismo proyecto.
 * @customfunction
 */
function L3_MISMOFOLIO(a, b) {
  var fa = L3_normalizarFolio_(a);
  var fb = L3_normalizarFolio_(b);
  if (!fa || !fb) return false;
  if (fa === fb) return true;
  return L3_equivalentesFolio_(fa).indexOf(fb) !== -1;
}

/**
 * BUSCARV tolerante a folios. Busca `valor` en la primera columna de `rango`
 * probando también sus equivalencias, y devuelve la columna `indiceCol`.
 *
 * @param {string|number} valor Folio a buscar.
 * @param {Array<Array>} rango Rango de búsqueda; el folio va en su 1ª columna.
 * @param {number} indiceCol Columna a devolver, 1 = la primera del rango.
 * @param {string} siNoExiste Valor a devolver si no hay coincidencia.
 * @return {*} El valor encontrado.
 * @customfunction
 */
function L3_BUSCARFOLIO(valor, rango, indiceCol, siNoExiste) {
  var alternativas = L3_equivalentesFolio_(valor);
  if (!alternativas.length) return siNoExiste === undefined ? '' : siNoExiste;
  var col = (indiceCol || 1) - 1;
  var filas = Array.isArray(rango) ? rango : [[rango]];

  for (var a = 0; a < alternativas.length; a++) {
    for (var i = 0; i < filas.length; i++) {
      if (L3_normalizarFolio_(filas[i][0]) === alternativas[a]) {
        return col < filas[i].length ? filas[i][col] : '';
      }
    }
  }
  return siNoExiste === undefined ? '' : siNoExiste;
}

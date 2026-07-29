/**
 * ═══════════════════════════════════════════════════════════════════════════
 * API DEL DASHBOARD CONSOLIDADO FNDR L3
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Lee las cuatro hojas de Proyectos Postulados L3 y las cruza en un registro
 * por proyecto para el dashboard de GitHub Pages.
 *
 * DEPENDENCIA
 * -----------
 * Requiere FoliosL3.gs en el mismo proyecto Apps Script. Es el mismo archivo
 * que usan SyncAdmisPostulados y Sincronizacion_Factibilidad_Directa en el
 * repositorio Linea3; se copia, no se reescribe.
 *
 * CORRECCIONES 2026-07-27
 * -----------------------
 * 1. El cruce se hacía con trim().toUpperCase(). Un proyecto que Iniciativas
 *    llama «1C» y Factibilidad llama «15» aparecía DOS VECES, cada fila con
 *    la mitad de los datos. Ahora se cruza con la equivalencia canónica.
 * 2. dictamenAC se leía de la columna «Estado», que no existe en la hoja
 *    «Admisibilidad y Consistencia» — el encabezado es «Dictamen». La columna
 *    salía siempre vacía, y con ella el KPI de A&C favorable y la etapa.
 * 3. Una hoja faltante hacía fallar todo el dashboard. Ahora degrada: se
 *    reporta la hoja ausente y el resto de los datos se sirve igual.
 * 4. Se agregan las alertas de proceso que antes había que salir a buscar a
 *    mano en las planillas.
 *
 * CORRECCIONES 2026-07-29
 * -----------------------
 * 5. La pestaña se resolvía con getSheetByName() EXACTO. «Priorizacion» sin
 *    tilde, o «Priorización » con un espacio al final, devolvían cero filas y
 *    el tablero mostraba CORE 0 sin decir por qué: el nombre de una pestaña lo
 *    escribe una persona, no puede ser una condición de igualdad binaria. Ahora
 *    se compara normalizado y la diferencia queda escrita en `avisos`.
 * 6. La marca de acuerdo CORE se leía SOLO con el encabezado «Acuerdo CORE».
 *    La columna real está rotulada «de acuerdo CORE», que normaliza distinto y
 *    por lo tanto nunca cruzaba. Ahora hay lista de alias, y si ninguno existe
 *    se dice en `avisos` en vez de devolver un cero indistinguible de «no hay
 *    ningún acuerdo».
 * 7. La marca de resolución (columna S) no se leía NUNCA: «con resolución» se
 *    infería de que hubiera número o enlace. Eso confunde la EVIDENCIA con la
 *    DECLARACIÓN — un enlace pegado a mano ascendía el proyecto de etapa. Ahora
 *    manda la marca; el enlace acompaña pero no cuenta.
 * 8. «En tramitación» se perdía: normalizarSiNo_ devolvía '' para todo lo que
 *    no fuera sí/no, así que un trámite en curso se veía igual que un vacío y
 *    que un «No». Ahora la marca es tri-estado y lo que no cae en el dominio se
 *    publica como 'desconocido' con su texto original: un dato raro tiene que
 *    verse, nunca desaparecer en silencio.
 * 9. Trampa de substring: /favorable|habilitar|factible/ daba verdadero para
 *    «NO FACTIBLE» y para «no avanza, con pronunciamiento desfavorable». Los
 *    estados tienen literales canónicos: se comparan por igualdad exacta.
 * 10. Las alertas de salto de etapa estaban sueltas y cada una repetía su
 *    condición. Ahora son una tabla declarativa de coherencia entre hitos
 *    consecutivos, para que sumar una regla sea agregar una línea.
 * 11. sources decía «CORE 2» contando FILAS de la hoja. Se mantiene ese conteo
 *    (lo consume el pie del tablero) y se agregan los conteos de MARCAS, que
 *    son otra cosa: así se distingue «no hay filas» de «no hay marcas».
 * 12. Se agrega sources.diagnosticoAC (T6). El descuadre «10 filas en A&C, 4
 *    favorables en la tarjeta» no se corrige a ciegas: primero se instrumenta.
 *    NINGÚN criterio de conteo de A&C favorable se cambió acá a propósito.
 *
 * CORRECCIONES 2026-07-29 (segunda ronda — verificación adversarial)
 * -----------------------------------------------------------------
 * 13. La marca se leía del PRIMER alias que trajera valor. Si la planilla
 *    conserva una columna «Acuerdo CORE» con el NÚMERO del acuerdo además de la
 *    marca real en «de acuerdo CORE», ganaba la primera y la marca real no se
 *    leía nunca. Ahora gana el primer alias cuyo valor esté EN EL DOMINIO; el
 *    orden de la lista deja de ser una decisión silenciosa.
 * 14. El aviso de marca sólo se emitía cuando NINGÚN alias cruzaba. Una columna
 *    presente pero llena de valores fuera de dominio no producía ninguna señal:
 *    el operador veía «0 marcas» sin saber que había 3 valores rechazados.
 * 15. Dos filas de Priorización que colapsan en el mismo folio (1C ≡ 15) con
 *    marcas DISTINTAS: ganaba la última leída, en silencio. «En tramitación» se
 *    publicaba como «No» según el orden de la hoja. Ahora es un conflicto
 *    declarado; ninguna de las dos se publica como si fuera la verdad.
 * 16. hitosDelProyecto_ daba «en ejecución» por una fecha de inicio PLANIFICADA,
 *    así que todo expediente con fecha programada y sin resolución disparaba una
 *    alerta falsa. El hito ahora se decide igual que en la UI.
 * 17. Los dos estados evaluativos se clasificaban acá por igualdad estricta y en
 *    la UI con respaldo por texto libre: las dos capas afirmaban cosas opuestas
 *    sobre la misma fila. El criterio es UNO y está en esFactibilidadHabilitada_
 *    / esDictamenACFavorable_, con la MISMA semántica que el tablero.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const CFG_DASHBOARD_L3 = Object.freeze({
  SPREADSHEET_ID: '1Y2o6zTsVakCy3NZNkgeA1qaeTJcnIx94PdS9DbGj3QE',
  SHEETS: Object.freeze({
    INICIATIVAS: 'Iniciativas',
    FACTIBILIDAD: 'Factibilidad',
    AC: 'Admisibilidad y Consistencia',
    PRIORIZACION: 'Priorización'
  })
});

/**
 * Alias de encabezado de las dos MARCAS del proceso.
 *
 * Están acá arriba y no enterrados en el bucle porque son la lista que hay que
 * tocar cuando alguien rotula la columna distinto, y porque los `avisos` los
 * imprimen tal cual: si ninguno cruza, el operador ve exactamente qué se buscó.
 *
 * Ojo con normalizarClave_: quita todo lo que no sea alfanumérico, así que
 * 'Acuerdo CORE' → 'acuerdocore' y 'de acuerdo CORE' → 'deacuerdocore' NO son
 * la misma clave. Ese fue el defecto: la columna real se rotula con el «de».
 *
 * El ORDEN importa poco a propósito: leerMarca_ elige el primer alias cuyo valor
 * esté en el dominio, no el primero que traiga cualquier cosa. Aun así el rótulo
 * documentado por el brief (columna O, «de acuerdo CORE») va primero, porque es
 * el que se nombra en los avisos y en las inconsistencias.
 */
const ALIAS_MARCA_CORE_ = Object.freeze([
  'de acuerdo CORE', 'Acuerdo CORE', 'Priorizado CORE', 'Acuerdo Consejo Regional'
]);

/**
 * 'Resolución' y 'Resolucion' normalizan a la misma clave; van las dos igual
 * porque esta lista también se muestra al operador y así se lee sin ambigüedad.
 * Ninguna choca con 'N° Resolución Aprobatoria' ni con 'Enlace Resolución
 * Aprobatoria', que son el número y el enlace, no la marca.
 */
const ALIAS_MARCA_RESOLUCION_ = Object.freeze([
  'Resolución', 'Resolucion', 'con resolución', 'Resolución aprobatoria'
]);

/**
 * DOMINIO DE LAS MARCAS (tri-estado)
 *
 * Igualdad EXACTA contra estos literales, nunca coincidencia parcial: es lo que
 * evita que «No» encuentre «no» dentro de otra palabra. Todo valor no vacío que
 * no esté acá es 'desconocido' — se publica con su texto original y se anota
 * como inconsistencia. Un valor raro es información, no ruido a descartar.
 *
 * 'verdadero'/'falso' están incluidos porque un checkbox de Sheets en es-CL se
 * lee así con getDisplayValues(): sin ellos, marcar la casilla equivalía a
 * dejarla vacía.
 */
const MARCA_SI_ = Object.freeze(['si', 'true', 'verdadero', '1', 'x']);
const MARCA_NO_ = Object.freeze(['no', 'false', 'falso', '0']);
const MARCA_TRAMITACION_ = Object.freeze(['en tramitacion', 'en tramite']);

/**
 * LITERALES CANÓNICOS de los dos estados evaluativos.
 *
 * Existen para poder comparar por igualdad y no por regex. La segunda forma de
 * «habilitado» es la que circula en la Nómina del Gobernador, que dice lo mismo
 * con otras palabras; ambas conviven en las planillas.
 *
 * Las claves ya vienen normalizadas (sin tildes, minúsculas, espacios
 * colapsados) porque es contra normalizar_() que se consultan.
 */
const DOMINIO_DICTAMEN_AC_ = Object.freeze({
  'evaluacion tecnica favorable': 'favorable',
  'con observaciones': 'observaciones',
  'desestimado por no subsanacion': 'desestimado',
  'revision pendiente': 'pendiente'
});

const DOMINIO_ESTADO_FACTIBILIDAD_ = Object.freeze({
  'habilitar formulacion de expediente': 'habilitado',
  'factible tecnicamente, habilitado para formulacion de expediente': 'habilitado',
  'factible tecnicamente habilitado para formulacion de expediente': 'habilitado',
  'observar para subsanacion': 'observado',
  'desestimar': 'desestimado',
  'evaluacion pendiente': 'pendiente'
});

/**
 * SIGNO DE UN ESTADO EN TEXTO LIBRE
 *
 * Los literales canónicos se resuelven por igualdad y no llegan acá. Esto es el
 * último recurso, para las planillas heredadas que escriben el estado con sus
 * propias palabras — y es la MISMA función que corre en el tablero (signo() del
 * dc.html), porque tener dos criterios distintos para el mismo hito hacía que la
 * capa de datos y la pantalla afirmaran cosas opuestas sobre la misma fila.
 *
 * La negación se resuelve por REGLA, no por lista de frases. La versión anterior
 * enumeraba «no factible», «no avanza»… y cualquier negativo redactado con otra
 * palabra —«NO HABILITAR FORMULACIÓN», «Sin pronunciamiento favorable»,
 * «Factible: NO»— caía en la rama positiva. Tres reglas cubren la familia:
 *   1. términos que ya son negativos por sí mismos (desestimado, desfavorable…)
 *   2. un negador ANTES de un término positivo, hasta dos palabras de por medio
 *   3. un negador AL FINAL, después de un término positivo («Factible: NO»)
 * El sesgo es deliberado: ante la duda, un texto libre no acredita un hito.
 */
const NEGADORES_ = 'no|sin|nunca|jamas|tampoco';
const TERMINOS_POSITIVOS_ = 'favorable|habilitar|habilitad|factible|cumple|priorizad|aprobad|avanza|terminad';
const RE_NEGATIVO_EXPLICITO_ = /desestim|desfavorable|inadmis|rechaz|no factible|no es factible|no contin|no avanza|no subsan|no admisible|no elegible/;
/* El relleno entre el negador y el término son PALABRAS, no «cualquier cosa»:
   con \S+ la negación cruzaba la coma y «sin observaciones, habilitado» —que es
   un positivo— caía en negativo. Un signo de puntuación cierra la cláusula y con
   ella el alcance de la negación. */
const RE_NEGACION_ANTEPUESTA_ = new RegExp('\\b(?:' + NEGADORES_ + ')\\b(?:\\s+[a-z0-9]+){0,2}?\\s+(?:' + TERMINOS_POSITIVOS_ + ')');
/* [a-z]* completa la palabra del término («habilitad» → «habilitado») antes de
   buscar el negador final: sin eso «Habilitado NO» se escapaba a positivo. */
const RE_NEGACION_POSPUESTA_ = new RegExp('(?:' + TERMINOS_POSITIVOS_ + ')[a-z]*\\b[^a-z0-9]{0,4}(?:' + NEGADORES_ + ')\\s*$');
const RE_PENDIENTE_ = /observ|pendiente|revision|espera|subsan|incomplet|tramit/;
const RE_POSITIVO_ = new RegExp(TERMINOS_POSITIVOS_);

function signo_(valor) {
  const n = normalizar_(valor);
  if (!n) return 'vacio';
  if (RE_NEGATIVO_EXPLICITO_.test(n)) return 'negativo';
  if (RE_NEGACION_ANTEPUESTA_.test(n) || RE_NEGACION_POSPUESTA_.test(n)) return 'negativo';
  if (RE_PENDIENTE_.test(n)) return 'pendiente';
  if (RE_POSITIVO_.test(n)) return 'positivo';
  return 'otro';
}

/**
 * ¿Factibilidad habilita la formulación del expediente? (hito 2)
 * Literal canónico primero —igualdad exacta, nunca substring— y sólo si el texto
 * no pertenece al dominio se cae al signo. Es la definición de factFav() del
 * tablero, palabra por palabra.
 */
function esFactibilidadHabilitada_(valor) {
  const c = clasificarEstadoFactibilidad_(valor);
  if (c.clase === 'vacio') return false;
  if (c.clase !== 'desconocido') return c.clase === 'habilitado';
  return signo_(valor) === 'positivo';
}

/** ¿El dictamen de A&C es favorable? (hito 4). Manda el Dictamen, col. L. */
function esDictamenACFavorable_(valor) {
  const c = clasificarDictamenAC_(valor);
  if (c.clase === 'vacio') return false;
  if (c.clase !== 'desconocido') return c.clase === 'favorable';
  return signo_(valor) === 'positivo';
}

/**
 * COHERENCIA ENTRE HITOS CONSECUTIVOS
 *
 * Un proyecto no puede estar más adelante que su propia evaluación. Antes cada
 * caso era un `if` con su condición escrita a mano; acá es una tabla: la regla
 * dice qué hito posterior está cumplido y cuál anterior no, y el motor emite el
 * mensaje. Sumar una regla nueva es agregar una línea, no tocar el motor.
 *
 * Las claves de `previo` y `siguiente` son las de hitosDelProyecto_().
 *
 * Nota sobre el guard que se eliminó al migrar: la regla «CORE sin A&C
 * favorable» sólo se disparaba si HABÍA dictamen, con lo cual el peor caso
 * —priorizado sin ninguna evaluación A&C— salía limpio. En el marco declarativo
 * «hito previo no cumplido» incluye «hito previo inexistente», que es lo que
 * corresponde.
 */
const REGLAS_COHERENCIA_HITOS_ = Object.freeze([
  {
    id: 'ac-favorable-sin-factibilidad-habilitada',
    previo: 'factibilidadHabilitada',
    siguiente: 'acDictamenFavorable',
    mensaje: 'Dictamen A&C favorable, pero Factibilidad no dice «HABILITAR FORMULACIÓN DE EXPEDIENTE».'
  },
  {
    id: 'core-sin-ac-favorable',
    previo: 'acDictamenFavorable',
    siguiente: 'corePriorizado',
    mensaje: 'Priorizado por el CORE sin dictamen A&C favorable.'
  },
  {
    id: 'resolucion-sin-core',
    previo: 'corePriorizado',
    siguiente: 'conResolucion',
    mensaje: 'Tiene resolución aprobatoria pero no figura acuerdo CORE.'
  },
  {
    id: 'ejecucion-sin-resolucion',
    previo: 'conResolucion',
    siguiente: 'enEjecucion',
    mensaje: 'Aparece en ejecución sin resolución aprobatoria registrada.'
  }
]);

function doGet(e) {
  try {
    const payload = construirDashboardL3_();
    return responderDashboard_(payload, e && e.parameter && e.parameter.callback);
  } catch (error) {
    return responderDashboard_({
      ok: false,
      error: error && error.message ? error.message : String(error),
      updatedAt: new Date().toISOString(),
      data: []
    }, e && e.parameter && e.parameter.callback);
  }
}

function construirDashboardL3_() {
  if (typeof L3_normalizarFolio_ !== 'function') {
    throw new Error('Falta FoliosL3.gs en este proyecto Apps Script. ' +
      'Cópialo desde el repositorio Linea3 (apps-script/FoliosL3.gs) y vuelve a desplegar.');
  }

  const ss = SpreadsheetApp.openById(CFG_DASHBOARD_L3.SPREADSHEET_ID);
  const avisos = [];
  const iniciativas = leerTablaPorEncabezados_(ss, CFG_DASHBOARD_L3.SHEETS.INICIATIVAS, avisos);
  const factibilidad = leerTablaPorEncabezados_(ss, CFG_DASHBOARD_L3.SHEETS.FACTIBILIDAD, avisos);
  const ac = leerTablaPorEncabezados_(ss, CFG_DASHBOARD_L3.SHEETS.AC, avisos);
  const priorizacion = leerTablaPorEncabezados_(ss, CFG_DASHBOARD_L3.SHEETS.PRIORIZACION, avisos);

  revisarColumnaDeMarca_(priorizacion, CFG_DASHBOARD_L3.SHEETS.PRIORIZACION,
    ALIAS_MARCA_CORE_, 'acuerdo CORE', avisos);
  revisarColumnaDeMarca_(priorizacion, CFG_DASHBOARD_L3.SHEETS.PRIORIZACION,
    ALIAS_MARCA_RESOLUCION_, 'resolución aprobatoria', avisos);

  // La clave es el folio CANÓNICO (ver folio_). Es lo que impide que «1C» y
  // «15» terminen siendo dos tarjetas distintas del mismo proyecto.
  const proyectos = new Map();

  iniciativas.rows.forEach(row => {
    const folio = folio_(valor_(row, 'Numero_Ingreso', 'N° postulación'));
    if (!folio) return;
    // Dos filas de Iniciativas pueden colapsar en el mismo folio canónico
    // (1C y 15). Gana la primera; la segunda solo completa lo que falte.
    if (proyectos.has(folio)) {
      const y = proyectos.get(folio);
      y.comuna = primero_(y.comuna, valor_(row, 'Comuna'));
      y.fondo = primero_(y.fondo, valor_(row, 'Fondo'));
      y.monto = primero_(y.monto, valor_(row, 'Monto_Solicitado_CLP'));
      return;
    }
    proyectos.set(folio, {
      nPostulacion: folio,
      nombreProyecto: valor_(row, 'Nombre_Proyecto', 'Nombre proyecto'),
      institucion: valor_(row, 'Nombre_Organizacion', 'Institución - Nombre'),
      rutInstitucion: valor_(row, 'Rut_Organizacion', 'Institución - Rut'),
      comuna: valor_(row, 'Comuna'),
      fondo: valor_(row, 'Fondo'),
      categoria: valor_(row, 'Tipo_Categoria', 'Tipo categoría'),
      monto: valor_(row, 'Monto_Solicitado_CLP', 'Monto Solicitado GORE', 'Monto solicitado'),
      fechaInicioEjecucion: valor_(row, 'Fecha_Inicio'),
      fechaTerminoEjecucion: valor_(row, 'Fecha_Termino'),
      alertas: [],
      inconsistenciasDatos: []
    });
  });

  factibilidad.rows.forEach(row => {
    const folio = folio_(valor_(row, 'Numero_Ingreso', 'N° postulación'));
    if (!folio) return;
    const p = asegurarProyecto_(proyectos, folio, row);
    p.nombreProyecto = primero_(p.nombreProyecto, valor_(row, 'Nombre_Proyecto', 'Nombre proyecto'));
    p.institucion = primero_(p.institucion, valor_(row, 'Nombre_Organizacion', 'Institución - Nombre'));
    p.rutInstitucion = primero_(p.rutInstitucion, valor_(row, 'Rut_Organizacion', 'Institución - Rut'));
    p.comuna = primero_(p.comuna, valor_(row, 'Comuna'));
    p.fondo = primero_(p.fondo, valor_(row, 'Fondo'));
    p.categoria = primero_(p.categoria, valor_(row, 'Tipo_Categoria', 'Tipo categoría'));
    p.monto = primero_(p.monto, valor_(row, 'Monto_Solicitado_CLP', 'Monto solicitado'));
    p.evaluadorFactibilidad = valor_(row, 'Revisor', 'Revisora', 'Evaluador/a');
    p.estadoFactibilidad = valor_(row, 'Estado');
    p.resumenFactibilidad = valor_(row, 'Resumen De proyecto', 'Resumen de proyecto', 'Resumen');
    // Acá viene el motivo de una evaluación pendiente y los criterios sin
    // resolver. Antes no se leía, así que el dashboard mostraba «pendiente»
    // sin decir nunca por qué.
    p.observacionesFactibilidad = valor_(row, 'Observaciones de Evaluación');
    p.folioFactibilidad = valor_(row, 'Numero_Ingreso', 'N° postulación');
  });

  ac.rows.forEach(row => {
    const folio = folio_(valor_(row, 'N° postulación', 'Numero_Ingreso', 'Folio'));
    if (!folio) return;
    const p = asegurarProyecto_(proyectos, folio, row);
    p.nombreProyecto = primero_(valor_(row, 'Nombre proyecto', 'Nombre_Proyecto'), p.nombreProyecto);
    p.institucion = primero_(valor_(row, 'Institución - Nombre', 'Nombre_Organizacion'), p.institucion);
    p.rutInstitucion = primero_(valor_(row, 'Institución - Rut', 'Rut_Organizacion'), p.rutInstitucion);
    p.comuna = primero_(valor_(row, 'Comuna'), p.comuna);
    p.fondo = primero_(valor_(row, 'Fondo'), p.fondo);
    p.categoria = primero_(valor_(row, 'Tipo categoría', 'Tipo_Categoria'), p.categoria);
    p.monto = primero_(valor_(row, 'Monto Solicitado GORE', 'Monto_Solicitado_CLP'), p.monto);
    p.evaluadorAC = valor_(row, 'Evaluador/a');
    p.rondaAC = valor_(row, 'Ronda');

    // La hoja «Admisibilidad y Consistencia» rotula esta columna «Dictamen»
    // (así la escribe SyncAdmisPostulados). Se mantiene «Estado» como alias
    // porque algunas Pautas todavía usan ese encabezado heredado; leer solo
    // «Estado» dejaba el dictamen SIEMPRE vacío.
    p.dictamenAC = valor_(row, 'Dictamen', 'Estado');
    p.estadoAC = valor_(row, 'Estado proyecto');
    p.observacionesAC = valor_(row, 'Observaciones de Evaluación');

    p.observacionesAbiertasAC = valor_(row, '# Obs abiertas');
    p.observacionesCerradasAC = valor_(row, '# Obs cerradas');
    p.fechaEvaluacionAC = valor_(row, 'Fecha evaluación');
    p.resumenAC = valor_(row, 'Resumen de proyecto');
    p.comentarioAC = primero_(valor_(row, 'Comentario'), valor_(row, 'Observaciones de Evaluación'));
    p.pronunciamiento = primero_(p.pronunciamiento, valor_(row, 'Pronunciamiento'));
    p.enlacePautaAC = valor_(row, 'Link Pauta');
    p.pdfAC = valor_(row, 'Último PDF');
  });

  priorizacion.rows.forEach(row => {
    const folio = folio_(valor_(row, 'N° postulación', 'Numero_Ingreso', 'Folio'));
    if (!folio) return;
    const p = asegurarProyecto_(proyectos, folio, row);
    p.nombreProyecto = primero_(valor_(row, 'Nombre proyecto', 'Nombre_Proyecto'), p.nombreProyecto);
    p.institucion = primero_(valor_(row, 'Institución - Nombre', 'Nombre_Organizacion'), p.institucion);
    p.rutInstitucion = primero_(valor_(row, 'Institución - Rut', 'Rut_Organizacion'), p.rutInstitucion);
    p.comuna = primero_(valor_(row, 'Comuna'), p.comuna);
    p.fondo = primero_(valor_(row, 'Fondo'), p.fondo);
    p.categoria = primero_(valor_(row, 'Tipo de Categoría (excepcional / emergente / emblemático)', 'Tipo categoría'), p.categoria);
    p.monto = primero_(valor_(row, 'Monto solicitado'), p.monto);
    p.pronunciamiento = valor_(row, 'Pronunciamiento');
    p.comentario = valor_(row, 'Comentario');
    p.resumen = valor_(row, 'Resumen');

    // MARCA de acuerdo CORE (hoja Priorización). Es la DECLARACIÓN: es esto y
    // no el número ni el enlace lo que cuenta como priorizado.
    aplicarMarca_(p, 'acuerdoCore', leerMarca_(row, ALIAS_MARCA_CORE_));
    p.acuerdoCoreNumero = valor_(row, 'N° Acuerdo CORE');
    p.acuerdoCoreFecha = valor_(row, 'Fecha Acuerdo CORE');
    p.acuerdoCoreUrl = valor_(row, 'Enlace Acuerdo CORE');

    // MARCA de resolución aprobatoria (columna S). Antes no se leía nunca y
    // «con resolución» se deducía de que hubiera número o enlace: un enlace
    // pegado a mano bastaba para dar por emitido el acto administrativo.
    aplicarMarca_(p, 'resolucionMarca', leerMarca_(row, ALIAS_MARCA_RESOLUCION_));
    p.resolucionNumero = valor_(row, 'N° Resolución Aprobatoria');
    p.resolucionFecha = valor_(row, 'Fecha Resolución Aprobatoria');
    p.resolucionUrl = valor_(row, 'Enlace Resolución Aprobatoria');

    p.fechaInicioEjecucion = primero_(valor_(row, 'Fecha inicio ejecución'), p.fechaInicioEjecucion);
    p.fechaTerminoEjecucion = primero_(valor_(row, 'Fecha término ejecución'), p.fechaTerminoEjecucion);
    p.estadoEjecucion = valor_(row, 'Estado ejecución');
  });

  const data = Array.from(proyectos.values()).map(p => {
    // Un proyecto que no aparece en Priorización igual tiene que traer las
    // marcas del contrato: 'vacio' es un estado, no una ausencia de campo.
    asegurarMarcasDelContrato_(p);
    revisarDominiosEvaluativos_(p);
    p.alertas = calcularAlertas_(p);
    p.etapa = calcularEtapa_(p);
    return p;
  }).sort((a, b) => compararFolios_(a.nPostulacion, b.nPostulacion));

  return {
    ok: true,
    updatedAt: new Date().toISOString(),
    avisos: avisos,
    sources: {
      iniciativas: iniciativas.rows.length,
      factibilidad: factibilidad.rows.length,
      admisibilidadConsistencia: ac.rows.length,
      // Conteo de FILAS de la hoja Priorización. El nombre quedó heredado y lo
      // consume el pie del tablero; se mantiene, pero abajo van los conteos de
      // MARCAS, que son la pregunta que la gente realmente hace.
      priorizacionCore: priorizacion.rows.length,
      priorizacion: priorizacion.rows.length,
      proyectos: data.length,
      conAlertas: data.filter(p => p.alertas.length).length,

      // Conteos de marcas. Distinguen «la hoja no tiene filas» de «las filas no
      // tienen marca»: con la fuente en 0 no se sabía cuál de las dos era.
      coreMarcados: data.filter(p => p.acuerdoCoreEstado === 'si').length,
      coreEnTramitacion: data.filter(p => p.acuerdoCoreEstado === 'tramitacion').length,
      coreDesconocidos: data.filter(p => p.acuerdoCoreEstado === 'desconocido').length,
      resolucionMarcadas: data.filter(p => p.resolucionMarcaEstado === 'si').length,
      resolucionEnTramitacion: data.filter(p => p.resolucionMarcaEstado === 'tramitacion').length,
      resolucionDesconocidas: data.filter(p => p.resolucionMarcaEstado === 'desconocido').length,
      inconsistencias: data.reduce((n, p) => n + p.inconsistenciasDatos.length, 0),

      diagnosticoAC: diagnosticoAC_(ac, proyectos)
    },
    data: data
  };
}

/**
 * DIAGNÓSTICO DEL DESCUADRE A&C (T6)
 *
 * «La fuente dice 10 y la tarjeta dice 4» tiene al menos cuatro sumideros
 * posibles y ninguno deja rastro. Esto no corrige el conteo —el criterio de
 * «A&C favorable» queda EXACTAMENTE como estaba, a propósito—: publica la
 * evidencia para que la corrección se decida sobre datos y no sobre una
 * hipótesis.
 *
 * Lo que responde, fila por fila de la hoja A&C:
 *   • cuántas filas hay y cuántas tienen folio ilegible (se descartan al cruzar)
 *   • cuántas tienen dictamen favorable por igualdad exacta
 *   • para cada una de ésas: su N°, su Estado proyecto y su estado de
 *     Factibilidad, que son las dos columnas que pueden estar restando
 *   • si las columnas en las que se apoya el criterio siquiera existen
 */
function diagnosticoAC_(tablaAC, proyectos) {
  const favorables = [];
  const porClase = { favorable: 0, observaciones: 0, desestimado: 0, pendiente: 0, vacio: 0, desconocido: 0 };
  const desconocidos = {};
  let sinFolioLegible = 0;

  tablaAC.rows.forEach(row => {
    const folioCrudo = valor_(row, 'N° postulación', 'Numero_Ingreso', 'Folio');
    const folio = folio_(folioCrudo);
    if (!folio) sinFolioLegible++;

    const dictamen = valor_(row, 'Dictamen', 'Estado');
    const clase = clasificarDictamenAC_(dictamen).clase;
    porClase[clase] = (porClase[clase] || 0) + 1;
    if (clase === 'desconocido') desconocidos[texto_(dictamen)] = true;
    // El mismo predicado que cuenta la tarjeta del tablero: si acá se usara otro,
    // el diagnóstico del descuadre sería él mismo una fuente de descuadre.
    if (!esDictamenACFavorable_(dictamen)) return;

    const p = folio ? proyectos.get(folio) : null;
    favorables.push({
      nPostulacion: folio || '',
      folioCrudo: texto_(folioCrudo),
      cruzaConLaCartera: !!p,
      dictamenAC: texto_(dictamen),
      estadoAC: valor_(row, 'Estado proyecto'),
      estadoFactibilidad: p ? texto_(p.estadoFactibilidad) : ''
    });
  });

  return {
    filas: tablaAC.rows.length,
    sinFolioLegible: sinFolioLegible,
    conDictamenFavorable: favorables.length,
    // El criterio que hoy usa la tarjeta: dictamen favorable Y Estado proyecto
    // «Favorable». La diferencia con el de arriba ES el descuadre a explicar.
    conDictamenYEstadoFavorable: favorables.filter(f => normalizar_(f.estadoAC) === 'favorable').length,
    conFactibilidadHabilitada: favorables.filter(
      f => esFactibilidadHabilitada_(f.estadoFactibilidad)).length,
    nPostulacionFavorables: favorables.map(f => f.nPostulacion || f.folioCrudo),
    favorables: favorables,
    dictamenesPorClase: porClase,
    dictamenesFueraDeDominio: Object.keys(desconocidos),
    columnas: {
      dictamen: !!columnaPresente_(tablaAC, ['Dictamen']),
      estadoProyecto: !!columnaPresente_(tablaAC, ['Estado proyecto']),
      folio: !!columnaPresente_(tablaAC, ['N° postulación', 'Numero_Ingreso', 'Folio'])
    }
  };
}

/**
 * Inconsistencias de proceso que antes había que ir a buscar a mano en las
 * planillas. Son las que hacen que el dashboard sirva para decidir y no solo
 * para mirar: cada una señala un dato que se contradice con otro.
 */
function calcularAlertas_(p) {
  const alertas = [];
  const dictamen = clasificarDictamenAC_(p.dictamenAC).clase;
  const estadoAC = normalizar_(p.estadoAC);
  const estadoFact = clasificarEstadoFactibilidad_(p.estadoFactibilidad).clase;

  if (esDictamenACFavorable_(p.dictamenAC) && estadoAC !== 'favorable') {
    alertas.push('El dictamen A&C es favorable, pero Estado proyecto no está en Favorable.');
  }

  // El caso Liceo Mixto: pendiente y sin nada que lo explique. Antes el
  // «pendiente» se buscaba con /pendiente|revision/ dentro del texto, que da
  // verdadero para cosas como «Favorable con documentos pendientes».
  const obsAbiertas = Number(p.observacionesAbiertasAC || 0);
  if (dictamen === 'pendiente' && !obsAbiertas) {
    alertas.push('A&C pendiente con 0 observaciones abiertas: revisar si quedan criterios sin resolver.');
  }
  if (estadoFact === 'pendiente' && !texto_(p.observacionesFactibilidad)) {
    alertas.push('Factibilidad pendiente sin observaciones registradas: no está dicho qué falta.');
  }

  // Saltos de etapa: un proyecto no debería estar más adelante que su propia
  // evaluación. La tabla de reglas está arriba, junto a los hitos.
  alertasDeCoherencia_(p).forEach(m => alertas.push(m));

  // Evidencia sin declaración. El número y el enlace acompañan; la marca es la
  // que cuenta. Cuando hay lo uno sin lo otro el conteo NO sube —eso es lo
  // correcto— pero el desajuste tiene que decirse, porque suele ser una marca
  // que quedó sin poner.
  if ((texto_(p.acuerdoCoreNumero) || texto_(p.acuerdoCoreUrl)) && p.acuerdoCoreEstado !== 'si') {
    alertas.push('Hay N° o enlace de acuerdo CORE, pero la marca de acuerdo CORE no dice «Sí»: el conteo usa la marca.');
  }
  if ((texto_(p.resolucionNumero) || texto_(p.resolucionUrl)) && p.resolucionMarcaEstado !== 'si') {
    alertas.push('Hay N° o enlace de resolución, pero la marca de resolución no dice «Sí»: el conteo usa la marca.');
  }

  // Datos que faltan y bloquean el paso siguiente.
  if (texto_(p.estadoFactibilidad) && !texto_(p.evaluadorFactibilidad)) {
    alertas.push('Evaluado en Factibilidad sin evaluador/a registrado.');
  }
  if ((texto_(p.dictamenAC) || texto_(p.estadoAC)) && !texto_(p.evaluadorAC)) {
    alertas.push('Evaluado en A&C sin evaluador/a registrado.');
  }
  if (!texto_(p.nombreProyecto)) {
    alertas.push('Sin nombre de proyecto en ninguna planilla.');
  }

  // El proyecto existe en Factibilidad pero no en el padrón de Iniciativas.
  if (texto_(p.folioFactibilidad) && !texto_(p.comuna)) {
    alertas.push('Sin comuna: probablemente no cruza con Iniciativas.');
  }

  // Los valores fuera de dominio también son alertas: si sólo viven en
  // inconsistenciasDatos, nadie los ve hasta que abre el expediente.
  (p.inconsistenciasDatos || []).forEach(m => alertas.push('Dato fuera de dominio — ' + m));

  return alertas;
}

/**
 * Hitos del proyecto, en el orden del proceso. Es la única definición: las
 * reglas de coherencia y la etapa se leen desde acá para que no vuelvan a
 * decir cosas distintas sobre el mismo expediente.
 */
function hitosDelProyecto_(p) {
  return {
    factibilidadEvaluada: !!texto_(p.estadoFactibilidad),
    factibilidadHabilitada: esFactibilidadHabilitada_(p.estadoFactibilidad),
    acEvaluada: !!(texto_(p.dictamenAC) || texto_(p.estadoAC)),
    acDictamenFavorable: esDictamenACFavorable_(p.dictamenAC),
    corePriorizado: p.acuerdoCoreEstado === 'si',
    conResolucion: p.resolucionMarcaEstado === 'si',
    enEjecucion: enEjecucion_(p)
  };
}

/**
 * Estado de ejecución en vocabulario cerrado. Es el ejeEstado() del tablero, con
 * el mismo orden de evaluación: lo NO iniciado y lo terminado se resuelven antes
 * que lo positivo, porque «No iniciado» contiene «iniciad» y «Sin ejecución»
 * contiene «ejecución».
 */
function ejeEstado_(p) {
  const n = normalizar_(p.estadoEjecucion);
  if (!n) return texto_(p.fechaInicioEjecucion) ? 'porIniciar' : 'sinInformar';
  if (/no terminad|no finaliz|sin terminar/.test(n)) return 'ejecucion';
  if (/terminad|finaliz|cerrad|concluid|ejecutad/.test(n)) return 'terminado';
  if (/no inicia|por inicia|sin inicia|no ha inicia|pendiente|sin ejecu|no ejecu|proxim|programad/.test(n)) return 'porIniciar';
  if (/ejecucion|en curso|iniciad|en marcha|ejecutand|desarroll/.test(n)) return 'ejecucion';
  return 'otro';
}

/**
 * Hito «En ejecución».
 *
 * Antes bastaba con que EXISTIERA una fecha de inicio, así que un expediente con
 * la fecha meramente PLANIFICADA en la postulación —el estado normal de
 * cualquier proyecto todavía en A&C o en CORE— daba el hito por cumplido y
 * disparaba la alerta «aparece en ejecución sin resolución aprobatoria». Una
 * fecha programada no es una ejecución: para respaldar el hito sin estado
 * declarado hace falta la marca de resolución Y que la fecha ya haya pasado.
 */
function enEjecucion_(p) {
  const e = ejeEstado_(p);
  if (e === 'ejecucion' || e === 'terminado') return true;
  if (e === 'otro') return false;
  const inicio = fechaLocal_(p.fechaInicioEjecucion);
  return p.resolucionMarcaEstado === 'si' && !!inicio && inicio.getTime() <= Date.now();
}

/**
 * Fecha LOCAL desde texto. Mismo parser que parseDate() del tablero: las ISO
 * cortas construidas con `new Date(s)` se interpretan en UTC y en Chile se leen
 * un día antes, y «20-07-2026» —habitual en la planilla— caía a null.
 */
function fechaLocal_(valor) {
  if (valor instanceof Date) return isNaN(valor.getTime()) ? null : valor;
  const s = texto_(valor);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ][\d:.]+.*)?$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Motor de la tabla REGLAS_COHERENCIA_HITOS_. */
function alertasDeCoherencia_(p) {
  const hitos = hitosDelProyecto_(p);
  const mensajes = [];
  REGLAS_COHERENCIA_HITOS_.forEach(regla => {
    if (hitos[regla.siguiente] && !hitos[regla.previo]) mensajes.push(regla.mensaje);
  });
  return mensajes;
}

function texto_(v) {
  return String(v == null ? '' : v).trim();
}

/**
 * Lee una hoja indexando por encabezado normalizado.
 *
 * Una hoja ausente ya no derriba el dashboard completo: se anota en `avisos` y
 * se devuelve una tabla vacía. Perder la pestaña «Priorización» no puede dejar
 * a oscuras también Factibilidad y A&C.
 */
function leerTablaPorEncabezados_(ss, sheetName, avisos) {
  const sheet = resolverHoja_(ss, sheetName, avisos);
  if (!sheet) return { nombre: sheetName, headers: [], claves: [], rows: [] };
  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length) return { nombre: sheet.getName(), headers: [], claves: [], rows: [] };
  const headers = values[0].map(String);
  const normalizedHeaders = headers.map(normalizarClave_);
  const rows = values.slice(1).filter(row => row.some(v => String(v).trim() !== '')).map(row => {
    const obj = {};
    normalizedHeaders.forEach((key, i) => { if (key) obj[key] = row[i] == null ? '' : String(row[i]).trim(); });
    return obj;
  });
  return { nombre: sheet.getName(), headers: headers, claves: normalizedHeaders, rows: rows };
}

/**
 * Encuentra la pestaña tolerando cómo la escribió una persona.
 *
 * getSheetByName() es igualdad binaria: «Priorizacion» sin tilde o
 * «Priorización » con un espacio al final devolvían cero filas, y el tablero
 * mostraba CORE 0 sin distinguirlo de «no hay ningún acuerdo». El nombre de una
 * pestaña no es una clave primaria; la tolerancia va acá, pero la diferencia
 * queda ESCRITA en avisos —si se arregla en silencio, nadie renombra la hoja y
 * la próxima variante vuelve a romperlo.
 */
function resolverHoja_(ss, sheetName, avisos) {
  const exacta = ss.getSheetByName(sheetName);
  if (exacta) return exacta;

  const objetivo = normalizar_(sheetName);
  const hojas = ss.getSheets();
  const candidatas = hojas.filter(sh => normalizar_(sh.getName()) === objetivo);

  if (!candidatas.length) {
    if (avisos) {
      avisos.push('No existe la hoja «' + sheetName + '»: esa sección viene vacía. ' +
        'Pestañas disponibles: ' + hojas.map(sh => sh.getName()).join(' · ') + '.');
    }
    return null;
  }

  if (avisos) {
    avisos.push('La hoja «' + sheetName + '» se encontró como «' + candidatas[0].getName() +
      '» (difiere en tildes, mayúsculas o espacios). Se leyó igual, pero conviene ' +
      'renombrar la pestaña: cualquier otra herramienta que la busque exacta no la va a encontrar.');
    if (candidatas.length > 1) {
      avisos.push('Hay ' + candidatas.length + ' pestañas que coinciden con «' + sheetName +
        '» al normalizar (' + candidatas.map(sh => sh.getName()).join(' · ') +
        '). Se usó la primera; el resto queda sin leer.');
    }
  }
  return candidatas[0];
}

/**
 * Diagnóstico de la columna donde vive una marca. Un cero en el tablero tiene al
 * menos cuatro causas —la columna no existe, existe y está vacía, existe con
 * valores que el dominio no reconoce, o hay dos columnas candidatas— y las
 * cuatro se veían igual. Cada una deja su propio aviso, que la UI pinta como
 * banner: sin esto, «3 filas · 0 marcas» era indistinguible de «nadie firmó».
 */
function revisarColumnaDeMarca_(tabla, sheetName, alias, queMarca, avisos) {
  if (!avisos || !tabla.rows.length) return;

  const presentes = columnasPresentes_(tabla, alias);
  if (!presentes.length) {
    avisos.push('La hoja «' + sheetName + '» tiene ' + tabla.rows.length +
      ' filas pero ninguna columna de marca de ' + queMarca + '. Se buscó: ' +
      alias.map(a => '«' + a + '»').join(', ') + '. Todos los proyectos quedan sin esa marca.');
    return;
  }

  if (presentes.length > 1) {
    avisos.push('La hoja «' + sheetName + '» tiene ' + presentes.length +
      ' columnas que pueden contener la marca de ' + queMarca + ' (' +
      presentes.map(c => '«' + c + '»').join(', ') + '). Se usa la primera que traiga un valor ' +
      'del dominio (Sí / No / En tramitación); conviene dejar una sola para que no dependa de eso.');
  }

  let conValor = 0, fueraDeDominio = 0;
  const ejemplos = {};
  tabla.rows.forEach(row => {
    const m = leerMarca_(row, alias);
    if (m.estado === 'vacio') return;
    conValor++;
    if (m.estado === 'desconocido') { fueraDeDominio++; ejemplos[m.raw] = true; }
  });

  if (!conValor) {
    avisos.push('La hoja «' + sheetName + '» tiene la columna de marca de ' + queMarca +
      ' («' + presentes[0] + '»), pero está vacía en las ' + tabla.rows.length +
      ' filas. El conteo en cero es real: no es un problema de lectura.');
    return;
  }

  if (fueraDeDominio) {
    avisos.push('En la hoja «' + sheetName + '», ' + fueraDeDominio + ' de ' + conValor +
      ' valores de la marca de ' + queMarca + ' no están en el dominio (Sí / No / En tramitación): ' +
      Object.keys(ejemplos).map(v => '«' + v + '»').join(', ') +
      '. Esas filas NO suben el conteo y quedan como inconsistencia en su proyecto.');
  }
}

/** El primer alias que exista como columna de la tabla, o '' si ninguno. */
function columnaPresente_(tabla, alias) {
  const presentes = columnasPresentes_(tabla, alias);
  return presentes.length ? presentes[0] : '';
}

/**
 * Las columnas DISTINTAS que existen y pueden contener la marca, en el orden de
 * la lista de alias. Dos alias que normalizan igual —'Resolución' y
 * 'Resolucion'— son la MISMA columna: contarlas dos veces haría que la hoja
 * pareciera ambigua cuando no lo es.
 */
function columnasPresentes_(tabla, alias) {
  const claves = tabla.claves || [];
  const vistas = {};
  const out = [];
  alias.forEach(a => {
    const k = normalizarClave_(a);
    if (claves.indexOf(k) < 0 || vistas[k]) return;
    vistas[k] = true;
    out.push(a);
  });
  return out;
}

function valor_(row) {
  return valorConOrigen_(row, Array.prototype.slice.call(arguments, 1)).valor;
}

/**
 * Como valor_, pero además dice DE QUÉ columna salió el dato y si alguna de las
 * candidatas existía siquiera.
 *
 * Hace falta para dos cosas: nombrar la columna en la inconsistencia («la
 * columna “de acuerdo CORE” dice “Aprobado”») y distinguir «columna ausente» de
 * «celda vacía», que era el punto ciego que hacía indistinguibles una pestaña
 * mal rotulada y una cartera sin acuerdos.
 */
function valorConOrigen_(row, alias) {
  let columnaExistente = '';
  for (let i = 0; i < alias.length; i++) {
    const key = normalizarClave_(alias[i]);
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    if (!columnaExistente) columnaExistente = alias[i];
    const value = row[key];
    if (value !== '') return { valor: value, columna: alias[i], existe: true };
  }
  return { valor: '', columna: columnaExistente, existe: !!columnaExistente };
}

function asegurarProyecto_(map, folio, row) {
  if (!map.has(folio)) {
    map.set(folio, {
      nPostulacion: folio,
      nombreProyecto: valor_(row, 'Nombre proyecto', 'Nombre_Proyecto'),
      institucion: valor_(row, 'Institución - Nombre', 'Nombre_Organizacion'),
      rutInstitucion: valor_(row, 'Institución - Rut', 'Rut_Organizacion'),
      comuna: valor_(row, 'Comuna'),
      fondo: valor_(row, 'Fondo'),
      categoria: valor_(row, 'Tipo categoría', 'Tipo_Categoria'),
      monto: valor_(row, 'Monto solicitado', 'Monto Solicitado GORE', 'Monto_Solicitado_CLP'),
      alertas: [],
      inconsistenciasDatos: []
    });
  }
  return map.get(folio);
}

/**
 * La etapa es una escalera: se responde de arriba hacia abajo.
 *
 * Dos cambios respecto de la versión anterior:
 *  • «Con resolución» sale de la MARCA, no de que exista un número o un enlace.
 *    El enlace es evidencia y puede pegarse antes de que el acto exista.
 *  • «Factibilidad favorable» se decide por igualdad exacta contra los literales
 *    canónicos. El regex /habilitar|favorable|factible/ clasificaba «NO FACTIBLE
 *    TÉCNICAMENTE» como favorable, porque «factible» está dentro de «no
 *    factible» y «favorable» dentro de «desfavorable».
 *
 * El criterio de «A&C favorable» queda intacto a propósito (T6): se instrumenta
 * primero en sources.diagnosticoAC y se corrige después, con el dato a la vista.
 */
function calcularEtapa_(p) {
  if (enEjecucion_(p)) return 'En ejecución';
  if (p.resolucionMarcaEstado === 'si') return 'Con resolución';
  if (p.acuerdoCoreEstado === 'si') return 'Priorizado/CORE';
  if (esDictamenACFavorable_(p.dictamenAC) &&
      normalizar_(p.estadoAC) === 'favorable') return 'A&C favorable';
  if (p.dictamenAC || p.estadoAC) return 'Admisibilidad y Consistencia';
  if (esFactibilidadHabilitada_(p.estadoFactibilidad)) return 'Factibilidad favorable';
  if (p.estadoFactibilidad) return 'Factibilidad';
  return 'Ingresado';
}

/**
 * Marca tri-estado del contrato de datos.
 *
 * Devuelve { estado, etiqueta, raw }:
 *   estado   'si' | 'no' | 'tramitacion' | 'vacio' | 'desconocido'
 *   etiqueta 'Sí' | 'No' | 'En tramitación' | ''   (dominio cerrado)
 *   raw      el texto original de la celda, siempre
 *
 * Reemplaza a normalizarSiNo_, que devolvía '' para todo lo que no fuera
 * sí/no: «En tramitación» terminaba viéndose igual que una celda vacía y que un
 * «No», y un valor mal escrito desaparecía sin dejar rastro. Acá lo que no cae
 * en el dominio queda como 'desconocido' —con su texto original a mano— para
 * que la UI pueda mostrarlo y el proyecto levante la inconsistencia.
 *
 * La etiqueta de un 'desconocido' es '' porque el dominio de la etiqueta es
 * cerrado; el valor original no se pierde: viaja en raw.
 */
function clasificarMarca_(valorCrudo) {
  const raw = texto_(valorCrudo);
  const n = normalizar_(raw);
  if (!n) return { estado: 'vacio', etiqueta: '', raw: raw };
  if (MARCA_SI_.indexOf(n) >= 0) return { estado: 'si', etiqueta: 'Sí', raw: raw };
  if (MARCA_NO_.indexOf(n) >= 0) return { estado: 'no', etiqueta: 'No', raw: raw };
  if (MARCA_TRAMITACION_.indexOf(n) >= 0) return { estado: 'tramitacion', etiqueta: 'En tramitación', raw: raw };
  return { estado: 'desconocido', etiqueta: '', raw: raw };
}

/**
 * Lectura de una marca desde una fila, con el nombre de la columna que cruzó.
 *
 * Gana el primer alias cuyo valor esté EN EL DOMINIO, no el primero que traiga
 * cualquier cosa. Es la diferencia entre leer la marca y leer el número del
 * acuerdo: si la planilla conserva una columna «Acuerdo CORE» con «184/2026»
 * junto a la marca real en «de acuerdo CORE», la versión anterior devolvía
 * «184/2026» —desconocido— y el proyecto dejaba de contarse en silencio.
 *
 * Si NINGÚN alias trae un valor del dominio pero alguno trae algo, se devuelve
 * ese algo como 'desconocido': un valor que no entendemos se publica y se anota,
 * jamás se cambia por un vacío.
 */
function leerMarca_(row, alias) {
  let vacia = null, fuera = null;
  for (let i = 0; i < alias.length; i++) {
    const key = normalizarClave_(alias[i]);
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    const marca = clasificarMarca_(row[key]);
    marca.columna = alias[i];
    marca.columnaExiste = true;
    if (marca.estado === 'vacio') { if (!vacia) vacia = marca; continue; }
    if (marca.estado === 'desconocido') { if (!fuera) fuera = marca; continue; }
    return marca;
  }
  if (fuera) return fuera;
  if (vacia) return vacia;
  const sinColumna = clasificarMarca_('');
  sinColumna.columna = alias[0];
  sinColumna.columnaExiste = false;
  return sinColumna;
}

/**
 * Escribe la marca en el proyecto con el prefijo del contrato
 * (acuerdoCore → acuerdoCore / acuerdoCoreEstado / acuerdoCoreRaw).
 *
 * Dos filas de Priorización pueden colapsar en el mismo folio canónico (1C ≡ 15,
 * o «16» y «16.0» en la misma hoja). Eso obliga a decidir qué pasa cuando las
 * dos hablan de la misma marca:
 *
 *  · una lectura VACÍA no pisa una marca ya puesta — la ausencia no es un dato;
 *  · dos lecturas del MISMO estado se funden sin ruido;
 *  · dos lecturas de estados DISTINTOS son un conflicto, y no se resuelve por
 *    orden de hoja. Publicar la última convertía «En tramitación» en «No» —o al
 *    revés— según en qué fila la escribieron. Se publica 'desconocido' con los
 *    dos valores a la vista y una inconsistencia que nombra ambos: la planilla
 *    tiene que decidir, no el orden de lectura.
 */
function aplicarMarca_(p, prefijo, marca) {
  const estadoPrevio = p[prefijo + 'Estado'];
  const yaTiene = estadoPrevio !== undefined && estadoPrevio !== 'vacio';

  if (yaTiene && marca.estado === 'vacio') return;

  if (yaTiene && marca.estado !== estadoPrevio) {
    const previo = texto_(p[prefijo + 'Raw']);
    p[prefijo] = '';
    p[prefijo + 'Estado'] = 'desconocido';
    p[prefijo + 'Raw'] = previo + ' / ' + marca.raw;
    anotarInconsistenciaLibre_(p,
      'Columna «' + marca.columna + '»: dos filas del mismo proyecto declaran marcas distintas ' +
      '(«' + previo + '» y «' + marca.raw + '»). No se publica ninguna de las dos como si fuera ' +
      'la verdad: corregir la planilla para que el proyecto tenga una sola marca.');
    return;
  }

  if (yaTiene && marca.estado === estadoPrevio) return;

  p[prefijo] = marca.etiqueta;
  p[prefijo + 'Estado'] = marca.estado;
  p[prefijo + 'Raw'] = marca.raw;
  if (marca.estado === 'desconocido') {
    anotarInconsistencia_(p, marca.columna, marca.raw, 'Sí / No / En tramitación');
  }
}

/**
 * Un proyecto que nunca apareció en Priorización igual debe cumplir el
 * contrato: sin esto, la UI recibe `undefined` y no puede distinguir «no hay
 * fila» de «la celda está vacía».
 */
function asegurarMarcasDelContrato_(p) {
  if (!Array.isArray(p.inconsistenciasDatos)) p.inconsistenciasDatos = [];
  ['acuerdoCore', 'resolucionMarca'].forEach(prefijo => {
    if (p[prefijo + 'Estado'] === undefined) {
      p[prefijo] = '';
      p[prefijo + 'Estado'] = 'vacio';
      p[prefijo + 'Raw'] = '';
    }
  });
}

/**
 * Los dos estados evaluativos también tienen dominio cerrado. Un literal que no
 * está en la pauta suele ser una versión vieja del formulario, un error de
 * fórmula (#VALUE!) o texto libre — cualquiera de los tres deja el proyecto
 * fuera de los conteos sin que nadie se entere.
 */
function revisarDominiosEvaluativos_(p) {
  const dictamen = clasificarDictamenAC_(p.dictamenAC);
  if (dictamen.clase === 'desconocido') {
    anotarInconsistencia_(p, 'Dictamen (A&C)', dictamen.raw,
      'EVALUACIÓN TÉCNICA FAVORABLE / CON OBSERVACIONES / DESESTIMADO POR NO SUBSANACIÓN / REVISIÓN PENDIENTE');
  }
  const fact = clasificarEstadoFactibilidad_(p.estadoFactibilidad);
  if (fact.clase === 'desconocido') {
    anotarInconsistencia_(p, 'Estado (Factibilidad)', fact.raw,
      'HABILITAR FORMULACIÓN DE EXPEDIENTE / OBSERVAR PARA SUBSANACIÓN / DESESTIMAR / EVALUACIÓN PENDIENTE');
  }
}

/** Una entrada por valor fuera de dominio, con la columna y el texto original. */
function anotarInconsistencia_(p, columna, crudo, esperado) {
  anotarInconsistenciaLibre_(p,
    'Columna «' + columna + '»: «' + crudo + '» no está en el dominio esperado (' + esperado + ').');
}

/** Inconsistencia con mensaje propio, sin duplicar. */
function anotarInconsistenciaLibre_(p, mensaje) {
  if (!Array.isArray(p.inconsistenciasDatos)) p.inconsistenciasDatos = [];
  if (p.inconsistenciasDatos.indexOf(mensaje) < 0) p.inconsistenciasDatos.push(mensaje);
}

/**
 * Clasificación por IGUALDAD contra el dominio, nunca por coincidencia parcial.
 * Devuelve { clase, raw }; 'vacio' si no hay nada, 'desconocido' si hay algo
 * que el dominio no reconoce.
 */
function clasificarContraDominio_(dominio, valor) {
  const raw = texto_(valor);
  const n = normalizar_(raw);
  if (!n) return { clase: 'vacio', raw: raw };
  const clase = Object.prototype.hasOwnProperty.call(dominio, n) ? dominio[n] : 'desconocido';
  return { clase: clase, raw: raw };
}

function clasificarDictamenAC_(valor) {
  return clasificarContraDominio_(DOMINIO_DICTAMEN_AC_, valor);
}

function clasificarEstadoFactibilidad_(valor) {
  return clasificarContraDominio_(DOMINIO_ESTADO_FACTIBILIDAD_, valor);
}

/**
 * Identidad del proyecto para el cruce entre hojas.
 *
 * Devuelve el folio CANÓNICO: normaliza «16.0» → «16», «N° 7» → «7», y colapsa
 * las equivalencias declaradas en FoliosL3 (1C ≡ 15) a una sola clave. Antes
 * era trim().toUpperCase(), así que Judo Fukuoka salía duplicado —«1C» con los
 * datos de Iniciativas y «15» con los de Factibilidad— y ninguna de las dos
 * filas mostraba el proyecto completo.
 */
function folio_(value) {
  return L3_folioCanonico_(value);
}

function primero_() {
  for (let i = 0; i < arguments.length; i++) {
    const value = arguments[i];
    if (value != null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

/**
 * Forma comparable de un texto: sin tildes, sin espacios de más, en minúsculas.
 *
 * El colapso de espacios (que incluye el espacio duro que Sheets pega al copiar
 * desde otra planilla) es lo que hace que la igualdad exacta sea usable: sin él,
 * «EVALUACIÓN  TÉCNICA FAVORABLE» con doble espacio no era favorable y el
 * proyecto se caía del KPI en silencio.
 */
function normalizar_(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizarClave_(value) {
  return normalizar_(value).replace(/[^a-z0-9]+/g, '');
}

function compararFolios_(a, b) {
  return String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });
}

function responderDashboard_(payload, callback) {
  const json = JSON.stringify(payload);
  const cb = String(callback || '').trim();
  if (cb && /^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(cb)) {
    return ContentService.createTextOutput(cb + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

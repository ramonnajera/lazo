const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/mediciones');
const A = require('../src/alerts');
const R = require('../src/resumen');
const { empty } = require('../src/store');

const now = (time, date = '2026-11-18') => ({ date, time, minutes: 0, weekday: 3 });

test('validar mediciones: rangos, enteros y coherencia', () => {
  assert.ok(M.validar('presion', { sistolica: 120, diastolica: 80, pulso: 70 }).ok);
  assert.ok(!M.validar('presion', { sistolica: 80, diastolica: 120 }).ok);
  assert.ok(!M.validar('presion', { sistolica: 120 }).ok);
  assert.ok(M.validar('glucosa', { mgdl: 95 }).ok);
  assert.ok(!M.validar('glucosa', { mgdl: 5 }).ok);
  assert.ok(M.validar('animo', { nivel: 3 }).ok);
  assert.ok(!M.validar('animo', { nivel: 3.5 }).ok);
  assert.ok(!M.validar('animo', { nivel: 6 }).ok);
  assert.ok(M.validar('dolor', { nivel: 0 }).ok);
  assert.ok(!M.validar('fiebre', { grados: 38 }).ok);
  assert.ok(!M.validar('peso', null).ok);
});

test('evaluar: normal, límite, crisis y rangos propios', () => {
  assert.equal(M.evaluar('presion', { sistolica: 120, diastolica: 80 }), null);
  assert.equal(M.evaluar('presion', { sistolica: 140, diastolica: 85 }).nivel, 'media');
  assert.equal(M.evaluar('presion', { sistolica: 185, diastolica: 100 }).nivel, 'alta');
  assert.equal(M.evaluar('presion', { sistolica: 85, diastolica: 55 }).texto, 'Presión baja: 85/55');
  assert.equal(M.evaluar('glucosa', { mgdl: 100 }), null);
  assert.equal(M.evaluar('glucosa', { mgdl: 60 }).nivel, 'media');
  assert.equal(M.evaluar('glucosa', { mgdl: 50 }).nivel, 'alta');
  assert.equal(M.evaluar('glucosa', { mgdl: 320 }).texto, 'Glucosa muy alta: 320 mg/dL');
  assert.equal(M.evaluar('dolor', { nivel: 7 }).nivel, 'media');
  assert.equal(M.evaluar('dolor', { nivel: 6 }), null);
  assert.equal(M.evaluar('animo', { nivel: 2 }).nivel, 'media');
  assert.equal(M.evaluar('peso', { kg: 70 }), null);
  assert.equal(M.evaluar('glucosa', { mgdl: 150 }, { glucosa: { max: 140 } }).nivel, 'media'); // el médico fijó otro máximo
});

// El medicamento empieza el 18: antes de esa fecha no hay dosis (por eso no hay alertas del pasado).
const base = (inicio = '2026-11-18') => {
  const d = empty();
  d.perfil = { nombre: 'Ana Ejemplo', discapacidad: 'visual' };
  d.medicamentos = [{ id: 'm1', nombre: 'Metformina', dosis: '850 mg', horarios: ['08:00', '20:00'], existencias: 10, inicio }];
  return d;
};

test('una dosis sin confirmar genera alerta alta solo pasada la tolerancia', () => {
  const d = base();
  assert.equal(A.compute(d, now('08:20'), 'x').filter((a) => a.tipo === 'dosis-atrasada').length, 0);
  const a = A.compute(d, now('08:31'), 'x').filter((a) => a.tipo === 'dosis-atrasada');
  assert.equal(a.length, 1);
  assert.equal(a[0].severidad, 'alta');
  assert.equal(a[0].titulo, 'Sin confirmar: Metformina');
});

test('confirmar la dosis quita la alerta; omitir la baja a media', () => {
  const d = base();
  d.tomas = [{ medicamentoId: 'm1', fecha: '2026-11-18', hora: '08:00', estado: 'tomada' }];
  assert.equal(A.compute(d, now('09:00'), 'x').length, 0);
  d.tomas = [{ medicamentoId: 'm1', fecha: '2026-11-18', hora: '08:00', estado: 'omitida' }];
  const [o] = A.compute(d, now('09:00'), 'x');
  assert.equal(o.tipo, 'dosis-omitida');
  assert.equal(o.severidad, 'media');
});

test('las alertas viejas (más de 2 días) ya no aparecen', () => {
  const d = base();
  const viejas = A.compute(d, now('09:00', '2026-11-22'), 'x').filter((a) => a.tipo === 'dosis-atrasada');
  assert.equal(viejas.length, 5); // anteayer y ayer (2 dosis cada día) y la de las 08:00 de hoy; la de las 20:00 aún no vence
  assert.ok(viejas.every((a) => a.fecha >= '2026-11-20'));
});

test('citas próximas, existencias bajas y mediciones fuera de rango', () => {
  const d = base();
  d.medicamentos[0].existencias = 2;
  d.citas = [{ id: 'c1', especialista: 'Oftalmología', fecha: '2026-11-18', hora: '17:00', lugar: 'Hospital General' }, { id: 'c2', especialista: 'Lejana', fecha: '2026-12-30', hora: '10:00' }];
  d.mediciones = [{ id: 'x1', tipo: 'glucosa', valor: { mgdl: 250 }, fecha: '2026-11-18', hora: '07:00' }, { id: 'x2', tipo: 'glucosa', valor: { mgdl: 250 }, fecha: '2026-11-10', hora: '07:00' }];
  d.tomas = [{ medicamentoId: 'm1', fecha: '2026-11-18', hora: '08:00', estado: 'tomada' }];
  const tipos = A.compute(d, now('12:00'), 'x').map((a) => a.tipo).sort();
  assert.deepEqual(tipos, ['cita-proxima', 'existencias-bajas', 'medicion-fuera-de-rango']);
});

test('las alertas vistas se marcan por token', () => {
  const d = base();
  d.vistos = { t1: ['dosis:m1:2026-11-18:08:00'] };
  const t1 = A.compute(d, now('09:00'), 't1').find((a) => a.id === 'dosis:m1:2026-11-18:08:00');
  const t2 = A.compute(d, now('09:00'), 't2').find((a) => a.id === 'dosis:m1:2026-11-18:08:00');
  assert.equal(t1.visto, true);
  assert.equal(t2.visto, false);
});

test('ordena por gravedad y luego por fecha reciente', () => {
  const d = base();
  d.citas = [{ id: 'c1', especialista: 'X', fecha: '2026-11-18', hora: '17:00' }];
  const lista = A.compute(d, now('09:00'), 'x');
  assert.deepEqual(lista.map((a) => a.severidad), ['alta', 'info']);
});

test('adherencia: solo cuenta lo ya vencido y calcula el porcentaje', () => {
  const d = base('2026-11-17');
  d.tomas = [
    { medicamentoId: 'm1', fecha: '2026-11-17', hora: '08:00', estado: 'tomada' },
    { medicamentoId: 'm1', fecha: '2026-11-17', hora: '20:00', estado: 'tomada' },
    { medicamentoId: 'm1', fecha: '2026-11-18', hora: '08:00', estado: 'tomada' }
  ];
  const a = R.adherencia(d, now('12:00'), 2);
  assert.deepEqual(a.porDia[0], { fecha: '2026-11-17', programadas: 2, tomadas: 2, omitidas: 0, atrasadas: 0, pendientes: 0 });
  assert.deepEqual(a.porDia[1], { fecha: '2026-11-18', programadas: 2, tomadas: 1, omitidas: 0, atrasadas: 0, pendientes: 1 });
  assert.equal(a.porcentaje, 100); // 3 vencidas, 3 tomadas; la de las 20:00 de hoy aún no cuenta
  d.tomas.pop();
  assert.equal(R.adherencia(d, now('12:00'), 2).porcentaje, 67);
});

test('adherencia sin dosis devuelve null, no 0 ni NaN', () => {
  assert.equal(R.adherencia(empty(), now('12:00')).porcentaje, null);
});

test('resumen del cuidador: persona, próxima toma, citas ordenadas y últimas mediciones', () => {
  const d = base();
  d.citas = [{ id: 'b', especialista: 'B', fecha: '2026-11-25', hora: '09:00' }, { id: 'a', especialista: 'A', fecha: '2026-11-20', hora: '09:00' }, { id: 'p', especialista: 'Pasada', fecha: '2026-11-01', hora: '09:00' }];
  d.mediciones = [{ id: '1', tipo: 'presion', valor: { sistolica: 130, diastolica: 85 }, fecha: '2026-11-17', hora: '08:00' }, { id: '2', tipo: 'presion', valor: { sistolica: 120, diastolica: 80 }, fecha: '2026-11-18', hora: '08:00' }];
  const r = R.resumen(d, now('07:00'), 'x');
  assert.equal(r.persona.nombre, 'Ana Ejemplo');
  assert.equal(r.proximaToma.hora, '08:00');
  assert.deepEqual(r.citas.map((c) => c.id), ['a', 'b']);
  assert.equal(r.mediciones.presion.texto, '120/80');
  assert.deepEqual(r.alertas, []);
});

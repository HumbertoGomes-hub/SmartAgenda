'use strict';

process.env.TZ = 'America/Sao_Paulo';

const test = require('node:test');
const assert = require('node:assert/strict');
const { horariosLivres, lotado } = require('../src/dominio/horarios');

// Segunda a sábado, 8h às 18h, de 30 em 30 min, 2h de antecedência, 30 dias, 1 por vez.
const AGENDA = {
  diasFuncionamento: [1, 2, 3, 4, 5, 6],
  horaAbertura: '08:00',
  horaFechamento: '18:00',
  intervaloMinutos: 30,
  capacidadeSimultanea: 1,
  antecedenciaMinimaHoras: 2,
  limiteDiasFuturos: 30,
};
const SEGUNDA = { ano: 2026, mes: 11, dia: 16 };
const AGORA = new Date(2026, 10, 12, 9, 0); // quinta, 12/11, 9h
const local = (dia, hora, minuto = 0) => new Date(2026, 10, dia, hora, minuto);

function livres(extra) {
  return horariosLivres({ data: SEGUNDA, duracaoMinutos: 60, agenda: AGENDA, bloqueado: false, ocupados: [], agora: AGORA, ...extra });
}

test('dia livre: de 30 em 30 minutos, terminando até o fechamento (RN-05)', () => {
  const horarios = livres();
  assert.equal(horarios[0], '08:00');
  assert.equal(horarios[horarios.length - 1], '17:00'); // 17h + 1h = 18h
  assert.equal(horarios.length, 19);
  assert.deepEqual(livres({ duracaoMinutos: 600 }), ['08:00']); // 10h cabe só às 8h
  assert.deepEqual(livres({ duracaoMinutos: 660 }), []);
});

test('domingo, data bloqueada, passado e além do limite não têm horário (RN-07)', () => {
  assert.deepEqual(livres({ data: { ano: 2026, mes: 11, dia: 15 } }), []); // domingo
  assert.deepEqual(livres({ bloqueado: true }), []);
  assert.deepEqual(livres({ data: { ano: 2026, mes: 11, dia: 11 } }), []); // ontem
  assert.deepEqual(livres({ data: { ano: 2026, mes: 12, dia: 14 } }), []); // 32 dias depois
});

test('hoje: só a partir da antecedência mínima', () => {
  const hoje = livres({ data: { ano: 2026, mes: 11, dia: 12 } }); // agora são 9h
  assert.equal(hoje[0], '11:00');
});

test('horário ocupado sai da lista; encostado pode (RN-06)', () => {
  const ocupados = [{ inicio: local(16, 10), fim: local(16, 12) }];
  const horarios = livres({ ocupados });
  assert.ok(horarios.includes('09:00')); // 9h às 10h encosta
  assert.ok(!horarios.includes('09:30'));
  assert.ok(!horarios.includes('11:30'));
  assert.ok(horarios.includes('12:00'));
});

test('capacidade olha cada instante, como o banco', () => {
  const ocupados = [
    { inicio: local(16, 8), fim: local(16, 9) },
    { inicio: local(16, 9), fim: local(16, 10) },
  ];
  assert.equal(lotado(ocupados, local(16, 8), local(16, 10), 2), false);
  assert.equal(lotado(ocupados, local(16, 8), local(16, 10), 1), true);
  assert.ok(livres({ ocupados, duracaoMinutos: 120, agenda: { ...AGENDA, capacidadeSimultanea: 2 } }).includes('08:00'));
});

'use strict';

// "Hoje" e os horários seguem o fuso da estética, como no servidor (config.js).
process.env.TZ = 'America/Sao_Paulo';

const test = require('node:test');
const assert = require('node:assert/strict');
const dominio = require('../src/dominio/agenda');

test('transições de status permitidas são exatamente as da RN-16', () => {
  const todos = ['PENDENTE', 'AGUARDANDO_CLIENTE', 'CONFIRMADO', 'RECUSADO', 'EXPIRADO', 'CANCELADO', 'CONCLUIDO', 'NAO_COMPARECEU'];
  const permitidas = [];
  for (const de of todos) {
    for (const para of todos) {
      if (dominio.podeMudar(de, para)) {
        permitidas.push(`${de}>${para}`);
      }
    }
  }
  assert.deepEqual(permitidas.sort(), [
    'AGUARDANDO_CLIENTE>CANCELADO',
    'AGUARDANDO_CLIENTE>CONFIRMADO',
    'CONFIRMADO>CANCELADO',
    'CONFIRMADO>CONCLUIDO',
    'CONFIRMADO>NAO_COMPARECEU',
    'PENDENTE>AGUARDANDO_CLIENTE',
    'PENDENTE>CANCELADO',
    'PENDENTE>CONFIRMADO',
    'PENDENTE>EXPIRADO',
    'PENDENTE>RECUSADO',
  ]);
});

test('lê datas reais e recusa as que não existem', () => {
  assert.deepEqual(dominio.lerData('2026-11-10'), { ano: 2026, mes: 11, dia: 10 });
  assert.equal(dominio.lerData('2026-02-30'), null);
  assert.equal(dominio.lerData('10/11/2026'), null);
  assert.equal(dominio.lerData(undefined), null);
});

test('lê horas em múltiplos de 5 minutos', () => {
  assert.equal(dominio.lerHora('08:00'), 480);
  assert.equal(dominio.lerHora('14:35'), 875);
  assert.equal(dominio.lerHora('14:32'), null);
  assert.equal(dominio.lerHora('24:00'), null);
  assert.equal(dominio.lerHora('8:00'), null);
});

test('data e hora do painel viram o instante no fuso da estética', () => {
  const instante = dominio.instanteLocal({ ano: 2026, mes: 11, dia: 10 }, 14 * 60 + 30);
  assert.equal(instante.toISOString(), '2026-11-10T17:30:00.000Z');
});

test('período da agenda vai do início do primeiro dia ao fim do último, até 62 dias', () => {
  const periodo = dominio.lerPeriodo('2026-11-01', '2026-11-30');
  assert.equal(periodo.inicio.toISOString(), '2026-11-01T03:00:00.000Z');
  assert.equal(periodo.fim.toISOString(), '2026-12-01T03:00:00.000Z');
  assert.ok(dominio.lerPeriodo('2026-11-01', '2027-01-01'));
  assert.equal(dominio.lerPeriodo('2026-11-01', '2027-01-02'), null);
  assert.equal(dominio.lerPeriodo('2026-11-10', '2026-11-09'), null);
});

test('telefone com DDD vira +55, celular ou fixo', () => {
  assert.equal(dominio.lerTelefone('(11) 98765-4321'), '+5511987654321');
  assert.equal(dominio.lerTelefone('+55 11 98765-4321'), '+5511987654321');
  assert.equal(dominio.lerTelefone('11 3000-0000'), '+551130000000');
  assert.equal(dominio.lerTelefone('98765-4321'), null);
  assert.equal(dominio.lerTelefone('(01) 98765-4321'), null);
});

test('serviços: ao menos um, inteiros e sem repetir (RN-04)', () => {
  assert.deepEqual(dominio.lerServicos([1, '3']), [1, 3]);
  assert.equal(dominio.lerServicos([]), null);
  assert.equal(dominio.lerServicos([1, 1]), null);
  assert.equal(dominio.lerServicos([1.5]), null);
  assert.equal(dominio.lerServicos('1'), null);
});

test('textos opcionais e obrigatórios', () => {
  assert.equal(dominio.lerTexto('  Honda   Civic ', { maximo: 80 }), 'Honda Civic');
  assert.equal(dominio.lerTexto(undefined, { maximo: 80 }), '');
  assert.equal(dominio.lerTexto('Al', { minimo: 3, maximo: 80 }), null);
  assert.equal(dominio.lerTexto(undefined, { minimo: 3, maximo: 80 }), null);
  assert.equal(dominio.lerTexto(42, { maximo: 80 }), null);
});

test('código do agendamento tem 6 caracteres sem 0, O, 1 e I', () => {
  assert.equal(dominio.codigoValido('K7M2QX'), true);
  assert.equal(dominio.codigoValido('K7M0QX'), false);
  assert.equal(dominio.codigoValido('k7m2qx'), false);
});

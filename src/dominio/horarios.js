/*
 * Horários livres de um dia para o site (RF-04): as mesmas regras que
 * criar_agendamento_site confere no banco, para o calendário só oferecer
 * horários que o pedido vai aceitar. Só regras, sem banco.
 *
 *   - dia de funcionamento, não bloqueado e dentro do limite de dias (RN-07);
 *   - começa depois da abertura e termina até o fechamento (RN-05);
 *   - respeita a antecedência mínima (RN-07);
 *   - não passa da capacidade simultânea em nenhum instante (RN-06).
 */
'use strict';

const { instanteLocal } = require('./agenda');

function paraMinutos(hora) {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

function horaDe(minutos) {
  return String(Math.floor(minutos / 60)).padStart(2, '0') + ':' + String(minutos % 60).padStart(2, '0');
}

/*
 * Mesma conta de horario_lotado no banco: a ocupação só cresce no início do
 * horário novo e nos inícios que caem dentro dele.
 * ocupados: [{ inicio: Date, fim: Date }] dos agendamentos que ocupam a agenda.
 */
function lotado(ocupados, inicio, fim, capacidade) {
  const pontos = [inicio.getTime()].concat(
    ocupados.map((o) => o.inicio.getTime()).filter((p) => p > inicio.getTime() && p < fim.getTime()),
  );
  return pontos.some(
    (ponto) => ocupados.filter((o) => o.inicio.getTime() <= ponto && o.fim.getTime() > ponto).length >= capacidade,
  );
}

/*
 * data: { ano, mes, dia }; agenda: formato de dominio/configuracoes.js
 * (agendaParaResposta); bloqueado: a data está em bloqueio_agenda.
 * Devolve os horários de início livres, como "08:00".
 */
function horariosLivres({ data, duracaoMinutos, agenda, bloqueado, ocupados, agora = new Date() }) {
  const meiaNoite = new Date(data.ano, data.mes - 1, data.dia);
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + agenda.limiteDiasFuturos);

  if (
    bloqueado ||
    !agenda.diasFuncionamento.includes(meiaNoite.getDay()) ||
    meiaNoite < hoje ||
    meiaNoite > ultimoDia ||
    !(duracaoMinutos > 0)
  ) {
    return [];
  }

  const primeiroInicio = agora.getTime() + agenda.antecedenciaMinimaHoras * 36e5;
  const fechamento = paraMinutos(agenda.horaFechamento);
  const livres = [];
  for (let m = paraMinutos(agenda.horaAbertura); m + duracaoMinutos <= fechamento; m += agenda.intervaloMinutos) {
    const inicio = instanteLocal(data, m);
    const fim = new Date(inicio.getTime() + duracaoMinutos * 60000);
    if (inicio.getTime() >= primeiroInicio && !lotado(ocupados, inicio, fim, agenda.capacidadeSimultanea)) {
      livres.push(horaDe(m));
    }
  }
  return livres;
}

module.exports = { horariosLivres, lotado };

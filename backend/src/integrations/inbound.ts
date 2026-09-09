import { randomUUID } from 'node:crypto';
import type { ChannelType } from '@prisma/client';
import { runWithContext, type RequestContext } from '../core/context';
import { prisma } from '../core/prisma';
import { logger } from '../core/logger';
import { formatBRL } from '../core/money';
import { runOrchestrator } from '../ai/orchestrator';
import { findLink, redeemPairingCode } from './channels.service';
import { salesToday } from '../modules/sales/sales.service';
import { monthRevenue, totalPayable, totalReceivable } from '../modules/finance/finance.service';

const CODE_RE = /^[A-Z0-9]{6}$/i;

const HELP = [
  'Comandos:',
  '/start <codigo> - vincular este canal a uma empresa',
  '/help - esta ajuda',
  '/status - status da conexao',
  '/resumo - panorama do dia',
  '/vendas - vendas de hoje',
  '/financeiro - a receber / a pagar / saldo do mes',
  '',
  'Ou fale naturalmente: "quanto vendi hoje?", "paguei 120 de energia".',
].join('\n');

async function runCommand(cmd: string, company: { name: string }): Promise<string | null> {
  switch (cmd) {
    case '/help':
      return HELP;
    case '/status':
      return `Conectado a *${company.name}*.`;
    case '/resumo':
    case '/vendas': {
      const s = await salesToday();
      if (cmd === '/vendas') return `Hoje: ${s.count} venda(s), ${formatBRL(s.gross)} (recebido ${formatBRL(s.received)}).`;
      const [rec, pay] = await Promise.all([totalReceivable(), totalPayable()]);
      return [
        `*${company.name}* - resumo`,
        `Vendas hoje: ${s.count} (${formatBRL(s.gross)})`,
        `A receber: ${formatBRL(rec.total)} (${formatBRL(rec.overdue)} vencidos)`,
        `A pagar: ${formatBRL(pay.total)}`,
      ].join('\n');
    }
    case '/financeiro': {
      const [cf, rec, pay] = await Promise.all([monthRevenue(), totalReceivable(), totalPayable()]);
      return [
        `Mes: entradas ${formatBRL(cf.income)} | saidas ${formatBRL(cf.expense)} | saldo ${formatBRL(cf.net)}`,
        `A receber: ${formatBRL(rec.total)}  |  A pagar: ${formatBRL(pay.total)}`,
      ].join('\n');
    }
    default:
      return null;
  }
}

/**
 * Ponto de entrada unico para mensagens de qualquer canal externo (secao 21/22).
 * Resolve o tenant pelo vinculo do canal, estabelece o contexto e delega ao Hermes.
 */
export async function handleInboundMessage(params: {
  channel: ChannelType;
  externalId: string;
  text: string;
  displayName?: string | null;
}): Promise<string> {
  const text = params.text.trim();
  const link = await findLink(params.channel, params.externalId);

  // Pareamento
  if (!link || !link.active) {
    const code = text.replace(/^\/start\s+/i, '').trim();
    if (CODE_RE.test(code)) {
      const redeemed = await redeemPairingCode({
        code,
        channel: params.channel,
        externalId: params.externalId,
        displayName: params.displayName ?? null,
      });
      if (redeemed) {
        return `Pronto! Este canal agora esta conectado a *${redeemed.companyName}*.\n\n${HELP}`;
      }
      return 'Codigo invalido ou expirado. Gere um novo em Configuracoes > Canais no painel.';
    }
    return (
      'Este canal ainda nao esta vinculado a uma empresa.\n' +
      'No painel web: Configuracoes > Canais, gere um codigo e envie aqui: /start SEUCODIGO'
    );
  }

  const company = await prisma.company.findUnique({ where: { id: link.companyId } });
  const linkedUser = link.linkedUserId
    ? await prisma.user.findUnique({ where: { id: link.linkedUserId } })
    : null;

  const ctx: RequestContext = {
    companyId: link.companyId,
    userId: link.linkedUserId ?? null,
    role: linkedUser?.role ?? 'ADMIN',
    source: params.channel.toLowerCase(),
    requestId: randomUUID(),
  };

  return runWithContext(ctx, async () => {
    try {
      if (text.startsWith('/start')) return `Ja conectado a *${company?.name}*.\n\n${HELP}`;
      if (text.startsWith('/')) {
        const out = await runCommand(text.split(/\s+/)[0]!.toLowerCase(), { name: company?.name ?? 'sua empresa' });
        if (out) return out;
      }
      const result = await runOrchestrator({
        text,
        channel: params.channel,
        externalId: params.externalId,
        companyName: company?.name ?? 'Empresa',
        segment: company?.segment,
        currency: company?.currency,
        timezone: company?.timezone,
        userName: link.displayName,
        role: ctx.role,
      });
      return result.reply;
    } catch (err) {
      logger.error({ err, channel: params.channel }, 'Falha ao processar mensagem inbound');
      return 'Tive um problema ao processar isso agora. Tente novamente em instantes.';
    }
  });
}

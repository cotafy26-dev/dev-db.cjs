import { prisma } from '../core/prisma';
import { tryGetContext } from '../core/context';
import { logger } from '../core/logger';
import { getMessagingProvider } from './messaging';

/**
 * Envia uma mensagem para o cliente pelo canal disponivel da empresa atual.
 * Ordem de tentativa: WhatsApp (se o telefone casar com um vinculo) -> Telegram.
 * Retorna true se algum provider aceitou o envio.
 */
export async function sendToLinkedChannel(params: {
  companyId?: string;
  customerPhone?: string | null;
  externalId?: string | null;
  text: string;
}): Promise<boolean> {
  const companyId = params.companyId ?? tryGetContext()?.companyId;
  if (!companyId) return false;

  const links = await prisma.channelLink.findMany({
    where: { companyId, active: true },
    orderBy: { createdAt: 'desc' },
  });

  const candidates = params.externalId
    ? links.filter((l) => l.externalId === params.externalId)
    : params.customerPhone
      ? links.filter((l) => normalize(l.externalId) === normalize(params.customerPhone!))
      : links;

  for (const link of candidates.length ? candidates : links) {
    const provider = getMessagingProvider(link.channel);
    if (!provider?.isEnabled()) continue;
    const res = await provider.sendText(link.externalId, params.text);
    if (res.ok) return true;
    logger.warn({ channel: link.channel, error: res.error }, 'Falha ao enviar mensagem outbound');
  }
  return false;
}

function normalize(v: string): string {
  return v.replace(/\D/g, '').slice(-11);
}

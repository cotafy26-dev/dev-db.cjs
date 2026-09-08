import type { ChannelType } from '@prisma/client';
import { prisma } from '../core/prisma';
import { currentCompanyId, currentUserId } from '../core/context';
import { pairingCode } from '../core/ids';
import { dayjs } from '../core/dates';
import { NotFoundError } from '../core/errors';

const PAIRING_TTL_MIN = 15;

export async function createPairingCode(channel: ChannelType) {
  const companyId = currentCompanyId();
  // invalida codigos anteriores nao usados do mesmo canal
  await prisma.pairingCode.deleteMany({ where: { companyId, channel, usedAt: null } });

  const code = pairingCode(6);
  await prisma.pairingCode.create({
    data: {
      code,
      companyId,
      channel,
      createdBy: currentUserId(),
      expiresAt: dayjs().add(PAIRING_TTL_MIN, 'minute').toDate(),
    },
  });
  return { code, expiresInMinutes: PAIRING_TTL_MIN };
}

/** Consome um codigo e cria o vinculo do canal. Usado pelos webhooks/bots (sem contexto de tenant). */
export async function redeemPairingCode(params: {
  code: string;
  channel: ChannelType;
  externalId: string;
  displayName?: string | null;
}) {
  const record = await prisma.pairingCode.findUnique({ where: { code: params.code.toUpperCase().trim() } });
  if (!record || record.usedAt || record.channel !== params.channel || record.expiresAt < new Date()) {
    return null;
  }

  const link = await prisma.channelLink.upsert({
    where: { channel_externalId: { channel: params.channel, externalId: params.externalId } },
    update: { companyId: record.companyId, active: true, displayName: params.displayName ?? undefined },
    create: {
      companyId: record.companyId,
      channel: params.channel,
      externalId: params.externalId,
      displayName: params.displayName ?? null,
      linkedUserId: record.createdBy,
    },
  });

  await prisma.pairingCode.update({ where: { code: record.code }, data: { usedAt: new Date() } });

  const company = await prisma.company.findUnique({ where: { id: record.companyId } });
  return { link, companyName: company?.name ?? 'sua empresa' };
}

export async function findLink(channel: ChannelType, externalId: string) {
  return prisma.channelLink.findUnique({
    where: { channel_externalId: { channel, externalId } },
  });
}

export async function listLinks() {
  return prisma.channelLink.findMany({
    where: { companyId: currentCompanyId() },
    orderBy: { createdAt: 'desc' },
  });
}

export async function deactivateLink(id: string) {
  const link = await prisma.channelLink.findFirst({ where: { id, companyId: currentCompanyId() } });
  if (!link) throw new NotFoundError('Vinculo de canal', id);
  await prisma.channelLink.update({ where: { id }, data: { active: false } });
}

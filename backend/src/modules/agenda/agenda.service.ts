import { prisma } from '../../core/prisma';
import { NotFoundError } from '../../core/errors';
import { currentCompanyId, currentUserId } from '../../core/context';
import { tenantWhere } from '../../core/tenant';
import { dayjs } from '../../core/dates';
import { toSkipTake, type Pagination } from '../../core/pagination';

export interface AgendaEventInput {
  title: string;
  startsAt: Date;
  endsAt?: Date | null;
  description?: string | null;
  location?: string | null;
  customerId?: string | null;
  remindAt?: Date | null;
}

export async function createEvent(input: AgendaEventInput) {
  return prisma.agendaEvent.create({
    data: {
      companyId: currentCompanyId(),
      title: input.title,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      description: input.description ?? null,
      location: input.location ?? null,
      customerId: input.customerId ?? null,
      remindAt: input.remindAt ?? null,
      createdBy: currentUserId(),
    },
  });
}

export async function listEvents(
  p: Pagination & { from?: Date; to?: Date; status?: string },
) {
  const where = tenantWhere({
    ...(p.status ? { status: p.status as never } : {}),
    ...(p.from || p.to
      ? { startsAt: { ...(p.from ? { gte: p.from } : {}), ...(p.to ? { lt: p.to } : {}) } }
      : {}),
  });
  const [items, total] = await Promise.all([
    prisma.agendaEvent.findMany({
      where,
      orderBy: { startsAt: 'asc' },
      include: { customer: { select: { id: true, name: true } } },
      ...toSkipTake(p),
    }),
    prisma.agendaEvent.count({ where }),
  ]);
  return { items, total };
}

export async function upcomingEvents(days = 7) {
  return prisma.agendaEvent.findMany({
    where: tenantWhere({
      status: 'SCHEDULED',
      startsAt: { gte: new Date(), lte: dayjs().add(days, 'day').toDate() },
    }),
    orderBy: { startsAt: 'asc' },
    include: { customer: { select: { name: true } } },
  });
}

export async function updateEvent(id: string, input: Partial<AgendaEventInput> & { status?: string }) {
  const found = await prisma.agendaEvent.findFirst({ where: tenantWhere({ id }) });
  if (!found) throw new NotFoundError('Evento', id);
  return prisma.agendaEvent.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
      ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.location !== undefined ? { location: input.location } : {}),
      ...(input.status !== undefined ? { status: input.status as never } : {}),
    },
  });
}

export async function deleteEvent(id: string) {
  const found = await prisma.agendaEvent.findFirst({ where: tenantWhere({ id }) });
  if (!found) throw new NotFoundError('Evento', id);
  await prisma.agendaEvent.delete({ where: { id } });
}

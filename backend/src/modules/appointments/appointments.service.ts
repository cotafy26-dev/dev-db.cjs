import { Prisma } from '@prisma/client';
import { prisma } from '../../core/prisma';
import { NotFoundError } from '../../core/errors';
import { currentCompanyId, currentUserId } from '../../core/context';
import { scope } from '../../core/tenant';
import { dayjs, dayRange, DEFAULT_TZ } from '../../core/dates';
import { audit } from '../../core/audit';
import { toSkipTake, type Pagination } from '../../core/pagination';

export interface AppointmentInput {
  title: string;
  startsAt: Date;
  endsAt?: Date | null;
  description?: string | null;
  location?: string | null;
  customerId?: string | null;
  remindAt?: Date | null;
}

export async function createAppointment(input: AppointmentInput) {
  const appt = await prisma.appointment.create({
    data: {
      companyId: currentCompanyId(),
      title: input.title,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      description: input.description ?? null,
      location: input.location ?? null,
      customerId: input.customerId ?? null,
      remindAt: input.remindAt ?? null,
      createdById: currentUserId(),
    },
    include: { customer: { select: { id: true, name: true } } },
  });
  await audit({ action: 'appointment.create', entityType: 'Appointment', entityId: appt.id, summary: appt.title });
  return appt;
}

export async function listAppointments(p: Pagination & { from?: Date; to?: Date; status?: string }) {
  const where: Prisma.AppointmentWhereInput = {
    ...scope(),
    ...(p.status ? { status: p.status as never } : {}),
    ...(p.from || p.to ? { startsAt: { ...(p.from ? { gte: p.from } : {}), ...(p.to ? { lt: p.to } : {}) } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.appointment.findMany({
      where,
      orderBy: { startsAt: 'asc' },
      include: { customer: { select: { id: true, name: true } } },
      ...toSkipTake(p),
    }),
    prisma.appointment.count({ where }),
  ]);
  return { items, total };
}

export async function todayAppointments(tz = DEFAULT_TZ) {
  const { from, to } = dayRange(new Date(), tz);
  return prisma.appointment.findMany({
    where: { ...scope(), status: 'SCHEDULED', startsAt: { gte: from, lt: to } },
    orderBy: { startsAt: 'asc' },
    include: { customer: { select: { name: true } } },
  });
}

export async function upcomingAppointments(days = 7) {
  return prisma.appointment.findMany({
    where: {
      ...scope(),
      status: 'SCHEDULED',
      startsAt: { gte: new Date(), lte: dayjs().add(days, 'day').toDate() },
    },
    orderBy: { startsAt: 'asc' },
    include: { customer: { select: { name: true } } },
  });
}

export async function updateAppointment(
  id: string,
  input: Partial<AppointmentInput> & { status?: string },
) {
  const found = await prisma.appointment.findFirst({ where: { ...scope(), id } });
  if (!found) throw new NotFoundError('Compromisso', id);
  const appt = await prisma.appointment.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
      ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.location !== undefined ? { location: input.location } : {}),
      ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
      ...(input.remindAt !== undefined ? { remindAt: input.remindAt } : {}),
      ...(input.status !== undefined ? { status: input.status as never } : {}),
    },
  });
  await audit({ action: 'appointment.update', entityType: 'Appointment', entityId: id, after: input });
  return appt;
}

export async function cancelAppointment(id: string) {
  const found = await prisma.appointment.findFirst({ where: { ...scope(), id } });
  if (!found) throw new NotFoundError('Compromisso', id);
  await prisma.appointment.update({ where: { id }, data: { status: 'CANCELED' } });
  await audit({ action: 'appointment.cancel', entityType: 'Appointment', entityId: id });
  return { id, status: 'CANCELED' as const };
}

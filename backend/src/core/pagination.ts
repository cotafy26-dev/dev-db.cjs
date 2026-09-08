import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(120).optional(),
});

export type Pagination = z.infer<typeof paginationSchema>;

export function toSkipTake(p: Pick<Pagination, 'page' | 'pageSize'>): { skip: number; take: number } {
  return { skip: (p.page - 1) * p.pageSize, take: p.pageSize };
}

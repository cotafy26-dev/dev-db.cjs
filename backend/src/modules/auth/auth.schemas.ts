import { z } from 'zod';

export const registerSchema = z.object({
  company: z.object({
    name: z.string().min(2).max(120),
    document: z.string().max(20).optional(),
    phone: z.string().max(20).optional(),
  }),
  user: z.object({
    name: z.string().min(2).max(120),
    email: z.string().email().max(160).toLowerCase(),
    password: z.string().min(8).max(72),
  }),
});

export const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1).max(72),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;

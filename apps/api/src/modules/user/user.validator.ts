import { Role } from '@prisma/client';
import { z } from 'zod';

const userIdParamsSchema = z.object({
  id: z.string().uuid('Invalid user id'),
}).strict();

const profileUpdateBodySchema = z.object({
  firstName: z.string().min(2).max(50).optional(),
  lastName: z.string().min(2).max(50).optional(),
  avatar: z.string().url().nullable().optional(),
}).strict().refine(
  (data) => Object.values(data).some((value) => value !== undefined),
  'At least one profile field is required',
);

export const createUserSchema = z.object({
  body: z.object({
    firstName: z
      .string()
      .min(2, 'First name must be at least 2 characters')
      .max(50),
    lastName: z
      .string()
      .min(2, 'Last name must be at least 2 characters')
      .max(50),
    email: z.string().email('Invalid email format').toLowerCase(),
    role: z.nativeEnum(Role).optional().default(Role.EMPLOYEE),
    password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  }),
});

export const updateOwnProfileSchema = z.object({
  body: profileUpdateBodySchema,
});

export const updateUserSchema = z.object({
  params: userIdParamsSchema,
  body: profileUpdateBodySchema,
});

export const updateUserRoleSchema = z.object({
  params: userIdParamsSchema,
  body: z.object({
    role: z.nativeEnum(Role),
  }).strict(),
});

export const updateUserStatusSchema = z.object({
  params: userIdParamsSchema,
  body: z.object({
    isActive: z.boolean(),
  }).strict(),
});

export const getUserSchema = z.object({
  params: userIdParamsSchema,
});

export const deleteUserSchema = z.object({
  params: userIdParamsSchema,
});

export const listUsersSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().optional(),
    role: z.nativeEnum(Role).optional(),
  }),
});

export type ListUsersRequest = z.infer<typeof listUsersSchema>;
export type UpdateOwnProfileRequest = z.infer<typeof updateOwnProfileSchema>;
export type UpdateUserRequest = z.infer<typeof updateUserSchema>;
export type UpdateUserRoleRequest = z.infer<typeof updateUserRoleSchema>;
export type UpdateUserStatusRequest = z.infer<typeof updateUserStatusSchema>;
export type DeleteUserRequest = z.infer<typeof deleteUserSchema>;

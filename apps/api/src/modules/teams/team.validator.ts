import { z } from 'zod';

import { TeamRole } from '@prisma/client';



export const createTeamSchema = z.object({

  body: z.object({


    name: z
      .string()
      .min(2, 'Name must be at least 2 characters')
      .max(100),


    description:
      z.string()
      .max(500)
      .optional()
      .nullable(),


    color:
      z.string()
      .regex(
        /^#[0-9A-Fa-f]{6}$/,
        'Must be a valid hex color'
      )
      .optional(),


    icon:
      z.string()
      .optional(),

  }),

});







export const updateTeamSchema = z.object({

  params: z.object({

    id: z
      .string()
      .uuid('Invalid team id'),

  }),



  body: z.object({


    name:
      z.string()
      .min(2)
      .max(100)
      .optional(),



    description:
      z.string()
      .max(500)
      .optional()
      .nullable(),



    color:
      z.string()
      .regex(
        /^#[0-9A-Fa-f]{6}$/
      )
      .optional()
      .nullable(),



    icon:
      z.string()
      .optional()
      .nullable(),


  }),

});







export const getTeamSchema = z.object({

  params: z.object({

    id: z
      .string()
      .uuid('Invalid team id'),

  }),

});







export const deleteTeamSchema = z.object({

  params: z.object({

    id: z
      .string()
      .uuid('Invalid team id'),

  }),

});







export const listTeamsSchema = z.object({

  query: z.object({


    page:
      z.coerce
      .number()
      .int()
      .positive()
      .default(1),



    limit:
      z.coerce
      .number()
      .int()
      .positive()
      .max(100)
      .default(20),



    search:
      z.string()
      .optional(),



    ownerId:
      z.string()
      .uuid()
      .optional(),



    sortBy:
      z.enum([
        'name',
        'createdAt',
        'updatedAt',
      ])
      .optional(),



    sortOrder:
      z.enum([
        'asc',
        'desc',
      ])
      .optional(),


  }),

});







export type ListTeamsRequest = z.infer<typeof listTeamsSchema>;

export const inviteMemberSchema = z.object({

  params: z.object({

    id: z
      .string()
      .uuid('Invalid team id'),

  }),



  body: z.object({

    email:
      z.string()
      .email('Invalid email address'),

  }),

});







export const updateMembershipSchema = z.object({

  params: z.object({

    id: z
      .string()
      .uuid('Invalid team id'),


    userId: z
      .string()
      .uuid('Invalid user id'),

  }),



  body: z.object({

    role:
      z.nativeEnum(TeamRole),

  }),

});

/*
 * FEATURE (ledger #1 — invitation accept lifecycle): the two PUBLIC
 * token-carrying routes. The token is an HMAC-signed credential (see
 * core/utils/inviteToken.ts), validated structurally here and
 * cryptographically in the service. The accept body fields are optional
 * at the door because they are ONLY required when the invited email has
 * no account yet (existing users accept password-lessly) — the service
 * enforces them when it knows which case applies.
 */
export const inspectInvitationSchema = z.object({
  params: z.object({
    token: z.string().min(10, 'Invalid invitation token').max(500),
  }).strict(),
});

export const acceptInvitationSchema = z.object({
  params: z.object({
    token: z.string().min(10, 'Invalid invitation token').max(500),
  }).strict(),
  body: z.object({
    firstName: z.string().trim().min(1, 'First name is required').max(50).optional(),
    lastName: z.string().trim().min(1, 'Last name is required').max(50).optional(),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(72, 'Password cannot exceed 72 characters')
      .optional(),
  }).strict(),
});

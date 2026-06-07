export const PERMISSIONS = {
  USER: {
    READ: 'user:read',
    CREATE: 'user:create',
    UPDATE: 'user:update',
    DELETE: 'user:delete',
  },

  PROJECT: {
    READ: 'project:read',
    CREATE: 'project:create',
    UPDATE: 'project:update',
    DELETE: 'project:delete',
  },

  TASK: {
    READ: 'task:read',
    CREATE: 'task:create',
    UPDATE: 'task:update',
    DELETE: 'task:delete',
    ASSIGN: 'task:assign',
    ARCHIVE: 'task:archive',
  },

  TEAM: {
    READ: 'team:read',
    MANAGE: 'team:manage',
  },

  CRM: {
    READ: 'crm:read',
    WRITE: 'crm:write',
    MANAGE_PIPELINE: 'crm:manage_pipeline',
  },

  DOCUMENT: {
    READ: 'document:read',
    CREATE: 'document:create',
    UPDATE: 'document:update',
    DELETE: 'document:delete',
  },

  ANALYTICS: {
    VIEW: 'analytics:view',
  },

  BILLING: {
    MANAGE: 'billing:manage',
  },

  AI: {
    USE: 'ai:use',
  },

  SYSTEM: {
    ADMIN: 'system:admin',
  },
} as const;

export type Permission =
  | 'user:read' | 'user:create' | 'user:update' | 'user:delete'
  | 'project:read' | 'project:create' | 'project:update' | 'project:delete'
  | 'task:read' | 'task:create' | 'task:update' | 'task:delete' | 'task:assign' | 'task:archive'
  | 'team:read' | 'team:manage'
  | 'crm:read' | 'crm:write' | 'crm:manage_pipeline'
  | 'document:read' | 'document:create' | 'document:update' | 'document:delete'
  | 'analytics:view'
  | 'billing:manage'
  | 'ai:use'
  | 'system:admin';

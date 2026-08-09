/*
 * RAG EVALUATION DATASET (ledger #18 — 2026-08-09)
 * Version-controlled, DETERMINISTIC synthetic fixture: invented fictional
 * TeamSynch workspace documentation only — no production data, secrets,
 * credentials, or personal information.
 *   - EVAL_CORPUS: synthetic retrieval corpus; stable synthetic chunk ids
 *     are the ground-truth keys the metrics score against.
 *   - EVAL_CASES: hand-labeled queries -> expected relevant chunk ids,
 *     including two multi-relevant cases and one deliberately HARD case
 *     whose expected chunk shares no vocabulary with the query (a lexical
 *     baseline is expected to miss it — an honest discriminator, not a
 *     self-fulfilling perfect score).
 */

/** One synthetic corpus chunk that a retriever may return. */
export interface CorpusChunk {
  id: string; // stable synthetic id (the ground-truth key used in cases)
  content: string; // fictional workspace content
  category: string; // domain category, e.g. 'tasks' | 'billing'
}

/** One labeled evaluation case: query -> expected relevant chunks. */
export interface EvaluationCase {
  id: string; // stable case id (reported in per-case results)
  category: string;
  query: string;
  expectedRelevantChunkIds: string[]; // >= 1 (dataset integrity is validated)
  notes?: string;
}

export const EVAL_CORPUS: readonly CorpusChunk[] = [
  {
    id: 'chunk:projects-archive',
    category: 'projects',
    content:
      'Archiving a project removes it from the active project list but preserves its tasks, documents, and audit history so it can be restored later.',
  },
  {
    id: 'chunk:tasks-priority',
    category: 'tasks',
    content:
      'Task priority levels are Low, Medium, High, and Urgent. The task board sorts work by priority first and by due date second.',
  },
  {
    id: 'chunk:tasks-dependencies',
    category: 'tasks',
    content:
      'Tasks can declare dependencies on other tasks. A blocked task cannot start until its dependencies are closed, and the board surfaces dependency warnings.',
  },
  {
    id: 'chunk:teams-roles',
    category: 'teams',
    content:
      'Organization roles are Super Admin, Admin, Manager, and Employee. Permissions are enforced by granular capability checks on every API endpoint.',
  },
  {
    id: 'chunk:teams-invitations',
    category: 'teams',
    content:
      'Team invitations are sent by email and expire after seven days. Only members with the TEAM.MANAGE permission can send or revoke invitations.',
  },
  {
    id: 'chunk:documents-upload',
    category: 'documents',
    content:
      'Documents are uploaded to the organization workspace. Text is extracted from PDF, DOCX, PPTX, and XLSX files, and each version is stored immutably.',
  },
  {
    id: 'chunk:documents-ai-search',
    category: 'documents',
    content:
      'The AI Search feature embeds document chunks with an embedding model and stores the vectors for semantic retrieval. Superseded chunks are removed on new versions.',
  },
  {
    id: 'chunk:billing-plans',
    category: 'billing',
    content:
      'Billing plans are Starter, Pro, and Business. Starter includes one workspace and five gigabytes of storage, while Business adds unlimited workspaces.',
  },
  {
    id: 'chunk:security-auth',
    category: 'security',
    content:
      'Authentication uses short-lived JWT access tokens and rotating refresh tokens stored in secure HTTP-only cookies. Refresh tokens are revoked on password change.',
  },
  {
    id: 'chunk:realtime-presence',
    category: 'realtime',
    content:
      'The presence indicator shows which team members are online. Presence is derived from active WebSocket sessions and never from page-view activity.',
  },
];

export const EVAL_CASES: readonly EvaluationCase[] = [
  {
    id: 'case:task-priority',
    category: 'tasks',
    query: 'How do I change a task priority level?',
    expectedRelevantChunkIds: ['chunk:tasks-priority'],
  },
  {
    id: 'case:team-invitations',
    category: 'teams',
    query: 'How do I send a team invitation and when does it expire?',
    expectedRelevantChunkIds: ['chunk:teams-invitations'],
  },
  {
    id: 'case:project-archive',
    category: 'projects',
    query: 'What happens when I archive a project?',
    expectedRelevantChunkIds: ['chunk:projects-archive'],
  },
  {
    id: 'case:billing-plans',
    category: 'billing',
    query: 'Which billing plan includes unlimited workspaces?',
    expectedRelevantChunkIds: ['chunk:billing-plans'],
  },
  {
    id: 'case:refresh-tokens',
    category: 'security',
    query: 'How do refresh tokens work?',
    expectedRelevantChunkIds: ['chunk:security-auth'],
  },
  {
    id: 'case:document-formats',
    category: 'documents',
    query: 'Which document formats can I upload?',
    expectedRelevantChunkIds: ['chunk:documents-upload'],
  },
  {
    id: 'case:ai-search-indexing',
    category: 'documents',
    query: 'How does AI search index my documents?',
    expectedRelevantChunkIds: ['chunk:documents-ai-search'],
  },
  {
    id: 'case:roles-and-invitations',
    category: 'teams',
    query: 'Which roles exist and who can manage team invitations?',
    expectedRelevantChunkIds: ['chunk:teams-roles', 'chunk:teams-invitations'],
  },
  {
    id: 'case:priority-and-dependencies',
    category: 'tasks',
    query: 'How do task priority levels and task dependencies work?',
    expectedRelevantChunkIds: ['chunk:tasks-priority', 'chunk:tasks-dependencies'],
  },
  {
    id: 'case:presence-wording-gap',
    category: 'realtime',
    query: 'Where do I see who is working on what right now?',
    expectedRelevantChunkIds: ['chunk:realtime-presence'],
    notes:
      'Hard case: the expected chunk never mentions "working"; a lexical baseline is expected to miss it.',
  },
];

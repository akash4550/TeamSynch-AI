import { Role } from '@prisma/client';

export type SearchModule =
  | 'projects'
  | 'tasks'
  | 'crm'
  | 'documents';

export interface SearchQuery {
  organizationId: string;
  userId: string;
  role: Role;
  term: string;
  modules?: SearchModule[];
  limit: number;
  offset: number;
}

export interface SearchResultItem {
  id: string;
  module: SearchModule;
  title: string;
  description?: string;
  url: string;
  score: number;
  metadata?: unknown;
}

export interface SearchResult {
  total: number;
  items: SearchResultItem[];
}

export interface SearchProvider {
  readonly name: string;

  search(query: SearchQuery): Promise<SearchResult>;
}

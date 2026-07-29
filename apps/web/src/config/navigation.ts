import { 
  LayoutDashboard, 
  Building2, 
  Users, 
  Settings, 
  FolderKanban, 
  CheckSquare, 
  UsersRound, 
  Calendar, 
  FileText, 
  LineChart, 
  Activity,
  Sparkles,
  ShieldCheck
} from 'lucide-react';

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE';

export interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
  roles?: Role[];
  disabled?: boolean;
}

export const navigationConfig: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/projects', label: 'Projects', icon: FolderKanban, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE'] },
  { path: '/tasks', label: 'Tasks', icon: CheckSquare, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE'] },
  { path: '/teams', label: 'Teams', icon: Users, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE'] },
  { path: '/crm', label: 'CRM', icon: UsersRound, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE'] },
  { path: '/calendar', label: 'Calendar', icon: Calendar, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE'] },
  { path: '/documents', label: 'Documents', icon: FileText, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE'] },
  { path: '/ai-chat', label: 'AI RAG Chat', icon: Sparkles, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE'] },
  { path: '/analytics', label: 'Analytics', icon: LineChart, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE'] },
  { path: '/organization', label: 'Organization', icon: Building2, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] },
  { path: '/users', label: 'Users', icon: Users, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] },
  { path: '/audit', label: 'Audit Trail', icon: ShieldCheck, roles: ['SUPER_ADMIN', 'ADMIN'] },
  { path: '/settings', label: 'Settings', icon: Settings, roles: ['SUPER_ADMIN', 'ADMIN'] },
  { path: '/system/jobs', label: 'Background Jobs', icon: Activity, roles: ['SUPER_ADMIN'] },
];

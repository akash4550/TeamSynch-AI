import { Users } from 'lucide-react';
import { Card, CardBody } from '../../../components/ui/Card';

/*
 * UI PASS (#UI-team-card, 2026-08-08): two disclosures, zero data/render
 * copy changes:
 *  1. DEAD CONTROL REMOVED — the MoreVertical button had NO click handler
 *     (clicking it swallowed the event via the card and did nothing — a
 *     control that lies about being operable). It offered no menu; the
 *     card itself is the action. Removed outright.
 *  2. The whole card is the click target (navigates to the team), so it is
 *     now keyboard-operable too (role="button" + tabIndex + Enter/Space →
 *     the SAME onClick — additive; mouse behaviour unchanged), with a
 *     focus ring.
 */

interface TeamCardProps {
  team: any;
  onClick: (id: string) => void;
}

export const TeamCard = ({ team, onClick }: TeamCardProps) => {
  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      role="button"
      tabIndex={0}
      aria-label={team.name}
      onClick={() => onClick(team.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(team.id);
        }
      }}
    >
      <CardBody className="p-6">
        <div className="mb-4 flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded font-bold text-white shadow-sm"
            style={{ backgroundColor: team.color || '#3b82f6' }}
          >
            {team.name.substring(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h3 className="max-w-[150px] truncate font-semibold text-gray-900 dark:text-white">
              {team.name}
            </h3>
            <p className="mt-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <Users className="h-3 w-3" />
              {team._count?.memberships || 0} members
            </p>
          </div>
        </div>
        <p className="mb-4 h-10 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
          {team.description || 'No description provided for this team.'}
        </p>
        <div className="flex items-center justify-between border-t border-gray-100 pt-4 text-xs text-gray-500 dark:border-slate-700 dark:text-gray-400">
          <span>Owner: {team.owner?.firstName || 'Unknown'}</span>
          <span className="tabular-nums">Created: {new Date(team.createdAt).toLocaleDateString()}</span>
        </div>
      </CardBody>
    </Card>
  );
};

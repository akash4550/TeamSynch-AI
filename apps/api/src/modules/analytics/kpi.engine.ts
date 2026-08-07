import { KPIFunction, MetricFilterDto, MetricResult } from './analytics.types';
import { AnalyticsRepository } from './analytics.repository';

/*
 * FEATURE (ledger #4, 2026-08-05 — metric semantics): PipelineStage has no
 * won/lost flag (free-text per-org `name` + `probability` only), so closed
 * stages are identified by NAME CONVENTION: a stage whose name contains
 * 'WON' is won, 'LOST' is lost ('Closed Won' / 'Closed Lost' satisfy it).
 * This extends — and documents once centrally — the unwritten heuristic
 * WIN_RATE relied on before; orgs with custom stage names keep every
 * closed-deal metric honest by naming their terminal stages accordingly.
 */
const isWonStage = (stageName: string | undefined): boolean =>
  (stageName ?? '').toUpperCase().includes('WON');
const isLostStage = (stageName: string | undefined): boolean =>
  (stageName ?? '').toUpperCase().includes('LOST');

export class KPIEngine {
  private metrics: Map<string, KPIFunction> = new Map();
  private repository: AnalyticsRepository;

  constructor(repository: AnalyticsRepository) {
    this.repository = repository;
    this.registerCoreMetrics();
  }

  /**
   * Registers a new metric calculation function.
   * This design allows external modules or future AI plugins to register their own KPIs.
   */
  registerMetric(name: string, fn: KPIFunction) {
    this.metrics.set(name, fn);
  }

  /**
   * Executes a registered metric function.
   */
  async calculateMetric(name: string, organizationId: string, filters: MetricFilterDto): Promise<MetricResult> {
    const fn = this.metrics.get(name);
    if (!fn) throw new Error(`Metric ${name} not found in KPI Engine`);
    return fn(organizationId, filters);
  }

  private registerCoreMetrics() {
    // --- ORGANIZATION ---
    this.registerMetric('ACTIVE_USERS', async (orgId, filters) => ({
      name: 'Active Users',
      type: 'scalar',
      value: await this.repository.getActiveUsers(orgId, filters),
      description: 'Number of currently active users',
    }));
    
    this.registerMetric('NEW_USERS', async (orgId, filters) => ({
      name: 'New Users',
      type: 'scalar',
      value: await this.repository.getNewUsers(orgId, filters),
      description: 'Users created in the time period',
    }));

    // --- PROJECTS ---
    this.registerMetric('PROJECTS_CREATED', async (orgId, filters) => ({
      name: 'Projects Created',
      type: 'scalar',
      value: await this.repository.getProjectsCreated(orgId, filters),
    }));

    this.registerMetric('ACTIVE_PROJECTS', async (orgId, filters) => ({
      name: 'Active Projects',
      type: 'scalar',
      value: await this.repository.getActiveProjects(orgId, filters),
    }));

    // --- TASKS ---
    this.registerMetric('TASKS_CREATED', async (orgId, filters) => ({
      name: 'Tasks Created',
      type: 'scalar',
      value: await this.repository.getTasksCreated(orgId, filters),
    }));

    // FEATURE (ledger #4): period window matches COMPLETION date (see
    // AnalyticsRepository.getTasksCompleted) — the metric is honest
    // throughput, not a creation-cohort snapshot. The `name` string is a
    // web dashboard lookup key (getMetricValue finds cards by it) and
    // must never change.
    this.registerMetric('TASKS_COMPLETED', async (orgId, filters) => ({
      name: 'Tasks Completed',
      type: 'scalar',
      value: await this.repository.getTasksCompleted(orgId, filters),
      description:
        'Tasks completed in the selected period (matched on completion date); with no period set, all currently-done tasks',
    }));

    this.registerMetric('OVERDUE_TASKS', async (orgId, filters) => ({
      name: 'Overdue Tasks',
      type: 'scalar',
      value: await this.repository.getOverdueTasks(orgId, filters),
    }));

    /*
     * FEATURE (ledger #4): completed (completion-date window) ÷ created
     * (creation-date window) — a throughput-vs-intake ratio. It MAY
     * legitimately exceed 100% while the team burns through its backlog
     * faster than new work arrives; the old cohort reading silently
     * capped at 100% by construction. The description states the
     * definition so the dashboard can never over-promise.
     */
    this.registerMetric('TASK_COMPLETION_RATE', async (orgId, filters) => {
      const completed = await this.repository.getTasksCompleted(orgId, filters);
      const total = await this.repository.getTasksCreated(orgId, filters);
      const rate = total > 0 ? (completed / total) * 100 : 0;
      return {
        name: 'Task Completion Rate',
        type: 'scalar',
        value: Math.round(rate),
        unit: '%',
        description:
          'Tasks completed in the period ÷ tasks created in the period; can exceed 100% when the backlog is burned down faster than new work arrives',
      };
    });

    this.registerMetric('TASK_STATUS_DISTRIBUTION', async (orgId, filters) => ({
      name: 'Task Statuses',
      type: 'distribution',
      value: await this.repository.getTaskStatusDistribution(orgId, filters),
    }));

    // --- CRM ---
    this.registerMetric('LEADS_CREATED', async (orgId, filters) => ({
      name: 'Leads Created',
      type: 'scalar',
      value: await this.repository.getLeadsCreated(orgId, filters),
    }));

    /*
     * FEATURE (ledger #4, product call: open-pipeline-only): pipeline =
     * deals still in play. The sum used to include already-won and lost
     * opportunities, overstating the value of work still open. Won/lost
     * stages are excluded via the name convention at the top of this file.
     */
    this.registerMetric('PIPELINE_VALUE', async (orgId, filters) => {
      const opps = await this.repository.getOpportunities(orgId, filters);
      const value = opps.reduce((sum, opp) => {
        if (isWonStage(opp.stage?.name) || isLostStage(opp.stage?.name)) {
          return sum;
        }
        const revenue = opp.expectedRevenue?.toNumber() || 0;
        return sum + revenue;
      }, 0);
      return {
        name: 'Pipeline Value',
        type: 'scalar',
        value,
        unit: '$',
        description:
          'Expected revenue of open opportunities (won and lost deals excluded)',
      };
    });

    /*
     * FEATURE (ledger #4, product call: decided-deals-only): the industry
     * win rate is won ÷ (won + lost); the old won ÷ ALL opportunities let
     * unrelated open pipeline deflate it (and read 0% in orgs with no
     * won stage at all). With no decided deals yet the metric returns 0
     * and SAYS SO in the description rather than implying a real 0% hit
     * rate.
     */
    this.registerMetric('WIN_RATE', async (orgId, filters) => {
      const opps = await this.repository.getOpportunities(orgId, filters);
      const won = opps.filter((o) => isWonStage(o.stage?.name)).length;
      const lost = opps.filter((o) => isLostStage(o.stage?.name)).length;
      const decided = won + lost;
      return {
        name: 'Win Rate',
        type: 'scalar',
        value: decided > 0 ? Math.round((won / decided) * 100) : 0,
        unit: '%',
        description:
          decided > 0
            ? 'Won deals ÷ decided deals (won + lost); open pipeline excluded'
            : 'No decided deals yet — win rate counts only won and lost opportunities',
      };
    });

    // --- DOCUMENTS ---
    this.registerMetric('DOCUMENTS_UPLOADED', async (orgId, filters) => ({
      name: 'Documents Uploaded',
      type: 'scalar',
      value: await this.repository.getDocumentsUploaded(orgId, filters),
    }));

    this.registerMetric('STORAGE_USAGE', async (orgId, filters) => ({
      name: 'Storage Usage',
      type: 'scalar',
      value: await this.repository.getStorageUsage(orgId, filters),
      unit: 'Bytes',
    }));
  }
}

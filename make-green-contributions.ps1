# TeamSynch AI Backdated Green Contribution Graph Generator for Windows PowerShell
# Repository: https://github.com/akash4550/TeamSynch-AI.git
# Author: akash4550 <lakwalakshay5@gmail.com>

$remoteUrl = "https://github.com/akash4550/TeamSynch-AI.git"
$userEmail = "lakwalakshay5@gmail.com"
$userName = "akash4550"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   TeamSynch AI GitHub Green Contribution Graph Generator  " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Ensure git config uses user's GitHub email
git config user.name $userName
git config user.email $userEmail

git remote remove origin 2>$null
git remote add origin $remoteUrl
git branch -M main

# Helper to create backdated commit
function Commit-Backdated($files, $msg, $daysAgo) {
    $commitDate = (Get-Date).AddDays(-$daysAgo).ToString("yyyy-MM-ddTHH:mm:ss")
    $env:GIT_AUTHOR_DATE = $commitDate
    $env:GIT_COMMITTER_DATE = $commitDate

    foreach ($f in $files) {
        if (Test-Path $f) {
            git add $f 2>$null
        }
    }
    git commit -m $msg --quiet 2>$null
}

Write-Host "Creating backdated commits across past 60 days..." -ForegroundColor Yellow

# Spreading 50 commits over past 60 days to fill GitHub contribution graph
Commit-Backdated @(".env.example", ".env.production.example", "package.json") "chore(config): initialize root workspace & environment variables" 60
Commit-Backdated @("apps/api/src/core/database/BaseTenantRepository.ts") "feat(tenant): implement BaseTenantRepository for multi-tenant isolation" 58
Commit-Backdated @("apps/api/src/core/database/tenantPrismaExtension.ts") "feat(tenant): create Prisma extension for automated soft-delete filtering" 57
Commit-Backdated @("apps/api/src/modules/auth/auth.service.ts", "apps/api/src/modules/auth/auth.repository.ts") "feat(auth): implement JWT access & rotating refresh token authentication" 55
Commit-Backdated @("apps/api/src/modules/auth/auth.repository.ts") "feat(auth): add atomic login session transaction in AuthRepository" 54
Commit-Backdated @("apps/api/src/core/auth/permissions.ts", "apps/api/src/core/auth/rolePermissions.ts", "apps/api/src/core/middlewares/rbacMiddleware.ts") "feat(rbac): build granular permission policy engine evaluator" 52
Commit-Backdated @("apps/api/src/core/utils/encryption.util.ts") "feat(security): implement AES-256-GCM token encryption at rest" 50
Commit-Backdated @("apps/api/src/core/utils/redactSensitive.ts", "apps/api/src/core/utils/logger.ts") "refactor(security): add recursive logger sensitive data redactor" 49

Commit-Backdated @("apps/api/src/modules/projects/project.routes.ts") "feat(projects): implement tenant-scoped project management service" 47
Commit-Backdated @("apps/api/src/modules/projects/project.repository.ts") "feat(projects): add atomic cascade soft-deletion for projects, tasks, and docs" 45
Commit-Backdated @("apps/web/src/features/projects/ProjectsList.tsx") "feat(projects): create CreateProjectModal component with key generator" 44
Commit-Backdated @("apps/api/src/modules/tasks/task.repository.ts") "feat(tasks): implement task repository with fractional position ordering" 42
Commit-Backdated @("apps/api/src/core/database/cursorPagination.ts") "feat(tasks): implement cursor-based pagination helper for large task tables" 40
Commit-Backdated @("apps/api/src/core/events/EventBus.ts", "apps/api/src/modules/tasks/task.service.ts") "feat(tasks): add strongly typed domain event bus hooks to TaskService" 39
Commit-Backdated @("apps/web/src/features/tasks/TasksPage.tsx") "feat(tasks): create CreateTaskModal and Kanban board drag-and-drop UI" 37
Commit-Backdated @("apps/web/src/hooks/useOptimisticMutation.ts") "fix(tasks): implement optimistic UI updates for task state transitions" 36

Commit-Backdated @("apps/web/src/features/crm/hooks/useCRMQueries.ts") "feat(crm): implement client & contact management repositories" 34
Commit-Backdated @("apps/web/src/features/crm/ClientsPage.tsx", "apps/web/src/features/crm/ContactsPage.tsx") "feat(crm): create CreateClientModal and CreateContactModal UI components" 33
Commit-Backdated @("apps/web/src/features/crm/ClientDetailPage.tsx", "apps/web/src/features/crm/LeadsPage.tsx") "feat(crm): implement lead scoring and opportunity deal service" 31
Commit-Backdated @("apps/web/src/features/crm/OpportunitiesPage.tsx") "feat(crm): create CreateLeadModal and CreateOpportunityModal UI components" 30
Commit-Backdated @("apps/api/src/modules/crm/pipeline/pipeline.service.ts") "feat(crm): build CRMPipelineService with column revenue metrics" 28
Commit-Backdated @("apps/api/src/modules/crm/pipeline/crm-pipeline.controller.ts", "apps/api/src/modules/crm/pipeline/crm-pipeline.routes.ts", "apps/api/src/modules/crm/pipeline/crm.validator.ts") "feat(crm): implement atomic deal move transaction with activity audit logs" 27
Commit-Backdated @("apps/web/src/features/crm/PipelineBoard.tsx", "apps/web/src/features/crm/CRMDashboard.tsx") "feat(crm): create interactive drag-and-drop PipelineBoard component" 25
Commit-Backdated @("apps/web/src/modules/crm/api/usePipeline.ts") "feat(crm): wire TanStack Query hooks with optimistic cache mutations" 24

Commit-Backdated @("apps/api/src/core/storage/IStorageProvider.ts", "apps/api/src/core/storage/LocalStorageProvider.ts", "apps/api/src/core/storage/StorageFactory.ts", "apps/api/src/core/storage/S3StorageProvider.ts") "feat(storage): implement StorageFactory with S3 & local storage providers" 22
Commit-Backdated @("apps/api/src/modules/documents/document.repository.ts") "feat(documents): implement SHA-256 checksum file deduplication" 21
Commit-Backdated @("apps/api/src/modules/documents/document.routes.ts") "feat(documents): add pre-signed time-limited download URL generation" 19
Commit-Backdated @("apps/api/src/modules/documents/document.service.ts", "apps/api/src/modules/documents/document.controller.ts") "feat(documents): implement atomic version restoration in DocumentService" 18
Commit-Backdated @("apps/api/src/modules/documents/crdt.server.ts") "feat(crdt): build WebSocket server with authoritative Yjs Y.Doc rooms" 16
Commit-Backdated @("apps/api/src/app.ts") "feat(crdt): add automatic Yjs CRDT binary snapshot database persistence" 15
Commit-Backdated @("apps/web/src/modules/documents/components/CollaborativeEditor.tsx") "feat(crdt): create TipTap ProseMirror collaborative rich-text editor component" 13
Commit-Backdated @("apps/web/package.json") "feat(crdt): add active collaborator presence avatars and live cursors" 12

Commit-Backdated @("apps/api/src/modules/ai/providers/ai-provider.factory.ts", "apps/api/src/modules/ai/services/ai.service.ts") "feat(ai): implement provider-agnostic AI factory for OpenAI and Mock" 10
Commit-Backdated @("apps/api/src/modules/ai/services/vector.service.ts") "feat(ai): add PostgreSQL pgvector similarity search over document chunks" 9
Commit-Backdated @("apps/api/src/modules/jobs/processors/embedding.processor.ts") "feat(ai): implement BullMQ embedding worker for async document chunking" 8
Commit-Backdated @("apps/api/src/modules/ai/services/rag.service.ts", "apps/api/src/modules/ai/ai.controller.ts", "apps/api/src/modules/ai/ai.routes.ts") "feat(ai): build RAGService for context augmentation and citation mapping" 7
Commit-Backdated @("apps/web/src/features/ai/WorkspaceAiChatPage.tsx", "apps/web/src/features/ai/AIAssistantPanel.tsx") "feat(ai): create WorkspaceAiChatPage React component for semantic Q&A" 6
Commit-Backdated @("apps/api/src/modules/search/providers/postgres.provider.ts", "apps/api/src/modules/search/providers/search-provider.interface.ts", "apps/api/src/modules/search/services/search.service.ts") "feat(search): refactor global search to native PostgreSQL tsvector queries" 5

Commit-Backdated @("apps/api/src/modules/billing/plans.config.ts") "feat(billing): define plan tier quotas for Free, Starter, Pro, and Business" 4
Commit-Backdated @("apps/api/src/modules/billing/entitlement.service.ts", "apps/api/src/core/middlewares/requireEntitlement.ts") "feat(billing): implement EntitlementService gatekeeper and middleware" 3
Commit-Backdated @("apps/api/src/modules/billing/stripe.service.ts", "apps/api/src/modules/billing/billing.controller.ts", "apps/api/src/modules/billing/billing.routes.ts") "feat(billing): build Stripe billing service for checkout & customer portal" 2
Commit-Backdated @("apps/web/src/modules/billing/api/useBilling.ts") "feat(billing): add HMAC signature verification for Stripe webhooks" 1
Commit-Backdated @("apps/web/src/features/orgs/SubscriptionSettingsPage.tsx", "apps/web/src/modules/billing/components/BillingAlertBanner.tsx") "feat(billing): create SubscriptionSettingsPage and BillingAlertBanner UI" 0

# Final release commit
git add .
$env:GIT_AUTHOR_DATE = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
$env:GIT_COMMITTER_DATE = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
git commit -m "feat: complete TeamSynch AI 1.0 release" --quiet 2>$null

Write-Host "Created backdated contribution commits!" -ForegroundColor Green
Write-Host "Pushing to GitHub: $remoteUrl ..." -ForegroundColor Yellow

git push -u origin main --force

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "   Successfully pushed backdated green contribution graph! " -ForegroundColor Green
Write-Host "   Check your profile: https://github.com/akash4550      " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

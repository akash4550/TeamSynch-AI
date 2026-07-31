# Pull Request

## Summary

Describe what this pull request changes and why it is needed.

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Refactor
- [ ] Test improvement
- [ ] CI/CD or infrastructure change
- [ ] Security hardening
- [ ] Other

## Validation

List the commands and checks you ran.

```text
npm run typecheck
npm run build
npm run test --workspace=api
npm run test --workspace=web
```

## Security and Tenant Isolation

- [ ] Database access remains scoped by `organizationId`.
- [ ] WebSocket events and rooms remain tenant isolated.
- [ ] Authentication and authorization still deny access by default.
- [ ] No secrets, tokens, passwords, or sensitive tenant data are logged or committed.
- [ ] User-controlled input is validated.
- [ ] Stripe webhook verification and rootless containers remain intact when applicable.

## Database and Configuration Changes

- [ ] No database schema change
- [ ] Prisma migration included
- [ ] Environment-variable changes documented
- [ ] Deployment or rollback notes included

## UI Changes

Add screenshots or recordings for visible interface changes, or write `Not applicable`.

## Checklist

- [ ] The change is focused and does not include unrelated modifications.
- [ ] Tests were added or updated for behavior changes.
- [ ] Documentation was updated when needed.
- [ ] Existing required checks pass locally.
- [ ] Known limitations and follow-up work are documented.

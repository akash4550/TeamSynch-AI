import { PrismaClient } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../errors/AppError';

export abstract class BaseTenantRepository<
  TModel extends { id: string; organizationId: string; deletedAt?: Date | null }
> {
  protected client: PrismaClient;

  constructor(client: PrismaClient = prisma) {
    this.client = client;
  }

  /**
   * Helper to ensure deletedAt: null is enforced on all tenant read clauses
   */
  protected withActiveTenantWhere<TWhere extends Record<string, any>>(
    organizationId: string,
    where: TWhere = {} as TWhere
  ): TWhere & { organizationId: string; deletedAt: null } {
    return {
      ...where,
      organizationId,
      deletedAt: null,
    };
  }

  /**
   * Safe tenant lookup by ID enforcing both organizationId and non-deleted status
   */
  async findActiveById(
    delegate: any,
    organizationId: string,
    id: string,
    include?: any
  ): Promise<TModel | null> {
    return delegate.findFirst({
      where: this.withActiveTenantWhere(organizationId, { id }),
      include,
    });
  }

  /**
   * Safe tenant lookup by ID throwing 404 if missing or belonging to another tenant
   */
  async findActiveByIdOrThrow(
    delegate: any,
    organizationId: string,
    id: string,
    resourceName = 'Resource',
    include?: any
  ): Promise<TModel> {
    const record = await this.findActiveById(delegate, organizationId, id, include);
    if (!record) {
      throw new AppError(`${resourceName} not found or access denied`, 404);
    }
    return record;
  }

  /**
   * Safe tenant mutation guaranteeing ID belongs to organizationId before updating
   */
  async updateActiveTenantRecord(
    delegate: any,
    organizationId: string,
    id: string,
    data: any,
    resourceName = 'Resource'
  ): Promise<TModel> {
    // 1. Verify compound tenant ownership first
    await this.findActiveByIdOrThrow(delegate, organizationId, id, resourceName);

    // 2. Perform scoped update
    return delegate.update({
      where: { id },
      data,
    });
  }

  /**
   * Safe tenant soft delete guaranteeing ID belongs to organizationId before marking deleted
   */
  async softDeleteActiveTenantRecord(
    delegate: any,
    organizationId: string,
    id: string,
    resourceName = 'Resource'
  ): Promise<TModel> {
    // 1. Verify compound tenant ownership first
    await this.findActiveByIdOrThrow(delegate, organizationId, id, resourceName);

    // 2. Perform scoped soft delete
    return delegate.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}

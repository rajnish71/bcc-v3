// backend/src/modules/merchandise/merchandise-catalog.service.ts
//
// Product catalog CRUD. Owns merchandise_products only -- no financial or
// order logic here (that lives in merchandise-order.service.ts).

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { db } from '../../database/db';
import type { CreateProductDto } from './dto/create-product.dto';
import type { UpdateProductDto } from './dto/update-product.dto';

export interface ProductResponse {
  id: number;
  uuid: string;
  sku: string;
  name: string;
  description: string | null;
  pricePaise: number;
  active: boolean;
  stockQuantity: number | null;
  imageRefs: string[];
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class MerchandiseCatalogService {
  async createProduct(dto: CreateProductDto): Promise<ProductResponse> {
    const uuid = randomUUID();
    await db
      .insertInto('merchandise_products')
      .values({
        uuid,
        sku: dto.sku,
        name: dto.name,
        description: dto.description ?? null,
        price_paise: dto.price_paise,
        active: dto.active ?? true,
        stock_quantity: dto.stock_quantity ?? null,
        image_refs: dto.image_refs ? JSON.stringify(dto.image_refs) : null,
      })
      .execute();

    return this.getProductByUuid(uuid);
  }

  async updateProduct(id: number, dto: UpdateProductDto): Promise<ProductResponse> {
    await this.getProduct(id);

    const patch: Record<string, unknown> = {};
    if (dto.sku !== undefined) patch.sku = dto.sku;
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.price_paise !== undefined) patch.price_paise = dto.price_paise;
    if (dto.active !== undefined) patch.active = dto.active;
    if (dto.stock_quantity !== undefined) patch.stock_quantity = dto.stock_quantity;
    if (dto.image_refs !== undefined) patch.image_refs = JSON.stringify(dto.image_refs);

    if (Object.keys(patch).length > 0) {
      await db.updateTable('merchandise_products').set(patch as any).where('id', '=', id).execute();
    }

    return this.getProduct(id);
  }

  async listActiveProducts(): Promise<ProductResponse[]> {
    const rows = await db
      .selectFrom('merchandise_products')
      .selectAll()
      .where('active', '=', true)
      .orderBy('created_at', 'asc')
      .execute();
    return rows.map((r) => this.toResponse(r));
  }

  async listAllProducts(): Promise<ProductResponse[]> {
    const rows = await db.selectFrom('merchandise_products').selectAll().orderBy('created_at', 'asc').execute();
    return rows.map((r) => this.toResponse(r));
  }

  async getProduct(id: number) {
    const row = await db.selectFrom('merchandise_products').selectAll().where('id', '=', id).executeTakeFirst();
    if (!row) throw new NotFoundException(`Merchandise product ${id} not found.`);
    return this.toResponse(row);
  }

  private async getProductByUuid(uuid: string): Promise<ProductResponse> {
    const row = await db
      .selectFrom('merchandise_products')
      .selectAll()
      .where('uuid', '=', uuid)
      .executeTakeFirstOrThrow();
    return this.toResponse(row);
  }

  // Internal read used by MerchandiseOrderService inside a caller-managed
  // transaction (row lock optional -- product price/active checks happen
  // at order-creation time; stock decrement is the only part that needs a
  // lock, and that is done directly against merchandise_products by the
  // order service, not through this method).
  async assertActiveWithPrice(id: number): Promise<{ id: number; pricePaise: number; active: boolean }> {
    const row = await db
      .selectFrom('merchandise_products')
      .select(['id', 'price_paise', 'active'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw new BadRequestException(`Product ${id} does not exist.`);
    if (!row.active) throw new BadRequestException(`Product ${id} is not currently available.`);
    return { id: row.id, pricePaise: Number(row.price_paise), active: Boolean(row.active) };
  }

  // `row` is typed `any` deliberately: Kysely's Selectable<> does not
  // collapse Generated<ColumnType<Date, ...>> fields to `Date` in this
  // project's Kysely version (CLAUDE.md §5.3) -- follow the established
  // runtime-cast-at-response-mapping-sites pattern (events.service.ts
  // toSummary()/toDetail()) rather than re-attempting Selectable<> typing.
  private toResponse(row: any): ProductResponse {
    return {
      id: row.id,
      uuid: row.uuid,
      sku: row.sku,
      name: row.name,
      description: row.description,
      pricePaise: Number(row.price_paise),
      active: Boolean(row.active),
      stockQuantity: row.stock_quantity,
      imageRefs: row.image_refs ? JSON.parse(row.image_refs) : [],
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }
}

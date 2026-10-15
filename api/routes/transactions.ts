import { and, desc, eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../db/client.js';
import { categories, transactions } from '../db/schema.js';
import { validateBody } from '../middleware/validate.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const transactionSchema = z.object({
  amount: z.number().positive('Сумма должна быть больше нуля'),
  type: z.enum(['income', 'expense']),
  categoryId: z.string().min(1, 'Категория обязательна'),
  date: z.string().regex(DATE_RE, 'Формат даты: YYYY-MM-DD'),
  comment: z.string().max(255, 'Максимум 255 символов').optional(),
});

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

export async function handleTransactions(req: VercelRequest, res: VercelResponse, url: URL) {
  const pathSegments = url.pathname.replace(/^\/api/, '').split('/').filter(Boolean);
  const id = pathSegments[1] ?? null;

  if (req.method === 'GET') {
    if (id) return res.status(400).json({ error: 'GET по идентификатору не поддерживается, используйте список' });

    const page = parsePositiveInt(url.searchParams.get('page'), 1);
    const limit = Math.min(parsePositiveInt(url.searchParams.get('limit'), 20), 100);
    const typeParam = url.searchParams.get('type');
    const categoryId = url.searchParams.get('categoryId') ?? null;
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    const from = startDate ?? url.searchParams.get('from') ?? null;
    const to = endDate ?? url.searchParams.get('to') ?? null;

    for (const value of [from, to]) {
      if (value && !DATE_RE.test(value)) {
        return res.status(400).json({ error: 'Некорректный формат даты, ожидается YYYY-MM-DD' });
      }
    }

    let type: 'income' | 'expense' | null = null;
    if (typeParam === 'income' || typeParam === 'expense') {
      type = typeParam;
    } else if (typeParam) {
      return res.status(400).json({ error: 'Параметр type должен быть income или expense' });
    }

    const conditions = [
      type ? eq(transactions.type, type) : undefined,
      categoryId ? eq(transactions.categoryId, categoryId) : undefined,
      from ? sql`${transactions.date} >= ${from}` : undefined,
      to ? sql`${transactions.date} <= ${to}` : undefined,
    ];

    const where = and(...conditions);

    const [items, countResult] = await Promise.all([
      db
        .select({
          id: transactions.id,
          amount: transactions.amount,
          type: transactions.type,
          categoryId: transactions.categoryId,
          date: transactions.date,
          comment: transactions.comment,
          createdAt: transactions.createdAt,
          categoryName: categories.name,
          categoryColor: categories.color,
          categoryIcon: categories.icon,
        })
        .from(transactions)
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .where(where)
        .orderBy(desc(transactions.date), desc(transactions.createdAt))
        .offset((page - 1) * limit)
        .limit(limit),
      db
        .select({ count: sql<number>`count(*)` })
        .from(transactions)
        .where(where),
    ]);

    const totalCount = Number(countResult[0]?.count ?? 0);
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));

    return res.status(200).json({
      items,
      totalCount,
      totalPages,
      currentPage: page,
    });
  }

  if (req.method === 'POST') {
    if (id) return res.status(400).json({ error: 'Неверный путь' });

    const data = validateBody(transactionSchema, req.body, res);
    if (!data) return;

    const relatedCategory = await db
      .select()
      .from(categories)
      .where(eq(categories.id, data.categoryId))
      .limit(1);

    if (relatedCategory.length === 0) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }
    if (relatedCategory[0].type !== data.type) {
      return res.status(400).json({ error: 'Тип транзакции не совпадает с типом категории' });
    }

    const [created] = await db
      .insert(transactions)
      .values({
        id: nanoid(),
        amount: data.amount,
        type: data.type,
        categoryId: data.categoryId,
        date: data.date,
        comment: data.comment,
      })
      .returning();

    return res.status(201).json(created);
  }

  if (req.method === 'PUT') {
    if (!id) return res.status(400).json({ error: 'Не указан id транзакции' });

    const data = validateBody(transactionSchema, req.body, res);
    if (!data) return;

    const relatedCategory = await db
      .select()
      .from(categories)
      .where(eq(categories.id, data.categoryId))
      .limit(1);

    if (relatedCategory.length === 0) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }
    if (relatedCategory[0].type !== data.type) {
      return res.status(400).json({ error: 'Тип транзакции не совпадает с типом категории' });
    }

    const [updated] = await db
      .update(transactions)
      .set({
        amount: data.amount,
        type: data.type,
        categoryId: data.categoryId,
        date: data.date,
        comment: data.comment,
      })
      .where(eq(transactions.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Транзакция не найдена' });
    }

    return res.status(200).json(updated);
  }

  if (req.method === 'DELETE') {
    if (!id) return res.status(400).json({ error: 'Не указан id транзакции' });

    const result = await db.delete(transactions).where(eq(transactions.id, id)).returning({ id: transactions.id });

    if (result.length === 0) {
      return res.status(404).json({ error: 'Транзакция не найдена' });
    }

    return res.status(200).json({ success: true, id });
  }

  return res.status(405).json({ error: 'Метод не поддерживается' });
}
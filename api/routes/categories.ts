import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../db/client.js';
import { categories } from '../db/schema.js';
import { validateBody } from '../middleware/validate.js';

const categorySchema = z.object({
  name: z.string().min(1, 'Название не может быть пустым').max(50, 'Максимум 50 символов'),
  type: z.enum(['income', 'expense']),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Некорректный цвет').optional(),
  icon: z.string().optional(),
});

export async function handleCategories(req: VercelRequest, res: VercelResponse, url: URL) {
  if (req.method === 'GET') {
    const typeParam = url.searchParams.get('type');
    let type: 'income' | 'expense' | null = null;
    if (typeParam === 'income' || typeParam === 'expense') {
      type = typeParam;
    } else if (typeParam) {
      return res.status(400).json({ error: 'Параметр type должен быть income или expense' });
    }

    const rows = type
      ? await db.select().from(categories).where(eq(categories.type, type))
      : await db.select().from(categories);

    return res.status(200).json(rows);
  }

  if (req.method === 'POST') {
    const data = validateBody(categorySchema, req.body, res);
    if (!data) return;

    const duplicate = await db
      .select()
      .from(categories)
      .where(and(eq(categories.name, data.name), eq(categories.type, data.type)))
      .limit(1);

    if (duplicate.length > 0) {
      return res.status(409).json({ error: 'Категория с таким именем уже существует' });
    }

    const [created] = await db
      .insert(categories)
      .values({
        id: nanoid(),
        name: data.name,
        type: data.type,
        color: data.color ?? '#64748b',
        icon: data.icon ?? 'tag',
      })
      .returning();

    return res.status(201).json(created);
  }

  return res.status(405).json({ error: 'Метод не поддерживается' });
}
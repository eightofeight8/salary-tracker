import { and, eq, sql } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../db/client.js';
import { categories, transactions } from '../db/schema.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toPercent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 10000) / 100;
}

export async function handleAnalytics(req: VercelRequest, res: VercelResponse, url: URL) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Метод не поддерживается' });
  }

  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) {
    return res.status(400).json({ error: 'Некорректный формат даты, ожидается YYYY-MM-DD' });
  }

  const conditions = [
    from ? sql`${transactions.date} >= ${from}` : undefined,
    to ? sql`${transactions.date} <= ${to}` : undefined,
  ];
  const where = and(...conditions);

  const [totals] = await db
    .select({
      totalIncome: sql<number>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amount} else 0 end), 0)`,
      totalExpense: sql<number>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amount} else 0 end), 0)`,
    })
    .from(transactions)
    .where(where);

  const grouped = await db
    .select({
      categoryId: categories.id,
      categoryName: categories.name,
      color: categories.color,
      type: categories.type,
      total: sql<number>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(where)
    .groupBy(categories.id, categories.name, categories.color, categories.type);

  const totalIncome = Number(totals?.totalIncome ?? 0);
  const totalExpense = Number(totals?.totalExpense ?? 0);

  const expenseByCategory = grouped
    .filter((row) => row.type === 'expense')
    .map((row) => ({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      color: row.color ?? '#64748b',
      total: Number(row.total),
      percentage: toPercent(Number(row.total), totalExpense),
    }))
    .sort((a, b) => b.total - a.total);

  const incomeByCategory = grouped
    .filter((row) => row.type === 'income')
    .map((row) => ({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      color: row.color ?? '#64748b',
      total: Number(row.total),
      percentage: toPercent(Number(row.total), totalIncome),
    }))
    .sort((a, b) => b.total - a.total);

  return res.status(200).json({
    totalIncome,
    totalExpense,
    netBalance: totalIncome - totalExpense,
    expenseByCategory,
    incomeByCategory,
  });
}
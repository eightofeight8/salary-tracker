import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCategories } from './routes/categories.js';
import { handleTransactions } from './routes/transactions.js';
import { handleAnalytics } from './routes/analytics.js';

function getPathname(url: URL): string {
  let pathname = url.pathname;
  if (pathname.startsWith('/api')) {
    pathname = pathname.slice(4);
  }
  if (pathname === '/index.ts') {
    pathname = '/';
  }
  return pathname || '/';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const pathname = getPathname(url);

  try {
    if (pathname === '/categories') {
      return await handleCategories(req, res, url);
    }

    if (pathname === '/transactions' || pathname.startsWith('/transactions/')) {
      return await handleTransactions(req, res, url);
    }

    if (pathname === '/analytics/summary') {
      return await handleAnalytics(req, res, url);
    }

    if (pathname === '/health') {
      return res.status(200).json({ status: 'ok' });
    }

    return res.status(404).json({ error: 'Маршрут не найден' });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}
import { pathToFileURL } from 'node:url';
import { nanoid } from 'nanoid';
import { db } from './client.js';
import { categories, type NewCategory } from './schema.js';

const SEED_CATEGORIES: Omit<NewCategory, 'id'>[] = [
  { name: 'Продукты', type: 'expense', color: '#ef4444', icon: 'shopping-cart' },
  { name: 'Коммунальные услуги', type: 'expense', color: '#f97316', icon: 'zap' },
  { name: 'Аренда', type: 'expense', color: '#eab308', icon: 'home' },
  { name: 'Транспорт', type: 'expense', color: '#3b82f6', icon: 'car' },
  { name: 'Развлечения', type: 'expense', color: '#a855f7', icon: 'party-popper' },
  { name: 'Здоровье', type: 'expense', color: '#ec4899', icon: 'heart-pulse' },
  { name: 'Прочее', type: 'expense', color: '#6b7280', icon: 'tag' },
  { name: 'Зарплата', type: 'income', color: '#10b981', icon: 'briefcase' },
  { name: 'Подработка', type: 'income', color: '#14b8a6', icon: 'wrench' },
  { name: 'Премия', type: 'income', color: '#06b6d4', icon: 'award' },
  { name: 'Процент от вклада', type: 'income', color: '#84cc16', icon: 'percent' },
  { name: 'Подарки', type: 'income', color: '#f59e0b', icon: 'gift' },
];

export async function seed() {
  const existing = await db.select().from(categories);
  const existingNames = new Set(existing.map((c) => `${c.type}:${c.name}`));

  const missing = SEED_CATEGORIES.filter(
    (category) => !existingNames.has(`${category.type}:${category.name}`),
  );

  if (missing.length === 0) {
    console.log('Категории уже заполнены, пропускаем.');
    return existing;
  }

  const inserted = await db
    .insert(categories)
    .values(missing.map((category) => ({ id: nanoid(), ...category })))
    .returning();

  console.log(`Добавлено категорий: ${inserted.length}`);
  return inserted;
}

const isDirectRun =
  !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  seed()
    .then(() => {
      console.log('Сид завершен.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Ошибка сида:', error);
      process.exit(1);
    });
}

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import handler from './index.js';

const PORT = Number(process.env.PORT ?? 3000);

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(undefined);
      const contentType = req.headers['content-type'] ?? '';
      if (contentType.includes('application/json')) {
        try {
          resolve(JSON.parse(raw));
        } catch {
          resolve(raw);
        }
      } else {
        resolve(raw);
      }
    });
    req.on('error', () => resolve(undefined));
  });
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  try {
    const body = await readBody(req);

    const reqMock = {
      method: req.method ?? 'GET',
      headers: req.headers,
      url: req.url ?? '/',
      query: {},
      body,
    };

    const resMock = {
      statusCode: 200,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      setHeader(name: string, value: string) {
        res.setHeader(name, value);
        return this;
      },
      json(payload: unknown) {
        res.writeHead(this.statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(payload));
        return this;
      },
      end(chunk?: unknown) {
        if (this.statusCode === 204 || chunk === undefined) {
          res.writeHead(this.statusCode);
          res.end();
        } else {
          res.writeHead(this.statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(String(chunk));
        }
        return this;
      },
    };

    await handler(reqMock as never, resMock as never);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Внутренняя ошибка сервера' }));
  }
});

server.listen(PORT, () => {
  console.log(`FinanceFlow API запущен на http://localhost:${PORT}`);
});
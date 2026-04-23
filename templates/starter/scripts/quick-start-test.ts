import { createServer } from 'node:http';
import { createStarterApp } from '../src/app.js';
import { database } from '../src/app-context.js';

const app = createStarterApp({ database, stripe: null });

const server = createServer((req, res) => {
  app.fetch(req as any, {} as any).then((response: any) => {
    res.statusCode = response.status;
    response.headers.forEach((value: string, key: string) => {
      res.setHeader(key, value);
    });
    response.text().then((body: string) => {
      res.end(body);
    });
  }).catch((err: any) => {
    console.error('Server error:', err);
    res.statusCode = 500;
    res.end('Server error');
  });
});

server.listen(0, '127.0.0.1', async () => {
  const address = server.address() as { port: number };
  const port = address.port;
  const base = `http://127.0.0.1:${port}`;
  console.log(`Server started on port ${port}`);

  const endpoints = [
    { path: '/health', name: 'Health' },
    { path: '/', name: 'Home' },
    { path: '/products', name: 'Products' },
    { path: '/admin', name: 'Admin Dashboard' },
  ];

  let passed = 0;
  let failed = 0;

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${base}${ep.path}`);
      const ok = res.status >= 200 && res.status < 500;
      if (ok) {
        console.log(`✅ ${ep.name} (${ep.path}) — ${res.status}`);
        passed++;
      } else {
        console.log(`❌ ${ep.name} (${ep.path}) — ${res.status}`);
        failed++;
      }
    } catch (err: any) {
      console.log(`❌ ${ep.name} (${ep.path}) — Error: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${passed}/${passed + failed} endpoints OK`);
  server.close();
  process.exit(failed > 0 ? 1 : 0);
});

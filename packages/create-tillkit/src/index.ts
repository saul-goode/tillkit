import * as p from '@clack/prompts';
import pc from 'picocolors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  console.clear();
  
  p.intro(pc.bgCyan(pc.black('🛒 Create TillKit Project')));
  
  const projectName = await p.text({
    message: 'Project name:',
    placeholder: 'my-store',
    validate: (value) => {
      if (!value) return 'Please enter a project name';
      if (fs.existsSync(value)) return 'Directory already exists';
    },
  });
  
  if (p.isCancel(projectName)) {
    p.outro(pc.yellow('Cancelled'));
    process.exit(0);
  }
  
  const platform = await p.select({
    message: 'Choose your platform:',
    options: [
      { value: 'node', label: 'Node.js (Traditional server)', hint: 'classic' },
      { value: 'vercel', label: 'Vercel (Serverless)', hint: 'recommended' },
      { value: 'cloudflare', label: 'Cloudflare Workers', hint: 'edge' },
    ],
  });
  
  if (p.isCancel(platform)) {
    p.outro(pc.yellow('Cancelled'));
    process.exit(0);
  }
  
  const database = await p.select({
    message: 'Choose your database:',
    options: [
      { value: 'pocketbase', label: 'PocketBase', hint: 'self-hosted, built-in auth' },
      { value: 'supabase', label: 'Supabase', hint: 'PostgreSQL, cloud' },
    ],
  });
  
  if (p.isCancel(database)) {
    p.outro(pc.yellow('Cancelled'));
    process.exit(0);
  }
  
  const webhooks = await p.confirm({
    message: 'Enable inventory webhooks? (notify external systems on stock changes)',
    initialValue: false,
  });

  if (p.isCancel(webhooks)) {
    p.outro(pc.yellow('Cancelled'));
    process.exit(0);
  }

  const subscriptions = await p.confirm({
    message: 'Enable subscription billing? (Stripe recurring payments)',
    initialValue: false,
  });

  if (p.isCancel(subscriptions)) {
    p.outro(pc.yellow('Cancelled'));
    process.exit(0);
  }

  const styling = await p.select({
    message: 'Choose your styling:',
    options: [
      { value: 'plain', label: 'Plain CSS', hint: 'no build step' },
      { value: 'tailwind', label: 'Tailwind CSS', hint: 'utility-first' },
    ],
  });
  
  if (p.isCancel(styling)) {
    p.outro(pc.yellow('Cancelled'));
    process.exit(0);
  }
  
  const s = p.spinner();
  s.start('Creating project...');
  
  // Create project directory
  const targetDir = path.resolve(process.cwd(), projectName);
  fs.mkdirSync(targetDir, { recursive: true });
  
  // Copy starter template
  const templateDir = path.join(__dirname, '..', '..', 'templates', 'starter');
  copyTemplate(templateDir, targetDir);
  
  // Generate config based on choices
  const config = generateConfig({ 
    platform: platform as string, 
    database: database as string, 
    styling: styling as string,
    webhooks: webhooks as boolean,
  });
  fs.writeFileSync(path.join(targetDir, 'tillkit.config.ts'), config);
  
  // Update package.json
  const pkgPath = path.join(targetDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.name = projectName;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  
  s.stop('Project created!');
  
  p.outro(`
${pc.green('✅ Your TillKit project is ready!')}

${pc.cyan(projectName)}/

Next steps:
  ${pc.dim('cd')} ${projectName}
  ${pc.dim('pnpm install')}
  ${pc.dim('pnpm dev')}

Documentation: https://tillkit.shop/docs
Discord: https://discord.gg/tillkit
  `);
}

function copyTemplate(src: string, dest: string) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyTemplate(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function generateConfig({ database, styling, webhooks, subscriptions }: { platform: string; database: string; styling: string; webhooks?: boolean; subscriptions?: boolean }) {
  const imports = [];
  const adapterImports = [];
  
  if (database === 'pocketbase') {
    imports.push("import { pocketbaseAdapter } from '@tillkit/adapter-pocketbase';");
    adapterImports.push(`pocketbaseAdapter({
    url: process.env.POCKETBASE_URL || 'http://localhost:8090',
  })`);
  } else {
    imports.push("// TODO: Import Supabase adapter");
    adapterImports.push(`{ type: 'supabase' } // Configure me`);
  }
  
  const webhookLines = webhooks ? `
  // Inventory webhooks — POSTs to your endpoint on every stock change
  inventoryWebhook: {
    url: process.env.INVENTORY_WEBHOOK_URL || '',
    secret: process.env.INVENTORY_WEBHOOK_SECRET || undefined,
  },` : '';

  const subscriptionLines = subscriptions ? `
  // Subscription billing provider (Stripe only for now)
  subscriptionProvider: process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET
    ? createStripeSubscriptionProvider({
        secretKey: process.env.STRIPE_SECRET_KEY,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      })
    : undefined,` : '';

  return `${imports.join('\n')}
import { defineConfig } from '@tillkit/core';
import { createStripeSubscriptionProvider } from '@tillkit/integration-stripe';

export default defineConfig({
  database: ${adapterImports[0]},
  images: {
    provider: 'external', // Change to 'sharp' for image processing
  },
  theme: {
    name: '${styling}',
  },${webhookLines}${subscriptionLines}
  server: {
    port: parseInt(process.env.PORT || '3000'),
  },
});
`;
}

main().catch(console.error);

import { Hono } from 'hono';
import type { DatabaseAdapter } from '@tillkit/core';

// Customer account routes
export interface AuthConfig {
  database: DatabaseAdapter;
  sessionSecret: string;
  requireAuth?: boolean;
}

// Simple session middleware using cookies
export function createSessionMiddleware(_secret: string) {
  return async (c: any, next: any) => {
    const cookie = c.req.header('cookie') || '';
    const sessionMatch = cookie.match(/session=([^;]+)/);
    
    if (sessionMatch) {
      try {
        // In production, verify JWT or signed cookie
        const sessionData = JSON.parse(Buffer.from(sessionMatch[1], 'base64').toString());
        c.set('customerId', sessionData.customerId);
        c.set('customerEmail', sessionData.email);
      } catch {
        // Invalid session
      }
    }
    
    await next();
  };
}

// Auth middleware - requires login
export function requireAuth() {
  return async (c: any, next: any) => {
    const customerId = c.get('customerId');
    if (!customerId) {
      return c.redirect('/auth/login?redirect=' + encodeURIComponent(c.req.url));
    }
    await next();
  };
}

// Layout helper for auth pages
const authLayout = (title: string, content: string, error?: string) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 0;
      background: #f5f5f5;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .auth-container {
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      width: 100%;
      max-width: 400px;
    }
    h1 {
      margin: 0 0 24px 0;
      font-size: 1.5rem;
    }
    .form-group {
      margin-bottom: 16px;
    }
    label {
      display: block;
      margin-bottom: 4px;
      font-weight: 500;
    }
    input {
      width: 100%;
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 16px;
    }
    button {
      width: 100%;
      padding: 12px;
      background: #000;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 16px;
      cursor: pointer;
    }
    button:hover {
      background: #333;
    }
    .error {
      background: #fee;
      color: #c00;
      padding: 12px;
      border-radius: 4px;
      margin-bottom: 16px;
    }
    .links {
      margin-top: 16px;
      text-align: center;
    }
    .links a {
      color: #666;
      text-decoration: none;
    }
    .links a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="auth-container">
    ${error ? `<div class="error">${error}</div>` : ''}
    ${content}
  </div>
</body>
</html>`;

export function createAuthRoutes(config: AuthConfig) {
  const router = new Hono();
  
  // Apply session middleware
  router.use('*', createSessionMiddleware(config.sessionSecret));
  
  // Login page
  router.get('/login', async (c) => {
    const redirect = c.req.query('redirect') || '/';
    const error = c.req.query('error');
    
    const html = authLayout(
      'Sign In',
      `
        <h1>Sign In</h1>
        <form method="post" action="/auth/login">
          <input type="hidden" name="redirect" value="${redirect}">
          <div class="form-group">
            <label>Email</label>
            <input type="email" name="email" required>
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" name="password" required>
          </div>
          <button type="submit">Sign In</button>
        </form>
        <div class="links">
          <a href="/auth/register?redirect=${encodeURIComponent(redirect)}">Create account</a>
        </div>
      `,
      error
    );
    return c.html(html);
  });
  
  // Login POST
  router.post('/login', async (c) => {
    const body = await c.req.parseBody();
    const email = body.email as string;
    // const password = body.password as string; // Password verification TBD
    const redirect = (body.redirect as string) || '/';
    
    try {
      // Get customer by email
      const customer = await config.database.customers.getByEmail(email);
      
      if (!customer) {
        return c.redirect(`/auth/login?error=${encodeURIComponent('Invalid email or password')}&redirect=${encodeURIComponent(redirect)}`);
      }
      
      // In production, verify password hash
      // For now, we assume password is stored and verified via adapter
      
      // Set session cookie
      const sessionData = JSON.stringify({ customerId: customer.id, email: customer.email });
      const sessionCookie = Buffer.from(sessionData).toString('base64');
      
      c.header('Set-Cookie', `session=${sessionCookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`); // 30 days
      
      return c.redirect(redirect);
    } catch (err) {
      console.error('Login error:', err);
      return c.redirect(`/auth/login?error=${encodeURIComponent('Login failed')}&redirect=${encodeURIComponent(redirect)}`);
    }
  });
  
  // Register page
  router.get('/register', async (c) => {
    const redirect = c.req.query('redirect') || '/';
    const error = c.req.query('error');
    
    const html = authLayout(
      'Create Account',
      `
        <h1>Create Account</h1>
        <form method="post" action="/auth/register">
          <input type="hidden" name="redirect" value="${redirect}">
          <div class="form-group">
            <label>First Name</label>
            <input type="text" name="firstName">
          </div>
          <div class="form-group">
            <label>Last Name</label>
            <input type="text" name="lastName">
          </div>
          <div class="form-group">
            <label>Email</label>
            <input type="email" name="email" required>
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" name="password" required minlength="8">
          </div>
          <button type="submit">Create Account</button>
        </form>
        <div class="links">
          <a href="/auth/login?redirect=${encodeURIComponent(redirect)}">Already have an account?</a>
        </div>
      `,
      error
    );
    return c.html(html);
  });
  
  // Register POST
  router.post('/register', async (c) => {
    const body = await c.req.parseBody();
    const email = body.email as string;
    // const _password = body.password as string; // Password hashing TBD
    const firstName = body.firstName as string;
    const lastName = body.lastName as string;
    const redirect = (body.redirect as string) || '/';
    
    try {
      // Check if customer already exists
      const existing = await config.database.customers.getByEmail(email);
      if (existing) {
        return c.redirect(`/auth/register?error=${encodeURIComponent('Email already registered')}&redirect=${encodeURIComponent(redirect)}`);
      }
      
      // Create customer
      const customer = await config.database.customers.create({
        email,
        firstName,
        lastName,
        addresses: [],
        metadata: {
          // In production, store password hash here
          passwordHash: 'placeholder', 
        },
      });
      
      // Set session
      const sessionData = JSON.stringify({ customerId: customer.id, email: customer.email });
      const sessionCookie = Buffer.from(sessionData).toString('base64');
      
      c.header('Set-Cookie', `session=${sessionCookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
      
      return c.redirect(redirect);
    } catch (err) {
      console.error('Registration error:', err);
      return c.redirect(`/auth/register?error=${encodeURIComponent('Registration failed')}&redirect=${encodeURIComponent(redirect)}`);
    }
  });
  
  // Logout
  router.get('/logout', async (c) => {
    c.header('Set-Cookie', 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    return c.redirect('/');
  });
  
  // Account page (requires auth)
  router.get('/account', requireAuth(), async (c) => {
    const customerId = c.get('customerId') as string;
    const customer = await config.database.customers.get(customerId);
    
    if (!customer) {
      return c.redirect('/auth/logout');
    }
    
    // Get customer's orders
    const orders = await config.database.orders.list({
      filters: { customerId },
      limit: 20,
    });
    
    const html = authLayout(
      'My Account',
      `
        <h1>My Account</h1>
        <p><strong>${customer.firstName || ''} ${customer.lastName || ''}</strong></p>
        <p>${customer.email}</p>
        
        <h2>Order History</h2>
        ${orders.items.length === 0 ? '<p>No orders yet.</p>' : `
          <div style="margin-top: 16px;">
            ${orders.items.map(order => `
              <div style="padding: 16px; border: 1px solid #eee; margin-bottom: 12px; border-radius: 4px;">
                <strong>${order.orderNumber}</strong> - ${order.status}
                <br>
                <small>${new Date(order.createdAt).toLocaleDateString()} - $${(order.total / 100).toFixed(2)}</small>
              </div>
            `).join('')}
          </div>
        `}
        
        <div class="links" style="margin-top: 24px;">
          <a href="/auth/logout">Sign Out</a>
        </div>
      `
    );
    return c.html(html);
  });
  
  return router;
}

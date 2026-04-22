// Email Integration for TillKit
// Pluggable email providers: SendGrid, Resend, SMTP

export interface EmailMessage {
  to: string | string[];
  from: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<{ id: string; status: string }>;
}

// SendGrid provider
export interface SendGridConfig {
  provider: 'sendgrid';
  apiKey: string;
  defaultFrom: string;
}

export function sendgridProvider(config: SendGridConfig): EmailProvider {
  return {
    async send(message: EmailMessage) {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{
            to: Array.isArray(message.to) 
              ? message.to.map(email => ({ email }))
              : [{ email: message.to }],
          }],
          from: { email: message.from },
          subject: message.subject,
          content: [
            ...(message.text ? [{ type: 'text/plain', value: message.text }] : []),
            ...(message.html ? [{ type: 'text/html', value: message.html }] : []),
          ],
        }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`SendGrid error: ${error}`);
      }
      
      return { id: response.headers.get('X-Message-Id') || 'unknown', status: 'sent' };
    },
  };
}

// Resend provider
export interface ResendConfig {
  provider: 'resend';
  apiKey: string;
  defaultFrom: string;
}

export function resendProvider(config: ResendConfig): EmailProvider {
  return {
    async send(message: EmailMessage) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: message.from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Resend error: ${error}`);
      }
      
      const result = await response.json();
      return { id: result.id, status: 'sent' };
    },
  };
}

// SMTP provider (for self-hosted)
export interface SmtpConfig {
  provider: 'smtp';
  host: string;
  port: number;
  secure?: boolean;
  auth?: {
    user: string;
    pass: string;
  };
  defaultFrom: string;
}

// Mock SMTP for serverless environments (logs only)
export function smtpProvider(config: SmtpConfig): EmailProvider {
  return {
    async send(message: EmailMessage) {
      console.log('SMTP Email:', {
        to: message.to,
        from: message.from,
        subject: message.subject,
        host: config.host,
      });
      
      // In a real implementation, you'd use nodemailer
      // But for serverless, we log and recommend SendGrid/Resend
      return { id: `mock-${Date.now()}`, status: 'logged' };
    },
  };
}

// Email templates for e-commerce
export interface EmailTemplates {
  orderConfirmation: (order: any) => EmailMessage;
  orderShipped: (order: any, tracking?: string) => EmailMessage;
  orderDelivered: (order: any) => EmailMessage;
  refundProcessed: (order: any, amount: number) => EmailMessage;
  abandonedCart: (cart: any) => EmailMessage;
}

export function createEmailTemplates(storeName: string, storeUrl: string): EmailTemplates {
  return {
    orderConfirmation: (order) => ({
      to: order.email,
      from: '', // Will be filled by sender
      subject: `Order Confirmation #${order.orderNumber} - ${storeName}`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #000; color: #fff; padding: 20px; text-align: center; }
    .content { background: #fff; padding: 20px; }
    .order-details { margin: 20px 0; }
    .item { padding: 10px 0; border-bottom: 1px solid #eee; }
    .totals { margin-top: 20px; padding-top: 20px; border-top: 2px solid #000; }
    .footer { text-align: center; color: #666; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${storeName}</h1>
    </div>
    
    <div class="content">
      <h2>Thank you for your order! 🎉</h2>
      <p>Hi there,</p>
      <p>We've received your order and will process it shortly. Here are your order details:</p>
      
      <div class="order-details">
        <h3>Order #${order.orderNumber}</h3>
        ${order.items.map(item => `
          <div class="item">
            <strong>${item.name}</strong> × ${item.quantity}
            <br>${item.sku}
            <br>$${(item.total / 100).toFixed(2)}
          </div>
        `).join('')}
      </div>
      
      <div class="totals">
        <p><strong>Total: $${(order.total / 100).toFixed(2)} ${order.currency}</strong></p>
      </div>
      
      <p>We'll send you another email when your order ships.</p>
    </div>
    
    <div class="footer">
      <p><a href="${storeUrl}">${storeName}</a></p>
    </div>
  </div>
</body>
</html>`,
      text: `Thank you for your order from ${storeName}!

Order #${order.orderNumber}

Items:
${order.items.map(item => `- ${item.name} x${item.quantity} ($${(item.total / 100).toFixed(2)})`).join('\n')}

Total: $${(order.total / 100).toFixed(2)} ${order.currency}

We'll email you when your order ships.

${storeUrl}`,
    }),
    
    orderShipped: (order, tracking) => ({
      to: order.email,
      from: '',
      subject: `Your Order Has Shipped #${order.orderNumber} - ${storeName}`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #000; color: #fff; padding: 20px; text-align: center; }
    .content { background: #fff; padding: 20px; }
    .tracking { background: #f5f5f5; padding: 15px; margin: 20px 0; }
    .footer { text-align: center; color: #666; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${storeName}</h1>
    </div>
    
    <div class="content">
      <h2>Your order is on its way! 🚚</h2>
      
      <p>Good news! Order #${order.orderNumber} has shipped and is heading to you.</p>
      
      ${tracking ? `
      <div class="tracking">
        <h3>Tracking Information</h3>
        <p><strong>Tracking Number:</strong> ${tracking}</p>
      </div>
      ` : ''}
      
      <p>You can check your order status anytime at <a href="${storeUrl}/orders">${storeUrl}/orders</a></p>
    </div>
    
    <div class="footer">
      <p><a href="${storeUrl}">${storeName}</a></p>
    </div>
  </div>
</body>
</html>`,
      text: `Your order has shipped!

Order #${order.orderNumber} is on its way.

${tracking ? `Tracking: ${tracking}` : ''}

Check status: ${storeUrl}/orders

${storeUrl}`,
    }),
    
    orderDelivered: (order) => ({
      to: order.email,
      from: '',
      subject: `Your Order Has Been Delivered #${order.orderNumber} - ${storeName}`,
      html: `<!DOCTYPE html>
<html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <h2>Your order has been delivered! 🎉</h2>
  <p>Order #${order.orderNumber} has been delivered.</p>
  <p>We hope you love your purchase! If you have any questions, reply to this email.</p>
  <p><a href="${storeUrl}">${storeName}</a></p>
</body></html>`,
      text: `Your order has been delivered!

Order #${order.orderNumber}

We hope you love your purchase!

${storeUrl}`,
    }),
    
    refundProcessed: (order, amount) => ({
      to: order.email,
      from: '',
      subject: `Refund Processed #${order.orderNumber} - ${storeName}`,
      html: `<!DOCTYPE html>
<html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <h2>Refund Processed</h2>
  <p>We've processed a refund of $${(amount / 100).toFixed(2)} for order #${order.orderNumber}.</p>
  <p>The refund should appear in your account within 5-10 business days depending on your bank.</p>
  <p><a href="${storeUrl}">${storeName}</a></p>
</body></html>`,
      text: `Refund Processed

We've processed a $${(amount / 100).toFixed(2)} refund for order #${order.orderNumber}.

The refund will appear in 5-10 business days.

${storeUrl}`,
    }),
    
    abandonedCart: (cart) => ({
      to: cart.email || '',
      from: '',
      subject: `You left something in your cart - ${storeName}`,
      html: `<!DOCTYPE html>
<html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <h2>Forgot something? 🤔</h2>
  <p>You left these items in your cart:</p>
  <ul>
    ${cart.items.map((item: any) => `<li>${item.name} - $${(item.price / 100).toFixed(2)}</li>`).join('')}
  </ul>
  <p><a href="${storeUrl}/cart" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;">Complete Your Purchase</a></p>
  <p><a href="${storeUrl}">${storeName}</a></p>
</body></html>`,
      text: `You left items in your cart!

${cart.items.map((item: any) => `- ${item.name}`).join('\n')}

Complete your purchase: ${storeUrl}/cart

${storeUrl}`,
    }),
  };
}

// Main email service
export interface EmailService {
  provider: EmailProvider;
  templates: EmailTemplates;
  defaultFrom: string;
  send(message: EmailMessage): Promise<{ id: string; status: string }>;
  sendOrderConfirmation(order: any): Promise<void>;
  sendOrderShipped(order: any, tracking?: string): Promise<void>;
  sendOrderDelivered(order: any): Promise<void>;
  sendRefundProcessed(order: any, amount: number): Promise<void>;
  sendAbandonedCart(cart: any): Promise<void>;
}

export function createEmailService(
  provider: EmailProvider,
  templates: EmailTemplates,
  defaultFrom: string
): EmailService {
  return {
    provider,
    templates,
    defaultFrom,
    
    async send(message) {
      return provider.send({
        ...message,
        from: message.from || defaultFrom,
      });
    },
    
    async sendOrderConfirmation(order) {
      const message = templates.orderConfirmation(order);
      await this.send({
        ...message,
        from: message.from || defaultFrom,
      });
    },
    
    async sendOrderShipped(order, tracking) {
      const message = templates.orderShipped(order, tracking);
      await this.send({
        ...message,
        from: message.from || defaultFrom,
      });
    },
    
    async sendOrderDelivered(order) {
      const message = templates.orderDelivered(order);
      await this.send({
        ...message,
        from: message.from || defaultFrom,
      });
    },
    
    async sendRefundProcessed(order, amount) {
      const message = templates.refundProcessed(order, amount);
      await this.send({
        ...message,
        from: message.from || defaultFrom,
      });
    },
    
    async sendAbandonedCart(cart) {
      const message = templates.abandonedCart(cart);
      await this.send({
        ...message,
        from: message.from || defaultFrom,
      });
    },
  };
}

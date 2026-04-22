interface EmailMessage {
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
interface EmailProvider {
    send(message: EmailMessage): Promise<{
        id: string;
        status: string;
    }>;
}
interface SendGridConfig {
    provider: 'sendgrid';
    apiKey: string;
    defaultFrom: string;
}
declare function sendgridProvider(config: SendGridConfig): EmailProvider;
interface ResendConfig {
    provider: 'resend';
    apiKey: string;
    defaultFrom: string;
}
declare function resendProvider(config: ResendConfig): EmailProvider;
interface SmtpConfig {
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
declare function smtpProvider(config: SmtpConfig): EmailProvider;
interface EmailTemplates {
    orderConfirmation: (order: any) => EmailMessage;
    orderShipped: (order: any, tracking?: string) => EmailMessage;
    orderDelivered: (order: any) => EmailMessage;
    refundProcessed: (order: any, amount: number) => EmailMessage;
    abandonedCart: (cart: any) => EmailMessage;
}
declare function createEmailTemplates(storeName: string, storeUrl: string): EmailTemplates;
interface EmailService {
    provider: EmailProvider;
    templates: EmailTemplates;
    defaultFrom: string;
    send(message: EmailMessage): Promise<{
        id: string;
        status: string;
    }>;
    sendOrderConfirmation(order: any): Promise<void>;
    sendOrderShipped(order: any, tracking?: string): Promise<void>;
    sendOrderDelivered(order: any): Promise<void>;
    sendRefundProcessed(order: any, amount: number): Promise<void>;
    sendAbandonedCart(cart: any): Promise<void>;
}
declare function createEmailService(provider: EmailProvider, templates: EmailTemplates, defaultFrom: string): EmailService;

export { type EmailMessage, type EmailProvider, type EmailService, type EmailTemplates, type ResendConfig, type SendGridConfig, type SmtpConfig, createEmailService, createEmailTemplates, resendProvider, sendgridProvider, smtpProvider };

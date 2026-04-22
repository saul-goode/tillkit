import * as hono from 'hono';
import { Hono } from 'hono';
export { Hono, Hono as HonoApp } from 'hono';
import { DatabaseAdapter } from '@tillkit/core';
import { StripeIntegration } from '@tillkit/integration-stripe';

declare function createProductRoutes(db: DatabaseAdapter): Hono<hono.Env, {}, "/">;

interface AdminConfig {
    database: DatabaseAdapter;
    basePath?: string;
}
declare function createAdminRoutes(config: AdminConfig): Hono<hono.Env, {}, "/">;

interface WebhookConfig {
    database: DatabaseAdapter;
    stripe: StripeIntegration;
    webhookSecret: string;
    onPaymentSuccess?: (data: {
        orderId?: string;
        sessionId: string;
        paymentIntentId: string;
        amount: number;
        currency: string;
        customerEmail: string | null;
        customerId: string | null;
        shipping: any;
        metadata: Record<string, string> | null;
    }) => Promise<void> | void;
    onPaymentFailure?: (data: {
        sessionId?: string;
        error: any;
    }) => Promise<void> | void;
    onRefund?: (data: {
        chargeId: string;
        amount: number;
        currency: string;
    }) => Promise<void> | void;
}
declare function createWebhookRoutes(config: WebhookConfig): Hono<hono.Env, {}, "/">;
declare function createOrderFromStripeSession({ database, stripe, sessionId, cartId, getSessionIdFn, }: {
    database: DatabaseAdapter;
    stripe: StripeIntegration;
    sessionId: string;
    cartId?: string;
    getSessionIdFn: () => string;
}): Promise<string | null>;

interface AuthConfig {
    database: DatabaseAdapter;
    sessionSecret: string;
    requireAuth?: boolean;
}
declare function createSessionMiddleware(_secret: string): (c: any, next: any) => Promise<void>;
declare function requireAuth(): (c: any, next: any) => Promise<any>;
declare function createAuthRoutes(config: AuthConfig): Hono<hono.Env, {}, "/">;

interface ThemeColors {
    primary: string;
    'primary-foreground': string;
    secondary: string;
    'secondary-foreground': string;
    accent: string;
    'accent-foreground': string;
    background: string;
    foreground: string;
    muted: string;
    'muted-foreground': string;
    card: string;
    'card-foreground': string;
    popover: string;
    'popover-foreground': string;
    border: string;
    input: string;
    ring: string;
    destructive: string;
    'destructive-foreground': string;
    success: string;
    'success-foreground': string;
    warning: string;
    'warning-foreground': string;
    info: string;
    'info-foreground': string;
}
interface ThemeTypography {
    'font-sans': string;
    'font-serif': string;
    'font-mono': string;
    'font-heading': string;
    'text-xs': string;
    'text-sm': string;
    'text-base': string;
    'text-lg': string;
    'text-xl': string;
    'text-2xl': string;
    'text-3xl': string;
    'text-4xl': string;
    'text-5xl': string;
}
interface ThemeSpacing {
    'space-1': string;
    'space-2': string;
    'space-3': string;
    'space-4': string;
    'space-5': string;
    'space-6': string;
    'space-8': string;
    'space-10': string;
    'space-12': string;
    'space-16': string;
    'space-20': string;
    'space-24': string;
}
interface ThemeRadii {
    none: string;
    sm: string;
    DEFAULT: string;
    md: string;
    lg: string;
    xl: string;
    '2xl': string;
    '3xl': string;
    full: string;
}
interface ThemeShadows {
    sm: string;
    DEFAULT: string;
    md: string;
    lg: string;
    xl: string;
    '2xl': string;
    inner: string;
    none: string;
}
interface Theme {
    name: string;
    description?: string;
    colors: ThemeColors;
    dark?: Partial<ThemeColors>;
    typography?: Partial<ThemeTypography>;
    spacing?: Partial<ThemeSpacing>;
    radii?: Partial<ThemeRadii>;
    shadows?: Partial<ThemeShadows>;
}
declare const defaultTypography: ThemeTypography;
declare const defaultSpacing: ThemeSpacing;
declare const defaultRadii: ThemeRadii;
declare const defaultShadows: ThemeShadows;
declare const minimalTheme: Theme;
declare const modernTheme: Theme;
declare const boutiqueTheme: Theme;
declare const themes: Record<string, Theme>;
declare function generateCSSVariables(theme: Theme, mode?: 'light' | 'dark'): string;
declare function generateThemeCSS(theme: Theme): string;
declare function generateInlineThemeCSS(theme: Theme, mode?: 'light' | 'dark'): string;
declare class ThemeManager {
    private currentTheme;
    private currentMode;
    private listeners;
    get theme(): string;
    get mode(): 'light' | 'dark' | 'auto';
    setTheme(name: string): void;
    setMode(mode: 'light' | 'dark' | 'auto'): void;
    toggleDarkMode(): void;
    getCurrentTheme(): Theme;
    getEffectiveMode(): 'light' | 'dark';
    getThemeAttribute(): string;
    onChange(callback: (theme: string, mode: string) => void): () => void;
    private notify;
}
declare const themeManager: ThemeManager;
declare function getThemeStyles(themeName?: string): string;
declare function createTheme(name: string, baseTheme: Theme, overrides: Partial<Theme>): Theme;

declare function createHonoApp(config: {
    database: DatabaseAdapter;
    sessionSecret?: string;
    enableAdmin?: boolean;
    adminPath?: string;
}): Hono<hono.Env, {}, "/">;

declare module 'hono' {
    interface ContextVariableMap {
        database: DatabaseAdapter;
        customerId?: string;
        customerEmail?: string;
    }
}

export { type Theme, type ThemeColors, ThemeManager, type ThemeRadii, type ThemeShadows, type ThemeSpacing, type ThemeTypography, boutiqueTheme, createAdminRoutes, createAuthRoutes, createHonoApp, createOrderFromStripeSession, createProductRoutes, createSessionMiddleware, createTheme, createWebhookRoutes, defaultRadii, defaultShadows, defaultSpacing, defaultTypography, generateCSSVariables, generateInlineThemeCSS, generateThemeCSS, getThemeStyles, minimalTheme, modernTheme, requireAuth, themeManager, themes };

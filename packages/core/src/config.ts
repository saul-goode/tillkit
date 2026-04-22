import { z } from 'zod';

// Image Provider Configurations
export const ExternalImageConfig = z.object({
  provider: z.literal('external'),
});

export const SharpImageConfig = z.object({
  provider: z.literal('sharp'),
  storage: z.union([
    z.object({ type: z.literal('filesystem'), path: z.string() }),
    z.object({ 
      type: z.literal('s3'),
      bucket: z.string(),
      region: z.string(),
      accessKeyId: z.string().optional(),
      secretAccessKey: z.string().optional(),
    }),
    z.object({
      type: z.literal('vercel-blob'),
      token: z.string().optional(),
    }),
  ]),
  sizes: z.array(z.object({
    name: z.string(),
    width: z.number(),
    height: z.number().optional(),
    fit: z.enum(['cover', 'contain', 'inside', 'outside']).optional(),
  })).optional(),
});

export const CloudinaryImageConfig = z.object({
  provider: z.literal('cloudinary'),
  cloudName: z.string(),
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
});

export const R2ImageConfig = z.object({
  provider: z.literal('r2'),
  accountId: z.string(),
  bucket: z.string(),
  accessKeyId: z.string(),
  secretAccessKey: z.string(),
  publicUrl: z.string().optional(),
});

export const ImageConfig = z.union([
  ExternalImageConfig,
  SharpImageConfig,
  CloudinaryImageConfig,
  R2ImageConfig,
]);

// Database Config (placeholder - each adapter defines its own)
export const DatabaseConfig = z.object({
  type: z.string(),
  // Adapter-specific config extends this
});

// Payment Config
export const StripeConfig = z.object({
  provider: z.literal('stripe'),
  publishableKey: z.string(),
  secretKey: z.string(),
  webhookSecret: z.string().optional(),
});

export const PaymentConfig = z.union([StripeConfig, z.object({ provider: z.literal('manual') })]);

// Theme Config
export const ThemeConfig = z.object({
  name: z.string(),
  css: z.string().optional(),
  layout: z.enum(['default', 'minimal', 'split']).optional(),
});

// Server Config
export const ServerConfig = z.object({
  port: z.number().default(3000),
  host: z.string().default('localhost'),
  dev: z.boolean().default(true),
  session: z.object({
    secret: z.string(),
    ttl: z.number().default(86400), // 24 hours
  }).optional(),
});

// Store Features Config
export const StoreFeaturesSchema = z.object({
  /** Enable product variants/options/SKU support */
  variants: z.boolean().default(true),
  /** Enable product collections/categories */
  collections: z.boolean().default(false),
  /** Enable inventory tracking */
  inventoryTracking: z.boolean().default(true),
  /** Enable subscription billing (future) */
  subscriptions: z.boolean().default(false),
  /** Enable multi-currency support (future) */
  multiCurrency: z.boolean().default(false),
});

export const StoreFeatures = StoreFeaturesSchema.parse;

// Main TillKit Config
export const TillKitConfigSchema = z.object({
  database: z.record(z.unknown()), // Typed at adapter level
  images: ImageConfig.optional(),
  payment: PaymentConfig.optional(),
  server: ServerConfig.optional(),
  theme: ThemeConfig.optional(),
  currency: z.object({
    default: z.string().default('USD'),
    supported: z.array(z.string()).optional(),
  }).optional(),
  features: StoreFeaturesSchema.optional(),
});

export type TillKitConfig = z.infer<typeof TillKitConfigSchema>;
export type ImageConfig = z.infer<typeof ImageConfig>;
export type PaymentConfig = z.infer<typeof PaymentConfig>;
export type ThemeConfig = z.infer<typeof ThemeConfig>;
export type ServerConfig = z.infer<typeof ServerConfig>;
export type StoreFeatures = z.infer<typeof StoreFeaturesSchema>;

// Helper function to define config with type safety
export function defineConfig(config: TillKitConfig): TillKitConfig {
  return TillKitConfigSchema.parse(config);
}

/** Default feature flags for a new store */
export function getDefaultFeatures(): StoreFeatures {
  return {
    variants: true,
    collections: false,
    inventoryTracking: true,
    subscriptions: false,
    multiCurrency: false,
  };
}

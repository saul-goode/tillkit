import { z } from 'zod';

declare const ExternalImageConfig: z.ZodObject<{
    provider: z.ZodLiteral<"external">;
}, "strip", z.ZodTypeAny, {
    provider: "external";
}, {
    provider: "external";
}>;
declare const SharpImageConfig: z.ZodObject<{
    provider: z.ZodLiteral<"sharp">;
    storage: z.ZodUnion<[z.ZodObject<{
        type: z.ZodLiteral<"filesystem">;
        path: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        path: string;
        type: "filesystem";
    }, {
        path: string;
        type: "filesystem";
    }>, z.ZodObject<{
        type: z.ZodLiteral<"s3">;
        bucket: z.ZodString;
        region: z.ZodString;
        accessKeyId: z.ZodOptional<z.ZodString>;
        secretAccessKey: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "s3";
        bucket: string;
        region: string;
        accessKeyId?: string | undefined;
        secretAccessKey?: string | undefined;
    }, {
        type: "s3";
        bucket: string;
        region: string;
        accessKeyId?: string | undefined;
        secretAccessKey?: string | undefined;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"vercel-blob">;
        token: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "vercel-blob";
        token?: string | undefined;
    }, {
        type: "vercel-blob";
        token?: string | undefined;
    }>]>;
    sizes: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        width: z.ZodNumber;
        height: z.ZodOptional<z.ZodNumber>;
        fit: z.ZodOptional<z.ZodEnum<["cover", "contain", "inside", "outside"]>>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        width: number;
        height?: number | undefined;
        fit?: "cover" | "contain" | "inside" | "outside" | undefined;
    }, {
        name: string;
        width: number;
        height?: number | undefined;
        fit?: "cover" | "contain" | "inside" | "outside" | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    provider: "sharp";
    storage: {
        path: string;
        type: "filesystem";
    } | {
        type: "s3";
        bucket: string;
        region: string;
        accessKeyId?: string | undefined;
        secretAccessKey?: string | undefined;
    } | {
        type: "vercel-blob";
        token?: string | undefined;
    };
    sizes?: {
        name: string;
        width: number;
        height?: number | undefined;
        fit?: "cover" | "contain" | "inside" | "outside" | undefined;
    }[] | undefined;
}, {
    provider: "sharp";
    storage: {
        path: string;
        type: "filesystem";
    } | {
        type: "s3";
        bucket: string;
        region: string;
        accessKeyId?: string | undefined;
        secretAccessKey?: string | undefined;
    } | {
        type: "vercel-blob";
        token?: string | undefined;
    };
    sizes?: {
        name: string;
        width: number;
        height?: number | undefined;
        fit?: "cover" | "contain" | "inside" | "outside" | undefined;
    }[] | undefined;
}>;
declare const CloudinaryImageConfig: z.ZodObject<{
    provider: z.ZodLiteral<"cloudinary">;
    cloudName: z.ZodString;
    apiKey: z.ZodOptional<z.ZodString>;
    apiSecret: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    provider: "cloudinary";
    cloudName: string;
    apiKey?: string | undefined;
    apiSecret?: string | undefined;
}, {
    provider: "cloudinary";
    cloudName: string;
    apiKey?: string | undefined;
    apiSecret?: string | undefined;
}>;
declare const R2ImageConfig: z.ZodObject<{
    provider: z.ZodLiteral<"r2">;
    accountId: z.ZodString;
    bucket: z.ZodString;
    accessKeyId: z.ZodString;
    secretAccessKey: z.ZodString;
    publicUrl: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    provider: "r2";
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    accountId: string;
    publicUrl?: string | undefined;
}, {
    provider: "r2";
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    accountId: string;
    publicUrl?: string | undefined;
}>;
declare const DatabaseConfig: z.ZodObject<{
    type: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: string;
}, {
    type: string;
}>;
declare const StripeConfig: z.ZodObject<{
    provider: z.ZodLiteral<"stripe">;
    publishableKey: z.ZodString;
    secretKey: z.ZodString;
    webhookSecret: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    provider: "stripe";
    publishableKey: string;
    secretKey: string;
    webhookSecret?: string | undefined;
}, {
    provider: "stripe";
    publishableKey: string;
    secretKey: string;
    webhookSecret?: string | undefined;
}>;
declare const StoreFeaturesSchema: z.ZodObject<{
    /** Enable product variants/options/SKU support */
    variants: z.ZodDefault<z.ZodBoolean>;
    /** Enable product collections/categories */
    collections: z.ZodDefault<z.ZodBoolean>;
    /** Enable inventory tracking */
    inventoryTracking: z.ZodDefault<z.ZodBoolean>;
    /** Enable subscription billing (future) */
    subscriptions: z.ZodDefault<z.ZodBoolean>;
    /** Enable multi-currency support (future) */
    multiCurrency: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    variants: boolean;
    collections: boolean;
    inventoryTracking: boolean;
    subscriptions: boolean;
    multiCurrency: boolean;
}, {
    variants?: boolean | undefined;
    collections?: boolean | undefined;
    inventoryTracking?: boolean | undefined;
    subscriptions?: boolean | undefined;
    multiCurrency?: boolean | undefined;
}>;
declare const TillKitConfigSchema: z.ZodObject<{
    database: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    images: z.ZodOptional<z.ZodUnion<[z.ZodObject<{
        provider: z.ZodLiteral<"external">;
    }, "strip", z.ZodTypeAny, {
        provider: "external";
    }, {
        provider: "external";
    }>, z.ZodObject<{
        provider: z.ZodLiteral<"sharp">;
        storage: z.ZodUnion<[z.ZodObject<{
            type: z.ZodLiteral<"filesystem">;
            path: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            path: string;
            type: "filesystem";
        }, {
            path: string;
            type: "filesystem";
        }>, z.ZodObject<{
            type: z.ZodLiteral<"s3">;
            bucket: z.ZodString;
            region: z.ZodString;
            accessKeyId: z.ZodOptional<z.ZodString>;
            secretAccessKey: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            type: "s3";
            bucket: string;
            region: string;
            accessKeyId?: string | undefined;
            secretAccessKey?: string | undefined;
        }, {
            type: "s3";
            bucket: string;
            region: string;
            accessKeyId?: string | undefined;
            secretAccessKey?: string | undefined;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"vercel-blob">;
            token: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            type: "vercel-blob";
            token?: string | undefined;
        }, {
            type: "vercel-blob";
            token?: string | undefined;
        }>]>;
        sizes: z.ZodOptional<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            width: z.ZodNumber;
            height: z.ZodOptional<z.ZodNumber>;
            fit: z.ZodOptional<z.ZodEnum<["cover", "contain", "inside", "outside"]>>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            width: number;
            height?: number | undefined;
            fit?: "cover" | "contain" | "inside" | "outside" | undefined;
        }, {
            name: string;
            width: number;
            height?: number | undefined;
            fit?: "cover" | "contain" | "inside" | "outside" | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        provider: "sharp";
        storage: {
            path: string;
            type: "filesystem";
        } | {
            type: "s3";
            bucket: string;
            region: string;
            accessKeyId?: string | undefined;
            secretAccessKey?: string | undefined;
        } | {
            type: "vercel-blob";
            token?: string | undefined;
        };
        sizes?: {
            name: string;
            width: number;
            height?: number | undefined;
            fit?: "cover" | "contain" | "inside" | "outside" | undefined;
        }[] | undefined;
    }, {
        provider: "sharp";
        storage: {
            path: string;
            type: "filesystem";
        } | {
            type: "s3";
            bucket: string;
            region: string;
            accessKeyId?: string | undefined;
            secretAccessKey?: string | undefined;
        } | {
            type: "vercel-blob";
            token?: string | undefined;
        };
        sizes?: {
            name: string;
            width: number;
            height?: number | undefined;
            fit?: "cover" | "contain" | "inside" | "outside" | undefined;
        }[] | undefined;
    }>, z.ZodObject<{
        provider: z.ZodLiteral<"cloudinary">;
        cloudName: z.ZodString;
        apiKey: z.ZodOptional<z.ZodString>;
        apiSecret: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        provider: "cloudinary";
        cloudName: string;
        apiKey?: string | undefined;
        apiSecret?: string | undefined;
    }, {
        provider: "cloudinary";
        cloudName: string;
        apiKey?: string | undefined;
        apiSecret?: string | undefined;
    }>, z.ZodObject<{
        provider: z.ZodLiteral<"r2">;
        accountId: z.ZodString;
        bucket: z.ZodString;
        accessKeyId: z.ZodString;
        secretAccessKey: z.ZodString;
        publicUrl: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        provider: "r2";
        bucket: string;
        accessKeyId: string;
        secretAccessKey: string;
        accountId: string;
        publicUrl?: string | undefined;
    }, {
        provider: "r2";
        bucket: string;
        accessKeyId: string;
        secretAccessKey: string;
        accountId: string;
        publicUrl?: string | undefined;
    }>]>>;
    payment: z.ZodOptional<z.ZodUnion<[z.ZodObject<{
        provider: z.ZodLiteral<"stripe">;
        publishableKey: z.ZodString;
        secretKey: z.ZodString;
        webhookSecret: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        provider: "stripe";
        publishableKey: string;
        secretKey: string;
        webhookSecret?: string | undefined;
    }, {
        provider: "stripe";
        publishableKey: string;
        secretKey: string;
        webhookSecret?: string | undefined;
    }>, z.ZodObject<{
        provider: z.ZodLiteral<"manual">;
    }, "strip", z.ZodTypeAny, {
        provider: "manual";
    }, {
        provider: "manual";
    }>]>>;
    server: z.ZodOptional<z.ZodObject<{
        port: z.ZodDefault<z.ZodNumber>;
        host: z.ZodDefault<z.ZodString>;
        dev: z.ZodDefault<z.ZodBoolean>;
        session: z.ZodOptional<z.ZodObject<{
            secret: z.ZodString;
            ttl: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            secret: string;
            ttl: number;
        }, {
            secret: string;
            ttl?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        port: number;
        host: string;
        dev: boolean;
        session?: {
            secret: string;
            ttl: number;
        } | undefined;
    }, {
        port?: number | undefined;
        host?: string | undefined;
        dev?: boolean | undefined;
        session?: {
            secret: string;
            ttl?: number | undefined;
        } | undefined;
    }>>;
    theme: z.ZodOptional<z.ZodObject<{
        name: z.ZodString;
        css: z.ZodOptional<z.ZodString>;
        layout: z.ZodOptional<z.ZodEnum<["default", "minimal", "split"]>>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        css?: string | undefined;
        layout?: "default" | "minimal" | "split" | undefined;
    }, {
        name: string;
        css?: string | undefined;
        layout?: "default" | "minimal" | "split" | undefined;
    }>>;
    currency: z.ZodOptional<z.ZodObject<{
        default: z.ZodDefault<z.ZodString>;
        supported: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        default: string;
        supported?: string[] | undefined;
    }, {
        default?: string | undefined;
        supported?: string[] | undefined;
    }>>;
    features: z.ZodOptional<z.ZodObject<{
        /** Enable product variants/options/SKU support */
        variants: z.ZodDefault<z.ZodBoolean>;
        /** Enable product collections/categories */
        collections: z.ZodDefault<z.ZodBoolean>;
        /** Enable inventory tracking */
        inventoryTracking: z.ZodDefault<z.ZodBoolean>;
        /** Enable subscription billing (future) */
        subscriptions: z.ZodDefault<z.ZodBoolean>;
        /** Enable multi-currency support (future) */
        multiCurrency: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        variants: boolean;
        collections: boolean;
        inventoryTracking: boolean;
        subscriptions: boolean;
        multiCurrency: boolean;
    }, {
        variants?: boolean | undefined;
        collections?: boolean | undefined;
        inventoryTracking?: boolean | undefined;
        subscriptions?: boolean | undefined;
        multiCurrency?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    database: Record<string, unknown>;
    images?: {
        provider: "external";
    } | {
        provider: "sharp";
        storage: {
            path: string;
            type: "filesystem";
        } | {
            type: "s3";
            bucket: string;
            region: string;
            accessKeyId?: string | undefined;
            secretAccessKey?: string | undefined;
        } | {
            type: "vercel-blob";
            token?: string | undefined;
        };
        sizes?: {
            name: string;
            width: number;
            height?: number | undefined;
            fit?: "cover" | "contain" | "inside" | "outside" | undefined;
        }[] | undefined;
    } | {
        provider: "cloudinary";
        cloudName: string;
        apiKey?: string | undefined;
        apiSecret?: string | undefined;
    } | {
        provider: "r2";
        bucket: string;
        accessKeyId: string;
        secretAccessKey: string;
        accountId: string;
        publicUrl?: string | undefined;
    } | undefined;
    payment?: {
        provider: "stripe";
        publishableKey: string;
        secretKey: string;
        webhookSecret?: string | undefined;
    } | {
        provider: "manual";
    } | undefined;
    server?: {
        port: number;
        host: string;
        dev: boolean;
        session?: {
            secret: string;
            ttl: number;
        } | undefined;
    } | undefined;
    theme?: {
        name: string;
        css?: string | undefined;
        layout?: "default" | "minimal" | "split" | undefined;
    } | undefined;
    currency?: {
        default: string;
        supported?: string[] | undefined;
    } | undefined;
    features?: {
        variants: boolean;
        collections: boolean;
        inventoryTracking: boolean;
        subscriptions: boolean;
        multiCurrency: boolean;
    } | undefined;
}, {
    database: Record<string, unknown>;
    images?: {
        provider: "external";
    } | {
        provider: "sharp";
        storage: {
            path: string;
            type: "filesystem";
        } | {
            type: "s3";
            bucket: string;
            region: string;
            accessKeyId?: string | undefined;
            secretAccessKey?: string | undefined;
        } | {
            type: "vercel-blob";
            token?: string | undefined;
        };
        sizes?: {
            name: string;
            width: number;
            height?: number | undefined;
            fit?: "cover" | "contain" | "inside" | "outside" | undefined;
        }[] | undefined;
    } | {
        provider: "cloudinary";
        cloudName: string;
        apiKey?: string | undefined;
        apiSecret?: string | undefined;
    } | {
        provider: "r2";
        bucket: string;
        accessKeyId: string;
        secretAccessKey: string;
        accountId: string;
        publicUrl?: string | undefined;
    } | undefined;
    payment?: {
        provider: "stripe";
        publishableKey: string;
        secretKey: string;
        webhookSecret?: string | undefined;
    } | {
        provider: "manual";
    } | undefined;
    server?: {
        port?: number | undefined;
        host?: string | undefined;
        dev?: boolean | undefined;
        session?: {
            secret: string;
            ttl?: number | undefined;
        } | undefined;
    } | undefined;
    theme?: {
        name: string;
        css?: string | undefined;
        layout?: "default" | "minimal" | "split" | undefined;
    } | undefined;
    currency?: {
        default?: string | undefined;
        supported?: string[] | undefined;
    } | undefined;
    features?: {
        variants?: boolean | undefined;
        collections?: boolean | undefined;
        inventoryTracking?: boolean | undefined;
        subscriptions?: boolean | undefined;
        multiCurrency?: boolean | undefined;
    } | undefined;
}>;
type TillKitConfig = z.infer<typeof TillKitConfigSchema>;
declare const ImageConfig: z.ZodUnion<[z.ZodObject<{
    provider: z.ZodLiteral<"external">;
}, "strip", z.ZodTypeAny, {
    provider: "external";
}, {
    provider: "external";
}>, z.ZodObject<{
    provider: z.ZodLiteral<"sharp">;
    storage: z.ZodUnion<[z.ZodObject<{
        type: z.ZodLiteral<"filesystem">;
        path: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        path: string;
        type: "filesystem";
    }, {
        path: string;
        type: "filesystem";
    }>, z.ZodObject<{
        type: z.ZodLiteral<"s3">;
        bucket: z.ZodString;
        region: z.ZodString;
        accessKeyId: z.ZodOptional<z.ZodString>;
        secretAccessKey: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "s3";
        bucket: string;
        region: string;
        accessKeyId?: string | undefined;
        secretAccessKey?: string | undefined;
    }, {
        type: "s3";
        bucket: string;
        region: string;
        accessKeyId?: string | undefined;
        secretAccessKey?: string | undefined;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"vercel-blob">;
        token: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "vercel-blob";
        token?: string | undefined;
    }, {
        type: "vercel-blob";
        token?: string | undefined;
    }>]>;
    sizes: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        width: z.ZodNumber;
        height: z.ZodOptional<z.ZodNumber>;
        fit: z.ZodOptional<z.ZodEnum<["cover", "contain", "inside", "outside"]>>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        width: number;
        height?: number | undefined;
        fit?: "cover" | "contain" | "inside" | "outside" | undefined;
    }, {
        name: string;
        width: number;
        height?: number | undefined;
        fit?: "cover" | "contain" | "inside" | "outside" | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    provider: "sharp";
    storage: {
        path: string;
        type: "filesystem";
    } | {
        type: "s3";
        bucket: string;
        region: string;
        accessKeyId?: string | undefined;
        secretAccessKey?: string | undefined;
    } | {
        type: "vercel-blob";
        token?: string | undefined;
    };
    sizes?: {
        name: string;
        width: number;
        height?: number | undefined;
        fit?: "cover" | "contain" | "inside" | "outside" | undefined;
    }[] | undefined;
}, {
    provider: "sharp";
    storage: {
        path: string;
        type: "filesystem";
    } | {
        type: "s3";
        bucket: string;
        region: string;
        accessKeyId?: string | undefined;
        secretAccessKey?: string | undefined;
    } | {
        type: "vercel-blob";
        token?: string | undefined;
    };
    sizes?: {
        name: string;
        width: number;
        height?: number | undefined;
        fit?: "cover" | "contain" | "inside" | "outside" | undefined;
    }[] | undefined;
}>, z.ZodObject<{
    provider: z.ZodLiteral<"cloudinary">;
    cloudName: z.ZodString;
    apiKey: z.ZodOptional<z.ZodString>;
    apiSecret: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    provider: "cloudinary";
    cloudName: string;
    apiKey?: string | undefined;
    apiSecret?: string | undefined;
}, {
    provider: "cloudinary";
    cloudName: string;
    apiKey?: string | undefined;
    apiSecret?: string | undefined;
}>, z.ZodObject<{
    provider: z.ZodLiteral<"r2">;
    accountId: z.ZodString;
    bucket: z.ZodString;
    accessKeyId: z.ZodString;
    secretAccessKey: z.ZodString;
    publicUrl: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    provider: "r2";
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    accountId: string;
    publicUrl?: string | undefined;
}, {
    provider: "r2";
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    accountId: string;
    publicUrl?: string | undefined;
}>]>;
type ImageConfig = z.infer<typeof ImageConfig>;
declare const PaymentConfig: z.ZodUnion<[z.ZodObject<{
    provider: z.ZodLiteral<"stripe">;
    publishableKey: z.ZodString;
    secretKey: z.ZodString;
    webhookSecret: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    provider: "stripe";
    publishableKey: string;
    secretKey: string;
    webhookSecret?: string | undefined;
}, {
    provider: "stripe";
    publishableKey: string;
    secretKey: string;
    webhookSecret?: string | undefined;
}>, z.ZodObject<{
    provider: z.ZodLiteral<"manual">;
}, "strip", z.ZodTypeAny, {
    provider: "manual";
}, {
    provider: "manual";
}>]>;
type PaymentConfig = z.infer<typeof PaymentConfig>;
declare const ThemeConfig: z.ZodObject<{
    name: z.ZodString;
    css: z.ZodOptional<z.ZodString>;
    layout: z.ZodOptional<z.ZodEnum<["default", "minimal", "split"]>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    css?: string | undefined;
    layout?: "default" | "minimal" | "split" | undefined;
}, {
    name: string;
    css?: string | undefined;
    layout?: "default" | "minimal" | "split" | undefined;
}>;
type ThemeConfig = z.infer<typeof ThemeConfig>;
declare const ServerConfig: z.ZodObject<{
    port: z.ZodDefault<z.ZodNumber>;
    host: z.ZodDefault<z.ZodString>;
    dev: z.ZodDefault<z.ZodBoolean>;
    session: z.ZodOptional<z.ZodObject<{
        secret: z.ZodString;
        ttl: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        secret: string;
        ttl: number;
    }, {
        secret: string;
        ttl?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    port: number;
    host: string;
    dev: boolean;
    session?: {
        secret: string;
        ttl: number;
    } | undefined;
}, {
    port?: number | undefined;
    host?: string | undefined;
    dev?: boolean | undefined;
    session?: {
        secret: string;
        ttl?: number | undefined;
    } | undefined;
}>;
type ServerConfig = z.infer<typeof ServerConfig>;
declare const StoreFeatures: (data: unknown, params?: z.util.InexactPartial<z.ParseParams>) => {
    variants: boolean;
    collections: boolean;
    inventoryTracking: boolean;
    subscriptions: boolean;
    multiCurrency: boolean;
};
type StoreFeatures = z.infer<typeof StoreFeaturesSchema>;
declare function defineConfig(config: TillKitConfig): TillKitConfig;
/** Default feature flags for a new store */
declare function getDefaultFeatures(): StoreFeatures;

interface Product {
    id: string;
    slug: string;
    name: string;
    description?: string;
    price: number;
    compareAtPrice?: number;
    images: ProductImage[];
    variants?: ProductVariant[];
    options?: ProductOption[];
    inventory?: Inventory;
    seo?: SeoMetadata;
    metadata?: Record<string, unknown>;
    status: 'draft' | 'active' | 'archived';
    createdAt: Date;
    updatedAt: Date;
}
interface ProductImage {
    id: string;
    url: string;
    alt?: string;
    width?: number;
    height?: number;
}
interface ProductVariant {
    id: string;
    sku: string;
    barcode?: string;
    name: string;
    price?: number;
    compareAtPrice?: number;
    weight?: number;
    dimensions?: {
        length?: number;
        width?: number;
        height?: number;
    };
    inventory?: Inventory;
    images?: ProductImage[];
    options: Record<string, string>;
}
interface ProductOption {
    name: string;
    values: string[];
}
interface Inventory {
    quantity: number;
    reserved?: number;
    available: number;
    allowOutOfStock: boolean;
}
interface SeoMetadata {
    title?: string;
    description?: string;
    keywords?: string[];
    image?: string;
}
interface Cart {
    id: string;
    sessionId: string;
    customerId?: string;
    items: CartItem[];
    subtotal: number;
    totalTax: number;
    totalShipping: number;
    totalDiscount: number;
    total: number;
    currency: string;
    createdAt: Date;
    updatedAt: Date;
}
interface CartItem {
    id: string;
    productId: string;
    variantId?: string;
    name: string;
    sku: string;
    price: number;
    quantity: number;
    lineTotal: number;
    image?: ProductImage;
}
type OrderStatus = 'pending' | 'confirmed' | 'paid' | 'fulfilled' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
type PaymentStatus = 'pending' | 'authorized' | 'paid' | 'partially_refunded' | 'refunded' | 'failed';
type FulfillmentStatus = 'unfulfilled' | 'partially_fulfilled' | 'fulfilled' | 'returned';
interface Order {
    id: string;
    orderNumber: string;
    customerId?: string;
    email: string;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    fulfillmentStatus: FulfillmentStatus;
    items: OrderItem[];
    subtotal: number;
    totalTax: number;
    totalShipping: number;
    totalDiscount: number;
    total: number;
    currency: string;
    shippingAddress: Address;
    billingAddress: Address;
    transactions: Transaction[];
    notes?: string;
    metadata?: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}
interface OrderItem {
    id: string;
    productId: string;
    variantId?: string;
    name: string;
    sku: string;
    price: number;
    quantity: number;
    total: number;
    image?: ProductImage;
}
interface Address {
    firstName?: string;
    lastName?: string;
    company?: string;
    address1: string;
    address2?: string;
    city: string;
    province?: string;
    postalCode: string;
    country: string;
    phone?: string;
}
interface Transaction {
    id: string;
    kind: 'authorization' | 'capture' | 'sale' | 'refund' | 'void';
    status: 'pending' | 'success' | 'failure';
    amount: number;
    currency: string;
    gateway: string;
    parentId?: string;
    processedAt?: Date;
    metadata?: Record<string, unknown>;
}
interface Customer {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    addresses: Address[];
    defaultAddressId?: string;
    metadata?: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}
interface Collection {
    id: string;
    slug: string;
    name: string;
    description?: string;
    image?: ProductImage;
    products?: Product[];
    seo?: SeoMetadata;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
}
type ProductInput$1 = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>;
type CartItemInput$1 = Omit<CartItem, 'id' | 'lineTotal'>;
type OrderInput$1 = Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'updatedAt'>;
type TransactionInput$1 = Omit<Transaction, 'id'>;
type CustomerInput$1 = Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>;

/** Setup result from database adapter initialization */
interface SetupResult {
    /** Whether this was a fresh setup or an existing store */
    created: boolean;
    /** List of collections/tables that were created */
    createdCollections: string[];
}
interface QueryOptions {
    limit?: number;
    offset?: number;
    sort?: string;
    order?: 'asc' | 'desc';
    filters?: Record<string, unknown>;
}
interface PaginatedResult<T> {
    items: T[];
    total: number;
    page: number;
    perPage: number;
    hasMore: boolean;
}
interface ProductInput {
    slug: string;
    name: string;
    description?: string;
    price: number;
    compareAtPrice?: number;
    images?: any[];
    variants?: any[];
    options?: any[];
    inventory?: any;
    seo?: any;
    metadata?: Record<string, unknown>;
    status: 'draft' | 'active' | 'archived';
}
interface CartItemInput {
    productId: string;
    variantId?: string;
    name: string;
    sku: string;
    price: number;
    quantity: number;
    image?: any;
}
interface OrderInput {
    customerId?: string;
    email: string;
    status?: 'pending' | 'confirmed' | 'paid' | 'fulfilled' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
    paymentStatus?: 'pending' | 'authorized' | 'paid' | 'partially_refunded' | 'refunded' | 'failed';
    fulfillmentStatus?: 'unfulfilled' | 'partially_fulfilled' | 'fulfilled' | 'returned';
    items?: any[];
    subtotal?: number;
    totalTax?: number;
    totalShipping?: number;
    totalDiscount?: number;
    total?: number;
    currency?: string;
    shippingAddress?: any;
    billingAddress?: any;
    transactions?: any[];
    notes?: string;
    metadata?: Record<string, unknown>;
}
interface TransactionInput {
    kind: 'authorization' | 'capture' | 'sale' | 'refund' | 'void';
    status: 'pending' | 'success' | 'failure';
    amount: number;
    currency: string;
    gateway: string;
    parentId?: string;
    processedAt?: Date;
    metadata?: Record<string, unknown>;
}
interface CustomerInput {
    email: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    addresses?: any[];
    defaultAddressId?: string;
    metadata?: Record<string, unknown>;
}
interface DatabaseAdapter {
    products: {
        list(options?: QueryOptions): Promise<PaginatedResult<Product>>;
        get(id: string): Promise<Product | null>;
        getBySlug(slug: string): Promise<Product | null>;
        create(data: ProductInput): Promise<Product>;
        update(id: string, data: Partial<ProductInput>): Promise<Product>;
        delete(id: string): Promise<void>;
        search(query: string): Promise<Product[]>;
    };
    cart: {
        get(sessionId: string): Promise<Cart | null>;
        create(sessionId: string): Promise<Cart>;
        update(sessionId: string, updates: Partial<Cart>): Promise<Cart>;
        addItem(sessionId: string, item: CartItemInput): Promise<Cart>;
        updateItem(sessionId: string, itemId: string, quantity: number): Promise<Cart>;
        removeItem(sessionId: string, itemId: string): Promise<Cart>;
        clear(sessionId: string): Promise<void>;
    };
    orders: {
        list(options?: QueryOptions): Promise<PaginatedResult<Order>>;
        get(id: string): Promise<Order | null>;
        getByNumber(orderNumber: string): Promise<Order | null>;
        create(data: OrderInput): Promise<Order>;
        update(id: string, data: Partial<OrderInput>): Promise<Order>;
        addTransaction(orderId: string, transaction: TransactionInput): Promise<Order>;
        updateStatus(id: string, status: Order['status']): Promise<Order>;
    };
    customers: {
        get(id: string): Promise<Customer | null>;
        getByEmail(email: string): Promise<Customer | null>;
        create(data: CustomerInput): Promise<Customer>;
        update(id: string, data: Partial<CustomerInput>): Promise<Customer>;
        addAddress(customerId: string, address: any): Promise<Customer>;
    };
    setup(features: StoreFeatures): Promise<SetupResult>;
}

interface AddToCartInput {
    productId: string;
    variantId?: string;
    quantity: number;
}
declare function calculateLineTotal(item: CartItem): number;
declare function calculateCartTotals(cart: Cart): {
    subtotal: number;
    total: number;
};
declare function addToCart(cart: Cart, product: Product, quantity: number, variant?: ProductVariant): Cart;
declare function updateCartItemQuantity(cart: Cart, itemId: string, quantity: number): Cart;
declare function removeFromCart(cart: Cart, itemId: string): Cart;
declare function clearCart(cart: Cart): Cart;
declare function getCartItemCount(cart: Cart): number;
declare function isCartEmpty(cart: Cart): boolean;

declare function getAvailableInventory(product: Product, variant?: ProductVariant): number;
declare function isVariantAvailable(product: Product, variant?: ProductVariant): boolean;
declare function getDisplayPrice(product: Product, variant?: ProductVariant): number;
declare function getCompareAtPrice(product: Product, variant?: ProductVariant): number | undefined;
declare function isOnSale(product: Product, variant?: ProductVariant): boolean;
declare function getDiscountPercentage(product: Product, variant?: ProductVariant): number;
declare function formatPrice(cents: number, currency?: string, locale?: string): string;
declare function findVariantByOptions(product: Product, options: Record<string, string>): ProductVariant | undefined;
declare function getOptionAvailability(product: Product, selectedOptions: Record<string, string>): Record<string, string[]>;

interface TaxRate {
    country: string;
    province?: string;
    rate: number;
}
declare function calculateTax(subtotal: number, address: {
    country: string;
    province?: string;
}, taxRates: TaxRate[]): number;
interface ShippingRate {
    id: string;
    name: string;
    price: number;
    estimatedDays?: number;
}
declare function calculateShipping(_cart: Cart, rates: ShippingRate[], selectedRateId?: string): {
    shipping: number;
    rate?: ShippingRate;
};
interface Discount$1 {
    type: 'percentage' | 'fixed';
    value: number;
    code?: string;
    applyTo: 'order' | 'product' | 'shipping';
}
declare function calculateDiscount(subtotal: number, discounts: Discount$1[]): number;
declare function calculateOrderTotal(subtotal: number, tax: number, shipping: number, discounts: number): number;
declare function formatCents(cents: number): string;
declare function convertCurrency(cents: number, from: string, to: string, rates: Record<string, number>): number;

interface InventoryConfig {
    enableReservations?: boolean;
    reservationDurationMinutes?: number;
    lowStockThreshold?: number;
    allowBackorders?: boolean;
}
interface StockLevel {
    productId: string;
    variantId?: string;
    sku: string;
    totalQuantity: number;
    availableQuantity: number;
    reservedQuantity: number;
    threshold: number;
    status: 'in_stock' | 'low_stock' | 'out_of_stock';
}
interface StockReservation {
    id: string;
    sessionId: string;
    productId: string;
    variantId?: string;
    quantity: number;
    expiresAt: Date;
    createdAt: Date;
}
interface InventoryUpdate {
    productId: string;
    variantId?: string;
    delta: number;
    reason: 'sale' | 'return' | 'restock' | 'adjustment' | 'reservation' | 'release';
    orderId?: string;
    notes?: string;
}
declare class InventoryManager {
    private config;
    private reservations;
    private stockLevels;
    constructor(config?: InventoryConfig);
    initializeStock(productId: string, sku: string, totalQuantity: number, variantId?: string, threshold?: number): StockLevel;
    getStock(productId: string, variantId?: string): StockLevel | undefined;
    isAvailable(productId: string, quantity: number, variantId?: string): boolean;
    reserveStock(sessionId: string, productId: string, quantity: number, variantId?: string): {
        success: boolean;
        reservation?: StockReservation;
        error?: string;
    };
    releaseStock(reservationId: string): boolean;
    commitStock(reservationId: string): boolean;
    adjustStock(update: InventoryUpdate): StockLevel | undefined;
    getLowStock(): StockLevel[];
    getSessionReservations(sessionId: string): StockReservation[];
    releaseSessionReservations(sessionId: string): number;
    private cleanupExpiredReservations;
    private getKey;
    private calculateStatus;
}
declare function inventoryFromProducts(products: Product[], config?: InventoryConfig): InventoryManager;

type DiscountType = 'percentage' | 'fixed_amount' | 'free_shipping' | 'buy_x_get_y';
type DiscountTarget = 'order' | 'line_item' | 'shipping';
interface Discount {
    id: string;
    code?: string;
    name: string;
    description?: string;
    type: DiscountType;
    target: DiscountTarget;
    amount: number;
    currency?: string;
    minPurchase?: number;
    maxDiscount?: number;
    usageLimit?: number;
    usageCount: number;
    startsAt?: Date;
    expiresAt?: Date;
    appliesTo?: {
        productIds?: string[];
        variantIds?: string[];
        collections?: string[];
        excludedProductIds?: string[];
    };
    buyXGetY?: {
        buyQuantity: number;
        getQuantity: number;
        getPercentageOff: number;
    };
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
}
interface AppliedDiscount {
    id: string;
    code?: string;
    name: string;
    type: DiscountType;
    target: DiscountTarget;
    amount: number;
    description: string;
}
interface DiscountResult {
    valid: boolean;
    discount?: AppliedDiscount;
    error?: string;
}
declare class DiscountEngine {
    private discounts;
    addDiscount(discount: Discount): void;
    removeDiscount(id: string): boolean;
    getByCode(code: string): Discount | undefined;
    applyCode(code: string, cart: Cart): DiscountResult;
    validateAndApply(discount: Discount, cart: Cart): DiscountResult;
    private calculateDiscountAmount;
    private calculateOrderDiscount;
    private calculateLineItemDiscount;
    private itemApplies;
    private formatDescription;
    getAutomaticDiscounts(cart: Cart): AppliedDiscount[];
    getBestAutomaticDiscount(cart: Cart): AppliedDiscount | undefined;
    incrementUsage(discountId: string): void;
    getStats(): Array<Pick<Discount, 'id' | 'code' | 'name' | 'usageLimit' | 'usageCount'>>;
}
declare const DiscountPresets: {
    percentageOff: (code: string, percentage: number, options?: Partial<Omit<Discount, "id" | "code" | "type" | "amount">>) => Discount;
    fixedOff: (code: string, amount: number, options?: Partial<Omit<Discount, "id" | "code" | "type" | "amount">>) => Discount;
    freeShipping: (code: string, options?: Partial<Omit<Discount, "id" | "code" | "type" | "amount" | "target">>) => Discount;
    buyXGetY: (code: string, buyQty: number, getQty: number, getPercentOff?: number, options?: Partial<Omit<Discount, "id" | "code" | "type" | "buyXGetY">>) => Discount;
};
declare function createDiscountEngine(discounts?: Discount[]): DiscountEngine;

export { type AddToCartInput, type Address, type AppliedDiscount, type Cart, type CartItem, type CartItemInput$1 as CartItemInput, CloudinaryImageConfig, type Collection, type Customer, type CustomerInput$1 as CustomerInput, type DatabaseAdapter, DatabaseConfig, type Discount$1 as Discount, DiscountEngine, DiscountPresets, type DiscountResult, type DiscountTarget, type DiscountType, ExternalImageConfig, type FulfillmentStatus, ImageConfig, type Inventory, type InventoryConfig, InventoryManager, type InventoryUpdate, type Order, type OrderInput$1 as OrderInput, type OrderItem, type OrderStatus, PaymentConfig, type PaymentStatus, type Product, type ProductImage, type ProductInput$1 as ProductInput, type ProductOption, type ProductVariant, type Discount as PromoDiscount, R2ImageConfig, type SeoMetadata, ServerConfig, type SetupResult, SharpImageConfig, type ShippingRate, type StockLevel, type StockReservation, StoreFeatures, StoreFeaturesSchema, StripeConfig, type TaxRate, ThemeConfig, type TillKitConfig, TillKitConfigSchema, type Transaction, type TransactionInput$1 as TransactionInput, addToCart, calculateCartTotals, calculateDiscount, calculateLineTotal, calculateOrderTotal, calculateShipping, calculateTax, clearCart, convertCurrency, createDiscountEngine, defineConfig, findVariantByOptions, formatCents, formatPrice, getAvailableInventory, getCartItemCount, getCompareAtPrice, getDefaultFeatures, getDiscountPercentage, getDisplayPrice, getOptionAvailability, inventoryFromProducts, isCartEmpty, isOnSale, isVariantAvailable, removeFromCart, updateCartItemQuantity };

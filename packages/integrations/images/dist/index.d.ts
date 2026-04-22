interface ImageUploadOptions {
    width?: number;
    height?: number;
    fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
    quality?: number;
    format?: 'jpeg' | 'png' | 'webp' | 'avif' | 'auto';
    crop?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}
interface ImageResult {
    url: string;
    key: string;
    width?: number;
    height?: number;
    format?: string;
    size?: number;
    variants?: Record<string, string>;
}
interface ImageProvider {
    upload(file: Buffer | ArrayBuffer, filename: string, options?: ImageUploadOptions): Promise<ImageResult>;
    delete(key: string): Promise<void>;
    getUrl(key: string, options?: {
        width?: number;
        height?: number;
    }): string;
    getVariants(key: string): Record<string, string>;
}
declare const DEFAULT_IMAGE_SIZES: ({
    name: string;
    width: number;
    height: number;
    fit: "cover";
} | {
    name: string;
    width: number;
    fit: "inside";
    height?: undefined;
})[];
interface SharpConfig {
    provider: 'sharp';
    storage: 'local' | 's3' | 'r2';
    localPath?: string;
    s3Config?: {
        bucket: string;
        region: string;
        accessKeyId: string;
        secretAccessKey: string;
        endpoint?: string;
    };
    sizes?: typeof DEFAULT_IMAGE_SIZES;
    quality?: number;
    baseUrl: string;
}
declare function sharpProvider(config: SharpConfig): ImageProvider;
interface CloudinaryConfig {
    provider: 'cloudinary';
    cloudName: string;
    apiKey: string;
    apiSecret: string;
    folder?: string;
    sizes?: typeof DEFAULT_IMAGE_SIZES;
}
declare function cloudinaryProvider(config: CloudinaryConfig): ImageProvider;
interface R2Config {
    provider: 'r2';
    accountId: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    customDomain?: string;
    sizes?: typeof DEFAULT_IMAGE_SIZES;
    useCloudflareImages?: boolean;
}
declare function r2Provider(config: R2Config): ImageProvider;
interface ExternalConfig {
    provider: 'external';
}
declare function externalProvider(): ImageProvider;
interface ImageService {
    provider: ImageProvider;
    sizes: typeof DEFAULT_IMAGE_SIZES;
    uploadProductImage(file: Buffer | ArrayBuffer, filename: string): Promise<ImageResult>;
    uploadVariantImage(file: Buffer | ArrayBuffer, filename: string): Promise<ImageResult>;
    deleteImage(key: string): Promise<void>;
    getResponsiveSrcSet(key: string): string;
}
declare function createImageService(provider: ImageProvider, sizes?: ({
    name: string;
    width: number;
    height: number;
    fit: "cover";
} | {
    name: string;
    width: number;
    fit: "inside";
    height?: undefined;
})[]): ImageService;
type ImageConfig = SharpConfig | CloudinaryConfig | R2Config | ExternalConfig;
declare function createImageProvider(config: ImageConfig): ImageProvider;

export { type CloudinaryConfig, DEFAULT_IMAGE_SIZES, type ExternalConfig, type ImageConfig, type ImageProvider, type ImageResult, type ImageService, type ImageUploadOptions, type R2Config, type SharpConfig, cloudinaryProvider, createImageProvider, createImageService, externalProvider, r2Provider, sharpProvider };

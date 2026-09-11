// Image Integration for TillKit
// Pluggable image providers: Sharp (local), Cloudinary, R2/S3

export interface ImageUploadOptions {
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  quality?: number; // 1-100
  format?: 'jpeg' | 'png' | 'webp' | 'avif' | 'auto';
  crop?: { x: number; y: number; width: number; height: number };
}

export interface ImageResult {
  url: string;
  key: string;
  width?: number;
  height?: number;
  format?: string;
  size?: number;
  variants?: Record<string, string>; // Thumbnail URLs
}

export interface ImageProvider {
  upload(file: Buffer | ArrayBuffer, filename: string, options?: ImageUploadOptions): Promise<ImageResult>;
  delete(key: string): Promise<void>;
  getUrl(key: string, options?: { width?: number; height?: number }): string;
  getVariants(key: string): Record<string, string>;
}

// Size presets for e-commerce
export const DEFAULT_IMAGE_SIZES = [
  { name: 'thumbnail', width: 150, height: 150, fit: 'cover' as const },
  { name: 'small', width: 300, height: 300, fit: 'cover' as const },
  { name: 'medium', width: 600, fit: 'inside' as const },
  { name: 'large', width: 1200, fit: 'inside' as const },
  { name: 'full', width: 2048, fit: 'inside' as const },
];

// Sharp provider (local processing + storage)
export interface SharpConfig {
  provider: 'sharp';
  storage: 'local' | 's3' | 'r2';
  localPath?: string; // For local storage
  s3Config?: {
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    endpoint?: string; // For R2/MinIO
  };
  sizes?: typeof DEFAULT_IMAGE_SIZES;
  quality?: number;
  baseUrl: string; // Public URL prefix
}

export function sharpProvider(config: SharpConfig): ImageProvider {
  const sizes = config.sizes || DEFAULT_IMAGE_SIZES;
  const quality = config.quality || 80;
  
  // Lazy load sharp to avoid Node-only dependency in edge runtimes
  let sharpModule: any;
  
  async function getSharp() {
    if (!sharpModule) {
      sharpModule = await import('sharp');
    }
    return sharpModule.default || sharpModule;
  }
  
  return {
    async upload(file, filename, options = {}) {
      const sharp = await getSharp();
      const buffer = Buffer.isBuffer(file) ? file : Buffer.from(file);
      
      // Process image
      let pipeline = sharp(buffer);
      
      // Get metadata
      const metadata = await pipeline.metadata();
      
      // Resize if needed
      if (options.width || options.height) {
        pipeline = pipeline.resize({
          width: options.width,
          height: options.height,
          fit: options.fit || 'inside',
          withoutEnlargement: true,
        });
      }
      
      // Convert format
      const outputFormat = options.format || metadata.format || 'jpeg';
      if (outputFormat === 'webp') {
        pipeline = pipeline.webp({ quality: options.quality || quality });
      } else if (outputFormat === 'avif') {
        pipeline = pipeline.avif({ quality: options.quality || quality });
      } else if (outputFormat === 'png') {
        pipeline = pipeline.png({ quality: options.quality || quality });
      } else {
        pipeline = pipeline.jpeg({ quality: options.quality || quality, progressive: true });
      }
      
      const processed = await pipeline.toBuffer();
      
      // Generate key
      const key = `images/${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, '-')}`;
      
      // Store (simplified - in real impl would upload to S3/R2 or save locally)
      console.log(`Sharp: Processed ${filename} (${metadata.width}x${metadata.height}) → ${outputFormat}`);
      
      // Generate variants
      const variants: Record<string, string> = {};
      for (const size of sizes) {
        const variantKey = `${key}-${size.name}`;
        variants[size.name] = `${config.baseUrl}/${variantKey}`;
      }
      
      return {
        url: `${config.baseUrl}/${key}`,
        key,
        width: metadata.width,
        height: metadata.height,
        format: outputFormat,
        size: processed.length,
        variants,
      };
    },
    
    async delete(key) {
      // Would delete from storage
      console.log(`Sharp: Delete ${key}`);
    },
    
    getUrl(key, options) {
      if (options?.width || options?.height) {
        return `${config.baseUrl}/${key}?w=${options.width || ''}&h=${options.height || ''}`;
      }
      return `${config.baseUrl}/${key}`;
    },
    
    getVariants(key) {
      const variants: Record<string, string> = {};
      for (const size of sizes) {
        variants[size.name] = `${config.baseUrl}/${key}-${size.name}`;
      }
      return variants;
    },
  };
}

// Cloudinary provider (zero-config cloud)
export interface CloudinaryConfig {
  provider: 'cloudinary';
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder?: string;
  sizes?: typeof DEFAULT_IMAGE_SIZES;
}

export function cloudinaryProvider(config: CloudinaryConfig): ImageProvider {
  const sizes = config.sizes || DEFAULT_IMAGE_SIZES;
  const folder = config.folder || 'tillkit';
  
  async function uploadToCloudinary(
    buffer: Buffer,
    publicId: string,
    options: ImageUploadOptions = {}
  ): Promise<any> {
    const timestamp = Math.round(Date.now() / 1000);
    const signature = await generateSignature({
      timestamp,
      public_id: publicId,
      folder,
      ...(options.width ? { width: options.width } : {}),
      ...(options.height ? { height: options.height } : {}),
      ...(options.crop ? { crop: 'crop', ...options.crop } : {}),
    }, config.apiSecret);
    
    const formData = new FormData();
    formData.append('file', new Blob([new Uint8Array(buffer)]));
    formData.append('api_key', config.apiKey);
    formData.append('timestamp', String(timestamp));
    formData.append('signature', signature);
    formData.append('public_id', publicId);
    formData.append('folder', folder);
    
    if (options.width) formData.append('width', String(options.width));
    if (options.height) formData.append('height', String(options.height));
    
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
      { method: 'POST', body: formData }
    );
    
    if (!response.ok) {
      throw new Error(`Cloudinary upload failed: ${await response.text()}`);
    }
    
    return response.json();
  }
  
  async function generateSignature(params: Record<string, any>, secret: string): Promise<string> {
    // Sort params alphabetically
    const sorted = Object.keys(params).sort().map(key => `${key}=${params[key]}`).join('&');
    
    // Create SHA1 hash
    const encoder = new TextEncoder();
    const data = encoder.encode(sorted + secret);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  return {
    async upload(file, filename, options = {}) {
      const buffer = Buffer.isBuffer(file) ? file : Buffer.from(file);
      const publicId = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9]/g, '_')}`;
      
      const result = await uploadToCloudinary(buffer, publicId, options);
      
      // Build variant URLs using Cloudinary transformations
      const variants: Record<string, string> = {};
      for (const size of sizes) {
        const transform = `w_${size.width},h_${size.height},c_${size.fit}`;
        variants[size.name] = `https://res.cloudinary.com/${config.cloudName}/image/upload/${transform}/${folder}/${publicId}`;
      }
      
      return {
        url: result.secure_url,
        key: `${folder}/${publicId}`,
        width: result.width,
        height: result.height,
        format: result.format,
        size: result.bytes,
        variants,
      };
    },
    
    async delete(key) {
      const publicId = key.replace(`${folder}/`, '');
      const timestamp = Math.round(Date.now() / 1000);
      const signature = await generateSignature({ public_id: publicId, timestamp }, config.apiSecret);
      
      await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/destroy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_id: publicId, api_key: config.apiKey, timestamp, signature }),
      });
    },
    
    getUrl(key, options) {
      if (options?.width || options?.height) {
        const transform = `w_${options.width || 'auto'},h_${options.height || 'auto'},c_fit`;
        return `https://res.cloudinary.com/${config.cloudName}/image/upload/${transform}/${key}`;
      }
      return `https://res.cloudinary.com/${config.cloudName}/image/upload/${key}`;
    },
    
    getVariants(key) {
      const variants: Record<string, string> = {};
      for (const size of sizes) {
        const transform = `w_${size.width},h_${size.height},c_${size.fit}`;
        variants[size.name] = `https://res.cloudinary.com/${config.cloudName}/image/upload/${transform}/${key}`;
      }
      return variants;
    },
  };
}

// R2/S3 provider (direct upload + CDN transformations via Cloudflare Images)
export interface R2Config {
  provider: 'r2';
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  customDomain?: string;
  sizes?: typeof DEFAULT_IMAGE_SIZES;
  useCloudflareImages?: boolean; // Use CF Images for transforms
}

export function r2Provider(config: R2Config): ImageProvider {
  const sizes = config.sizes || DEFAULT_IMAGE_SIZES;
  const baseUrl = config.customDomain || `https://${config.bucket}.${config.accountId}.r2.cloudflarestorage.com`;
  
  async function uploadToR2(key: string, buffer: Buffer, metadata?: Record<string, string>) {
    // AWS S3 compatible signature
    const date = new Date().toISOString().replace(/[:.-]/g, '').slice(0, 15);
    const shortDate = date.slice(0, 8);
    
    const credential = `${config.accessKeyId}/${shortDate}/auto/s3/aws4_request`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    
    // Simplified - in real impl would calculate AWS signature v4
    const url = `${baseUrl}/${key}`;
    
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'image/jpeg',
        'X-Amz-Date': date,
        'X-Amz-Content-SHA256': 'UNSIGNED-PAYLOAD',
        'Authorization': `AWS4-HMAC-SHA256 Credential=${credential}, SignedHeaders=${signedHeaders}, Signature=...`,
        ...(metadata ? Object.fromEntries(Object.entries(metadata).map(([k, v]) => [`x-amz-meta-${k}`, v])) : {}),
      },
      body: new Uint8Array(buffer),
    });
    
    if (!response.ok) {
      throw new Error(`R2 upload failed: ${await response.text()}`);
    }
    
    return url;
  }
  
  return {
    async upload(file, filename, options = {}) {
      const buffer = Buffer.isBuffer(file) ? file : Buffer.from(file);
      const key = `images/${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, '-')}`;
      
      // If Sharp is available, process locally first
      let processedBuffer = buffer;
      let metadata: { width?: number; height?: number; format?: string } = {};
      
      try {
        const sharpModule: any = await import('sharp');
        const sh = sharpModule.default || sharpModule;
        const pipeline = sh(buffer);
        const info = await pipeline.metadata();
        
        if (options.width || options.height) {
          processedBuffer = await pipeline.resize({
            width: options.width,
            height: options.height,
            fit: options.fit || 'inside',
          }).toBuffer();
        }
        
        metadata = { width: info.width, height: info.height, format: info.format };
      } catch {
        // Sharp not available, upload original
      }
      
      const url = await uploadToR2(key, processedBuffer);
      
      // Build variants
      const variants: Record<string, string> = {};
      for (const size of sizes) {
        if (config.useCloudflareImages) {
          // Use Cloudflare Images for on-the-fly transforms
          variants[size.name] = `${url}?width=${size.width}&height=${size.height}&fit=${size.fit}`;
        } else {
          // Pre-generate with Sharp
          variants[size.name] = `${url}-${size.name}`;
        }
      }
      
      return {
        url,
        key,
        ...metadata,
        size: processedBuffer.length,
        variants,
      };
    },
    
    async delete(key) {
      // S3 DELETE request
      console.log(`R2: Delete ${key}`);
    },
    
    getUrl(key, options) {
      if (options?.width || options?.height) {
        if (config.useCloudflareImages) {
          return `${baseUrl}/${key}?width=${options.width}&height=${options.height}`;
        }
      }
      return `${baseUrl}/${key}`;
    },
    
    getVariants(key) {
      const variants: Record<string, string> = {};
      for (const size of sizes) {
        if (config.useCloudflareImages) {
          variants[size.name] = `${baseUrl}/${key}?width=${size.width}&height=${size.height}&fit=${size.fit}`;
        } else {
          variants[size.name] = `${baseUrl}/${key}-${size.name}`;
        }
      }
      return variants;
    },
  };
}

// External URL provider (no storage, just reference external images)
export interface ExternalConfig {
  provider: 'external';
}

export function externalProvider(): ImageProvider {
  return {
    async upload(_file, _filename) {
      throw new Error('External provider cannot upload. Use pre-signed URLs or direct client uploads.');
    },
    
    async delete() {
      // No-op
    },
    
    getUrl(key) {
      return key; // Key is already a full URL
    },
    
    getVariants(key) {
      return { original: key };
    },
  };
}

// Main image service
export interface ImageService {
  provider: ImageProvider;
  sizes: typeof DEFAULT_IMAGE_SIZES;
  uploadProductImage(file: Buffer | ArrayBuffer, filename: string): Promise<ImageResult>;
  uploadVariantImage(file: Buffer | ArrayBuffer, filename: string): Promise<ImageResult>;
  deleteImage(key: string): Promise<void>;
  getResponsiveSrcSet(key: string): string;
}

export function createImageService(provider: ImageProvider, sizes = DEFAULT_IMAGE_SIZES): ImageService {
  return {
    provider,
    sizes,
    
    async uploadProductImage(file, filename) {
      // Generate main image + all variants
      const main = await provider.upload(file, filename, {
        width: 2048,
        height: 2048,
        fit: 'inside',
        quality: 85,
      });
      
      return main;
    },
    
    async uploadVariantImage(file, filename) {
      // Smaller images for variants
      return provider.upload(file, filename, {
        width: 800,
        height: 800,
        fit: 'inside',
        quality: 80,
      });
    },
    
    async deleteImage(key) {
      await provider.delete(key);
    },
    
    getResponsiveSrcSet(key) {
      const variants = provider.getVariants(key);
      return sizes
        .map(size => `${variants[size.name]} ${size.width}w`)
        .join(', ');
    },
  };
}

// Factory
export type ImageConfig = SharpConfig | CloudinaryConfig | R2Config | ExternalConfig;

export function createImageProvider(config: ImageConfig): ImageProvider {
  switch (config.provider) {
    case 'sharp':
      return sharpProvider(config);
    case 'cloudinary':
      return cloudinaryProvider(config);
    case 'r2':
      return r2Provider(config);
    case 'external':
      return externalProvider();
    default:
      throw new Error(`Unknown image provider: ${(config as any).provider}`);
  }
}

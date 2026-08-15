import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import sharp, { type Metadata } from 'sharp';
import type { Asset } from '../shared/types.js';
import { MAX_IMAGE_BYTES } from './constants.js';
import type { StoredAsset, StudioDatabase } from './database.js';

const MEDIA_TYPES: Record<string, Asset['mediaType']> = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
};

export class AssetStore {
  readonly assetsDir: string;

  constructor(
    private readonly database: StudioDatabase,
    dataDir: string,
  ) {
    this.assetsDir = join(dataDir, 'assets');
  }

  async ingestFile(filePath: string, originalName = basename(filePath)): Promise<StoredAsset> {
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) {
      throw new Error(`Asset is not a file: ${filePath}`);
    }
    if (fileStats.size > MAX_IMAGE_BYTES) {
      throw new Error(`Image exceeds ${MAX_IMAGE_BYTES} byte limit: ${originalName}`);
    }
    return this.ingestBuffer(await readFile(filePath), originalName);
  }

  async ingestBuffer(buffer: Buffer, originalName: string): Promise<StoredAsset> {
    if (buffer.length === 0) {
      throw new Error(`Image is empty: ${originalName}`);
    }
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new Error(`Image exceeds ${MAX_IMAGE_BYTES} byte limit: ${originalName}`);
    }

    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const existing = this.database.getAssetBySha256(sha256);
    if (existing) {
      return existing;
    }

    let metadata: Metadata;
    try {
      metadata = await sharp(buffer, { failOn: 'error' }).metadata();
    } catch {
      throw new Error(`Unsupported or corrupt image: ${originalName}`);
    }

    const mediaType = metadata.format ? MEDIA_TYPES[metadata.format] : undefined;
    if (!mediaType || !metadata.width || !metadata.height) {
      throw new Error(`Only PNG and JPEG images are supported: ${originalName}`);
    }

    const extension = mediaType === 'image/png' ? '.png' : '.jpg';
    const storageName = `${sha256}${extension}`;
    await mkdir(this.assetsDir, { recursive: true });
    await writeFile(join(this.assetsDir, storageName), buffer, { flag: 'wx' }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    });

    return this.database.insertAsset({
      id: randomUUID(),
      sha256,
      originalName: basename(originalName || `image${extname(storageName)}`),
      mediaType,
      byteSize: buffer.length,
      width: metadata.width,
      height: metadata.height,
      storageName,
      createdAt: new Date().toISOString(),
    });
  }

  resolveStoredPath(asset: StoredAsset): string {
    return join(this.assetsDir, asset.storageName);
  }
}

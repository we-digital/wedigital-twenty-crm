import { CACHE_MANAGER, Cache, CacheModule } from '@nestjs/cache-manager';
import {
  Global,
  Inject,
  Logger,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { cacheStorageModuleFactory } from 'src/engine/core-modules/cache-storage/cache-storage.module-factory';
import { FlushCacheCommand } from 'src/engine/core-modules/cache-storage/commands/flush-cache.command';
import { CacheStorageService } from 'src/engine/core-modules/cache-storage/services/cache-storage.service';
import { CacheStorageNamespace } from 'src/engine/core-modules/cache-storage/types/cache-storage-namespace.enum';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      useFactory: cacheStorageModuleFactory,
      inject: [TwentyConfigService],
    }),
  ],
  providers: [
    ...Object.values(CacheStorageNamespace).map((cacheStorageNamespace) => ({
      provide: cacheStorageNamespace,
      useFactory: (cacheManager: Cache) => {
        return new CacheStorageService(cacheManager, cacheStorageNamespace);
      },
      inject: [CACHE_MANAGER],
    })),
    FlushCacheCommand,
  ],
  exports: [...Object.values(CacheStorageNamespace), FlushCacheCommand],
})
export class CacheStorageModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheStorageModule.name);

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  onModuleInit() {
    const store = this.cacheManager.store as any;

    if (store?.client?.on) {
      store.client.on('error', (err: Error) => {
        this.logger.error(`Cache Redis client error: ${err.message}`);
      });
    }
  }

  async onModuleDestroy() {
    // oxlint-disable-next-line @typescripttypescript/no-explicit-any
    if ((this.cacheManager.store as any)?.name === 'redis') {
      // oxlint-disable-next-line @typescripttypescript/no-explicit-any
      await (this.cacheManager.store as any).client.quit();
    }
  }
}

import { LocalAssetStore } from '../assets/local-asset-store'
import { RegionService } from '../assets/region-service'
import { ConfigStore } from './config-store'

const MAINTENANCE_INTERVAL = 6 * 60 * 60 * 1000

export class WorkspaceMaintenance {
  private timer?: NodeJS.Timeout

  constructor(
    private readonly config: ConfigStore,
    private readonly regions: RegionService,
    private readonly assets: LocalAssetStore
  ) {}

  async start(): Promise<void> {
    if (this.timer) return
    await this.run().catch(() => undefined)
    if ((await this.config.getAppSettings()).cleanupTempOnExit) {
      await this.assets.cleanupTemp().catch(() => undefined)
    }
    this.timer = setInterval(() => void this.run().catch(() => undefined), MAINTENANCE_INTERVAL)
    this.timer.unref()
  }

  async dispose(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
    if ((await this.config.getAppSettings()).cleanupTempOnExit) {
      await this.assets.cleanupTemp().catch(() => undefined)
    }
  }

  private async run(): Promise<void> {
    await this.regions.purgeExpired()
  }
}

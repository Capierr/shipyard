import { join } from 'path'
import fs from 'fs-extra'
import type { StageAdapter } from '../../core/adapter.js'
import type { PipelineContext, ProjectProfile } from '../../types/index.js'

export class ProjectDetector implements StageAdapter<void, ProjectProfile> {
  readonly name = 'ProjectDetector'

  canHandle(_profile: undefined, _ctx: PipelineContext): boolean {
    return true
  }

  async run(_input: void, ctx: PipelineContext): Promise<ProjectProfile> {
    const root = ctx.projectRoot
    const pkg = await this.readJson(join(root, 'package.json'))
    const capacitorConfig = await this.exists(join(root, 'capacitor.config.ts'))
      || await this.exists(join(root, 'capacitor.config.js'))
    const appJson = await this.readJson(join(root, 'app.json')).catch(() => null)
    const pubspec = await this.exists(join(root, 'pubspec.yaml'))

    const type = this.detectType(pkg, capacitorConfig, appJson, pubspec)
    const hasNativeModules = await this.detectNativeModules(root, pkg)

    const profile: ProjectProfile = {
      type,
      name: ctx.config.app.name || pkg?.name || 'app',
      bundleId: ctx.config.app.bundleId,
      packageName: ctx.config.app.packageName,
      entryPoint: ctx.config.wrap.entryPoint,
      hasNativeModules,
      buildStrategy: hasNativeModules ? 'fastlane' : ctx.config.build.strategy === 'fastlane' ? 'fastlane' : 'eas',
      locales: ctx.config.app.locales,
      version: pkg?.version ?? '1.0.0',
    }

    ctx.emit({ event: 'log', stage: 'detect', level: 'info', msg: `Detected: ${type}` })
    ctx.emit({ event: 'log', stage: 'detect', level: 'info', msg: `Build strategy: ${profile.buildStrategy}` })

    return profile
  }

  private detectType(pkg: Record<string, unknown> | null, hasCapacitor: boolean, appJson: Record<string, unknown> | null, hasFlutter: boolean) {
    if (hasFlutter) return 'flutter' as const
    if (hasCapacitor) return 'capacitor' as const
    if (appJson?.expo) return 'expo' as const

    const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) } as Record<string, string>
    if (deps['react-native'] || deps['expo']) return 'react-native' as const
    if (deps['react']) return 'web-react' as const
    if (deps['vue']) return 'web-vue' as const
    if (deps['svelte']) return 'web-svelte' as const
    if (deps['@angular/core']) return 'web-angular' as const

    return 'web-vanilla' as const
  }

  private async detectNativeModules(root: string, pkg: Record<string, unknown> | null): Promise<boolean> {
    const nativeIndicators = [
      join(root, 'ios'),
      join(root, 'android'),
      join(root, 'native'),
    ]
    for (const path of nativeIndicators) {
      if (await this.exists(path)) {
        const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) } as Record<string, string>
        const hasNativeDep = Object.keys(deps).some(d =>
          d.includes('native') && !d.includes('react-native-web')
        )
        if (hasNativeDep) return true
      }
    }
    return false
  }

  private async exists(path: string): Promise<boolean> {
    return fs.pathExists(path)
  }

  private async readJson(path: string): Promise<Record<string, unknown> | null> {
    try {
      return await fs.readJson(path)
    } catch {
      return null
    }
  }
}

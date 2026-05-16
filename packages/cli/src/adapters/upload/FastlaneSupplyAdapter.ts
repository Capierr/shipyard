import { execa } from 'execa'
import { resolveCredential } from '../../core/config.js'
import type { StageAdapter } from '../../core/adapter.js'
import type { BuildArtifacts, PipelineContext, ProjectProfile, UploadResult } from '../../types/index.js'

export class FastlaneSupplyAdapter implements StageAdapter<BuildArtifacts, Partial<UploadResult>> {
  readonly name = 'FastlaneSupplyAdapter'

  canHandle(_profile: ProjectProfile | undefined, ctx: PipelineContext): boolean {
    return ctx.platform !== 'ios'
  }

  async run(artifacts: BuildArtifacts, ctx: PipelineContext): Promise<Partial<UploadResult>> {
    const saKey = resolveCredential('SHIPYARD_GOOGLE_SA_KEY')

    ctx.emit({ event: 'log', stage: 'upload', level: 'info', msg: 'Uploading to Google Play via fastlane supply...' })

    await execa('bundle', ['exec', 'fastlane', 'supply',
      '--aab', artifacts.android ?? '',
      '--track', ctx.config.deploy.trackAndroid,
      '--metadata_path', '.shipyard/metadata/android',
      '--screenshots_path', '.shipyard/screenshots',
      '--release_status', 'completed',
    ], {
      cwd: ctx.projectRoot,
      env: {
        ...process.env,
        SUPPLY_JSON_KEY_DATA: saKey,
        SUPPLY_PACKAGE_NAME: ctx.config.app.packageName,
        SUPPLY_TRACK: ctx.config.deploy.trackAndroid,
      },
    })

    return { androidVersionCode: 1 }
  }
}

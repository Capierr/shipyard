import { execa } from 'execa'
import { resolveCredential } from '../../core/config.js'
import type { StageAdapter } from '../../core/adapter.js'
import type { BuildArtifacts, PipelineContext, ProjectProfile, UploadResult } from '../../types/index.js'

export class FastlaneDeliverAdapter implements StageAdapter<BuildArtifacts, Partial<UploadResult>> {
  readonly name = 'FastlaneDeliverAdapter'

  canHandle(_profile: ProjectProfile | undefined, ctx: PipelineContext): boolean {
    return ctx.platform !== 'android'
  }

  async run(artifacts: BuildArtifacts, ctx: PipelineContext): Promise<Partial<UploadResult>> {
    resolveCredential('SHIPYARD_ASC_KEY_ID')
    resolveCredential('SHIPYARD_ASC_ISSUER_ID')
    resolveCredential('SHIPYARD_ASC_KEY_PATH')

    ctx.emit({ event: 'log', stage: 'upload', level: 'info', msg: 'Uploading to App Store via fastlane deliver...' })

    await execa('bundle', ['exec', 'fastlane', 'deliver',
      '--ipa', artifacts.ios ?? '',
      '--metadata_path', '.shipyard/metadata/ios',
      '--screenshots_path', '.shipyard/screenshots',
      '--skip_binary_upload', artifacts.ios ? 'false' : 'true',
      '--submit_for_review', 'false',
      '--automatic_release', 'false',
      '--force',
    ], {
      cwd: ctx.projectRoot,
      env: {
        ...process.env,
        APP_STORE_CONNECT_API_KEY_KEY_ID: resolveCredential('SHIPYARD_ASC_KEY_ID'),
        APP_STORE_CONNECT_API_KEY_ISSUER_ID: resolveCredential('SHIPYARD_ASC_ISSUER_ID'),
        APP_STORE_CONNECT_API_KEY_KEY: resolveCredential('SHIPYARD_ASC_KEY_PATH'),
        APP_STORE_CONNECT_API_KEY_IS_KEY_CONTENT_BASE64: 'false',
      },
    })

    return { iosVersionId: 'uploaded' }
  }
}

import { execa } from 'execa'
import { resolveCredential } from '../../core/config.js'
import type { StageAdapter } from '../../core/adapter.js'
import type { PipelineContext, ProjectProfile, SubmissionResult, UploadResult } from '../../types/index.js'

export class AppStoreSubmitAdapter implements StageAdapter<UploadResult, Partial<SubmissionResult>> {
  readonly name = 'AppStoreSubmitAdapter'

  canHandle(_profile: ProjectProfile | undefined, ctx: PipelineContext): boolean {
    return ctx.platform !== 'android' && ctx.config.deploy.trackIos === 'appstore'
  }

  async run(_upload: UploadResult, ctx: PipelineContext): Promise<Partial<SubmissionResult>> {
    ctx.emit({ event: 'log', stage: 'submit', level: 'info', msg: 'Submitting to App Store for review...' })

    await execa('bundle', ['exec', 'fastlane', 'deliver',
      '--submit_for_review', 'true',
      '--automatic_release', 'true',
      '--skip_binary_upload', 'true',
      '--skip_screenshots', 'true',
      '--skip_metadata', 'true',
      '--force',
    ], {
      cwd: ctx.projectRoot,
      env: {
        ...process.env,
        APP_STORE_CONNECT_API_KEY_KEY_ID: resolveCredential('SHIPYARD_ASC_KEY_ID'),
        APP_STORE_CONNECT_API_KEY_ISSUER_ID: resolveCredential('SHIPYARD_ASC_ISSUER_ID'),
        APP_STORE_CONNECT_API_KEY_KEY: resolveCredential('SHIPYARD_ASC_KEY_PATH'),
      },
    })

    return { iosReviewUrl: 'https://appstoreconnect.apple.com' }
  }
}

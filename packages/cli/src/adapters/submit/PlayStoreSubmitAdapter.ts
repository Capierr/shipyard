import { execa } from 'execa'
import { resolveCredential } from '../../core/config.js'
import type { StageAdapter } from '../../core/adapter.js'
import type { PipelineContext, ProjectProfile, SubmissionResult, UploadResult } from '../../types/index.js'

export class PlayStoreSubmitAdapter implements StageAdapter<UploadResult, Partial<SubmissionResult>> {
  readonly name = 'PlayStoreSubmitAdapter'

  canHandle(_profile: ProjectProfile | undefined, ctx: PipelineContext): boolean {
    return ctx.platform !== 'ios'
  }

  async run(_upload: UploadResult, ctx: PipelineContext): Promise<Partial<SubmissionResult>> {
    const track = ctx.config.deploy.trackAndroid

    ctx.emit({ event: 'log', stage: 'submit', level: 'info', msg: `Promoting to ${track} track on Google Play...` })

    if (track === 'production') {
      await execa('bundle', ['exec', 'fastlane', 'supply',
        '--track', 'internal',
        '--track_promote_to', 'production',
        '--rollout', '1.0',
      ], {
        cwd: ctx.projectRoot,
        env: {
          ...process.env,
          SUPPLY_JSON_KEY_DATA: resolveCredential('SHIPYARD_GOOGLE_SA_KEY'),
          SUPPLY_PACKAGE_NAME: ctx.config.app.packageName,
        },
      })
    }

    return { androidTrack: track, androidStatus: 'completed' }
  }
}

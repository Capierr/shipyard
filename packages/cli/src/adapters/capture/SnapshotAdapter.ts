import { execa } from 'execa'
import type { StageAdapter } from '../../core/adapter.js'
import type { PipelineContext, ProjectProfile } from '../../types/index.js'

export class SnapshotAdapter implements StageAdapter<ProjectProfile, void> {
  readonly name = 'SnapshotAdapter'

  canHandle(_profile: ProjectProfile | undefined, ctx: PipelineContext): boolean {
    return ctx.platform !== 'android'
  }

  async run(_profile: ProjectProfile, ctx: PipelineContext): Promise<void> {
    ctx.emit({ event: 'log', stage: 'capture', level: 'info', msg: 'Capturing iOS screenshots via fastlane snapshot...' })
    await execa('bundle', ['exec', 'fastlane', 'snapshot'], {
      cwd: ctx.projectRoot,
    })
  }
}

import { execa } from 'execa'
import type { StageAdapter } from '../../core/adapter.js'
import type { PipelineContext, ProjectProfile } from '../../types/index.js'

export class ScreengrabAdapter implements StageAdapter<ProjectProfile, void> {
  readonly name = 'ScreengrabAdapter'

  canHandle(_profile: ProjectProfile | undefined, ctx: PipelineContext): boolean {
    return ctx.platform !== 'ios'
  }

  async run(_profile: ProjectProfile, ctx: PipelineContext): Promise<void> {
    ctx.emit({ event: 'log', stage: 'capture', level: 'info', msg: 'Capturing Android screenshots via fastlane screengrab...' })
    await execa('bundle', ['exec', 'fastlane', 'screengrab'], {
      cwd: ctx.projectRoot,
    })
  }
}

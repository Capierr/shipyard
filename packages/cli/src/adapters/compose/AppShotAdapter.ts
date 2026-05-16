import { execa } from 'execa'
import type { StageAdapter } from '../../core/adapter.js'
import type { PipelineContext, ProjectProfile } from '../../types/index.js'

export class AppShotAdapter implements StageAdapter<ProjectProfile, void> {
  readonly name = 'AppShotAdapter'

  canHandle(_profile: ProjectProfile | undefined, _ctx: PipelineContext): boolean {
    return true
  }

  async run(_profile: ProjectProfile, ctx: PipelineContext): Promise<void> {
    const { devices, frameStyle, captionStyle } = ctx.config.screenshots
    const locales = ctx.config.app.locales

    ctx.emit({ event: 'log', stage: 'compose', level: 'info', msg: 'Composing screenshots with appshot-cli...' })

    await execa('npx', [
      'appshot-cli',
      'wizard',
      '--no-interactive',
      `--devices=${devices.join(',')}`,
      `--template=${frameStyle}`,
      `--langs=${locales.join(',')}`,
      '--caption-style', captionStyle,
      '--input', 'fastlane/screenshots',
      '--output', '.shipyard/screenshots',
    ], {
      cwd: ctx.projectRoot,
    })
  }
}

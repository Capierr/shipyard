import { execa } from 'execa'
import { resolveCredential } from '../../core/config.js'
import type { StageAdapter } from '../../core/adapter.js'
import type { BuildArtifacts, PipelineContext, ProjectProfile } from '../../types/index.js'

export class EASBuildAdapter implements StageAdapter<ProjectProfile, BuildArtifacts> {
  readonly name = 'EASBuildAdapter'

  canHandle(profile: ProjectProfile | undefined, ctx: PipelineContext): boolean {
    if (!profile) return false
    if (profile.hasNativeModules) return false
    return profile.buildStrategy === 'eas' || ctx.config.build.strategy === 'eas'
  }

  async run(profile: ProjectProfile, ctx: PipelineContext): Promise<BuildArtifacts> {
    resolveCredential('EXPO_TOKEN')

    const platform = ctx.platform === 'all' ? 'all' : ctx.platform
    const args = [
      'build',
      `--platform=${platform}`,
      `--profile=${ctx.config.build.profile}`,
      '--non-interactive',
      '--json',
      '--no-wait',
    ]

    ctx.emit({ event: 'log', stage: 'build', level: 'info', msg: `Starting EAS build (platform=${platform})` })

    const result = await execa('eas', args, {
      cwd: ctx.projectRoot,
      env: { ...process.env, EXPO_TOKEN: process.env.EXPO_TOKEN },
    })

    const buildInfo = JSON.parse(result.stdout)
    const buildId = Array.isArray(buildInfo) ? buildInfo[0]?.id : buildInfo?.id

    ctx.emit({ event: 'log', stage: 'build', level: 'info', msg: `EAS build queued: ${buildId}` })

    // Wait for build to complete
    await this.waitForBuild(buildId, ctx)

    return { easBuildId: buildId }
  }

  private async waitForBuild(buildId: string, ctx: PipelineContext): Promise<void> {
    const maxWaitMs = 30 * 60 * 1000 // 30 min
    const pollIntervalMs = 30_000
    const start = Date.now()

    while (Date.now() - start < maxWaitMs) {
      const result = await execa('eas', ['build:view', buildId, '--json'], {
        cwd: ctx.projectRoot,
      })
      const info = JSON.parse(result.stdout)

      if (info.status === 'FINISHED') return
      if (info.status === 'ERRORED' || info.status === 'CANCELLED') {
        throw new Error(`EAS build ${buildId} ${info.status.toLowerCase()}`)
      }

      ctx.emit({ event: 'log', stage: 'build', level: 'info', msg: `Build status: ${info.status}` })
      await new Promise((r) => setTimeout(r, pollIntervalMs))
    }

    throw new Error(`EAS build ${buildId} timed out after 30 minutes`)
  }
}

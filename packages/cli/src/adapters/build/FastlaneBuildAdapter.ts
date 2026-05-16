import { execa } from 'execa'
import type { StageAdapter } from '../../core/adapter.js'
import type { BuildArtifacts, PipelineContext, ProjectProfile } from '../../types/index.js'

export class FastlaneBuildAdapter implements StageAdapter<ProjectProfile, BuildArtifacts> {
  readonly name = 'FastlaneBuildAdapter'

  canHandle(profile: ProjectProfile | undefined, ctx: PipelineContext): boolean {
    if (!profile) return false
    return profile.buildStrategy === 'fastlane' || ctx.config.build.strategy === 'fastlane'
  }

  async run(profile: ProjectProfile, ctx: PipelineContext): Promise<BuildArtifacts> {
    const artifacts: BuildArtifacts = {}
    const opts = { cwd: ctx.projectRoot }

    if (ctx.platform !== 'android') {
      ctx.emit({ event: 'log', stage: 'build', level: 'info', msg: 'Building iOS via Fastlane gym...' })
      await execa('bundle', ['exec', 'fastlane', 'gym',
        '--scheme', profile.name,
        '--export_method', 'app-store',
        '--output_directory', '.shipyard/artifacts',
        '--output_name', 'app.ipa',
      ], opts)
      artifacts.ios = '.shipyard/artifacts/app.ipa'
    }

    if (ctx.platform !== 'ios') {
      ctx.emit({ event: 'log', stage: 'build', level: 'info', msg: 'Building Android via Gradle...' })
      await execa('bundle', ['exec', 'fastlane', 'run', 'gradle',
        'task:bundle',
        'build_type:Release',
      ], opts)
      artifacts.android = 'app/build/outputs/bundle/release/app-release.aab'
    }

    return artifacts
  }
}

import { join } from 'path'
import fs from 'fs-extra'
import { execa } from 'execa'
import type { StageAdapter } from '../../core/adapter.js'
import type { PipelineContext, ProjectProfile } from '../../types/index.js'

export class CapacitorAdapter implements StageAdapter<ProjectProfile, void> {
  readonly name = 'CapacitorAdapter'

  canHandle(profile: ProjectProfile | undefined, _ctx: PipelineContext): boolean {
    if (!profile) return false
    return ['web-react', 'web-vue', 'web-svelte', 'web-angular', 'web-vanilla'].includes(profile.type)
  }

  async run(profile: ProjectProfile, ctx: PipelineContext): Promise<void> {
    const root = ctx.projectRoot
    const entryPoint = join(root, profile.entryPoint ?? 'dist')

    // Verify web build exists
    if (!(await fs.pathExists(entryPoint))) {
      throw new Error(
        `Web build not found at '${entryPoint}'. Run your build command (e.g. 'npm run build') before deploying.`
      )
    }
    const entries = await fs.readdir(entryPoint)
    if (entries.length === 0) {
      throw new Error(`Web build directory '${entryPoint}' is empty. Run your build command first.`)
    }

    const hasCapacitor = await fs.pathExists(join(root, 'capacitor.config.ts'))
      || await fs.pathExists(join(root, 'capacitor.config.js'))

    const opts = { cwd: root }

    if (!hasCapacitor) {
      ctx.emit({ event: 'log', stage: 'wrap', level: 'info', msg: 'Initialising Capacitor...' })
      await execa('npx', ['cap', 'init', profile.name, profile.bundleId, '--web-dir', profile.entryPoint ?? 'dist'], opts)
      await execa('npx', ['cap', 'add', 'ios'], opts)
      await execa('npx', ['cap', 'add', 'android'], opts)
    }

    ctx.emit({ event: 'log', stage: 'wrap', level: 'info', msg: 'Running cap sync...' })
    await execa('npx', ['cap', 'sync'], opts)
  }
}

import { Command } from 'commander'
import { loadConfig } from '../core/config.js'
import { createEmitter } from '../core/emitter.js'
import { runPipeline } from '../core/pipeline.js'
import { ProjectDetector } from '../adapters/detect/ProjectDetector.js'
import { SnapshotAdapter } from '../adapters/capture/SnapshotAdapter.js'
import { ScreengrabAdapter } from '../adapters/capture/ScreengrabAdapter.js'
import { AppShotAdapter } from '../adapters/compose/AppShotAdapter.js'
import type { PipelineContext, StageName, PipelineState } from '../types/index.js'
import { STAGE_ORDER } from '../core/pipeline.js'

export function screenshotCommand(): Command {
  return new Command('screenshot')
    .description('Capture and compose store screenshots (capture + compose stages only)')
    .option('--platform <platform>', 'ios | android | all', 'all')
    .option('--json', 'Emit JSON events')
    .action(async (opts) => {
      const projectRoot = process.cwd()
      const config = await loadConfig(projectRoot)
      const emit = createEmitter(opts.json ?? false)

      const state: PipelineState = {
        runId: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        stages: Object.fromEntries(STAGE_ORDER.map((s) => [s, { status: 'pending' }])) as PipelineState['stages'],
      }

      const ctx: PipelineContext = {
        config, state, projectRoot,
        nonInteractive: false,
        jsonMode: opts.json ?? false,
        platform: opts.platform as 'ios' | 'android' | 'all',
        emit,
      }

      const detector = new ProjectDetector()
      const captureAdapters = [new SnapshotAdapter(), new ScreengrabAdapter()]
      const composeAdapters = [new AppShotAdapter()]

      await runPipeline([
        {
          name: 'detect' as StageName,
          run: async (c) => { c.profile = await detector.run(undefined, c); return c.profile },
        },
        {
          name: 'capture' as StageName,
          run: async (c) => {
            await Promise.all(captureAdapters.filter((a) => a.canHandle(c.profile, c)).map((a) => a.run(c.profile!, c)))
          },
        },
        {
          name: 'compose' as StageName,
          run: async (c) => composeAdapters[0].run(c.profile!, c),
        },
      ], ctx)
    })
}

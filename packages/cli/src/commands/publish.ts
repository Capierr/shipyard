import { Command } from 'commander'
import { loadConfig } from '../core/config.js'
import { createEmitter } from '../core/emitter.js'
import { runPipeline } from '../core/pipeline.js'
import { ProjectDetector } from '../adapters/detect/ProjectDetector.js'
import { FastlaneDeliverAdapter } from '../adapters/upload/FastlaneDeliverAdapter.js'
import { FastlaneSupplyAdapter } from '../adapters/upload/FastlaneSupplyAdapter.js'
import { AppStoreSubmitAdapter } from '../adapters/submit/AppStoreSubmitAdapter.js'
import { PlayStoreSubmitAdapter } from '../adapters/submit/PlayStoreSubmitAdapter.js'
import type { PipelineContext, StageName, PipelineState } from '../types/index.js'
import { STAGE_ORDER } from '../core/pipeline.js'

export function publishCommand(): Command {
  return new Command('publish')
    .description('Upload and submit existing build artifacts (upload + submit stages only)')
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
        nonInteractive: true,
        jsonMode: opts.json ?? false,
        platform: opts.platform as 'ios' | 'android' | 'all',
        emit,
        artifacts: {
          ios: '.shipyard/artifacts/app.ipa',
          android: 'app/build/outputs/bundle/release/app-release.aab',
        },
      }

      const detector = new ProjectDetector()
      const uploadAdapters = [new FastlaneDeliverAdapter(), new FastlaneSupplyAdapter()]
      const submitAdapters = [new AppStoreSubmitAdapter(), new PlayStoreSubmitAdapter()]

      await runPipeline([
        {
          name: 'detect' as StageName,
          run: async (c) => { c.profile = await detector.run(undefined, c); return c.profile },
        },
        {
          name: 'upload' as StageName,
          run: async (c) => {
            const active = uploadAdapters.filter((a) => a.canHandle(c.profile, c))
            const results = await Promise.all(active.map((a) => a.run(c.artifacts!, c)))
            return Object.assign({}, ...results)
          },
        },
        {
          name: 'submit' as StageName,
          run: async (c) => {
            const active = submitAdapters.filter((a) => a.canHandle(c.profile, c))
            const results = await Promise.all(active.map((a) => a.run({}, c)))
            return Object.assign({}, ...results)
          },
        },
      ], ctx)
    })
}

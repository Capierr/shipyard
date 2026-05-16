import { Command } from 'commander'
import { loadConfig } from '../core/config.js'
import { createEmitter } from '../core/emitter.js'
import { runPipeline, STAGE_ORDER } from '../core/pipeline.js'
import { selectAdapter } from '../core/adapter.js'
import { ProjectDetector } from '../adapters/detect/ProjectDetector.js'
import { CapacitorAdapter } from '../adapters/wrap/CapacitorAdapter.js'
import { EASBuildAdapter } from '../adapters/build/EASBuildAdapter.js'
import { FastlaneBuildAdapter } from '../adapters/build/FastlaneBuildAdapter.js'
import { SnapshotAdapter } from '../adapters/capture/SnapshotAdapter.js'
import { ScreengrabAdapter } from '../adapters/capture/ScreengrabAdapter.js'
import { AppShotAdapter } from '../adapters/compose/AppShotAdapter.js'
import { ClaudeMetadataAdapter } from '../adapters/meta/ClaudeMetadataAdapter.js'
import { FastlaneDeliverAdapter } from '../adapters/upload/FastlaneDeliverAdapter.js'
import { FastlaneSupplyAdapter } from '../adapters/upload/FastlaneSupplyAdapter.js'
import { AppStoreSubmitAdapter } from '../adapters/submit/AppStoreSubmitAdapter.js'
import { PlayStoreSubmitAdapter } from '../adapters/submit/PlayStoreSubmitAdapter.js'
import type { PipelineContext, StageName, PipelineState, BuildArtifacts } from '../types/index.js'

export function deployCommand(): Command {
  return new Command('deploy')
    .description('Run the full deployment pipeline')
    .option('--non-interactive', 'CI mode — fail on any missing input')
    .option('--resume', 'Continue from last failed stage')
    .option('--from <stage>', 'Start from a specific stage')
    .option('--skip <stages>', 'Comma-separated stages to skip')
    .option('--platform <platform>', 'ios | android | all', 'all')
    .option('--json', 'Emit newline-delimited JSON events to stdout')
    .option('--profile <profile>', 'Build profile name', 'production')
    .action(async (opts) => {
      const projectRoot = process.cwd()
      const config = await loadConfig(projectRoot)
      const emit = createEmitter(opts.json ?? false)

      const state: PipelineState = {
        runId: '',
        startedAt: new Date().toISOString(),
        stages: Object.fromEntries(
          STAGE_ORDER.map((s) => [s, { status: 'pending' }])
        ) as PipelineState['stages'],
      }

      const ctx: PipelineContext = {
        config,
        state,
        projectRoot,
        nonInteractive: opts.nonInteractive ?? false,
        jsonMode: opts.json ?? false,
        platform: (opts.platform ?? 'all') as 'ios' | 'android' | 'all',
        emit,
      }

      const detectAdapter = new ProjectDetector()
      const wrapAdapters = [new CapacitorAdapter()]
      const buildAdapters = [new EASBuildAdapter(), new FastlaneBuildAdapter()]
      const captureAdapters = [new SnapshotAdapter(), new ScreengrabAdapter()]
      const composeAdapters = [new AppShotAdapter()]
      const metaAdapters = [new ClaudeMetadataAdapter()]
      const uploadAdapters = [new FastlaneDeliverAdapter(), new FastlaneSupplyAdapter()]
      const submitAdapters = [new AppStoreSubmitAdapter(), new PlayStoreSubmitAdapter()]

      const stages = [
        {
          name: 'detect' as StageName,
          run: async (c: PipelineContext) => {
            const profile = await detectAdapter.run(undefined, c)
            c.profile = profile
            return profile
          },
        },
        {
          name: 'wrap' as StageName,
          run: async (c: PipelineContext) => {
            const adapter = selectAdapter(wrapAdapters, c.profile, c)
            return adapter.run(c.profile!, c)
          },
        },
        {
          name: 'build' as StageName,
          run: async (c: PipelineContext) => {
            const adapter = selectAdapter(buildAdapters, c.profile, c)
            const artifacts = await adapter.run(c.profile!, c) as BuildArtifacts
            c.artifacts = artifacts
            return artifacts
          },
        },
        {
          name: 'capture' as StageName,
          run: async (c: PipelineContext) => {
            await Promise.all(
              captureAdapters
                .filter((a) => a.canHandle(c.profile, c))
                .map((a) => a.run(c.profile!, c))
            )
          },
        },
        {
          name: 'compose' as StageName,
          run: async (c: PipelineContext) => {
            const adapter = selectAdapter(composeAdapters, c.profile, c)
            return adapter.run(c.profile!, c)
          },
        },
        {
          name: 'ai_meta' as StageName,
          run: async (c: PipelineContext) => {
            const adapter = selectAdapter(metaAdapters, c.profile, c)
            return adapter.run(c.profile!, c)
          },
        },
        {
          name: 'upload' as StageName,
          run: async (c: PipelineContext) => {
            const active = uploadAdapters.filter((a) => a.canHandle(c.profile, c))
            const results = await Promise.all(active.map((a) => a.run(c.artifacts!, c)))
            return Object.assign({}, ...results)
          },
        },
        {
          name: 'submit' as StageName,
          run: async (c: PipelineContext) => {
            const active = submitAdapters.filter((a) => a.canHandle(c.profile, c))
            const results = await Promise.all(active.map((a) => a.run({}, c)))
            return Object.assign({}, ...results)
          },
        },
      ]

      await runPipeline(stages, ctx, {
        resume: opts.resume,
        fromStage: opts.from as StageName | undefined,
        skipStages: opts.skip?.split(',') as StageName[] | undefined,
      })
    })
}

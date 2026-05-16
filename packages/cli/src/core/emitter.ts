import type { PipelineEvent } from '../types/index.js'

export function createEmitter(jsonMode: boolean): (event: PipelineEvent) => void {
  return (event: PipelineEvent) => {
    if (jsonMode) {
      process.stdout.write(JSON.stringify(event) + '\n')
      return
    }

    switch (event.event) {
      case 'stage_start':
        process.stderr.write(`▶  ${event.stage}\n`)
        break
      case 'stage_complete':
        process.stderr.write(`✓  ${event.stage} (${(event.durationMs / 1000).toFixed(1)}s)\n`)
        break
      case 'stage_skip':
        process.stderr.write(`⊘  ${event.stage} — skipped\n`)
        break
      case 'log':
        if (event.level !== 'info' || process.env.SHIPYARD_VERBOSE) {
          process.stderr.write(`   ${event.msg}\n`)
        }
        break
      case 'ai_generating':
        process.stderr.write(`   AI generating ${event.stage} for ${event.locale} (${event.model})\n`)
        break
      case 'pipeline_complete':
        process.stderr.write(`\n🚀  Pipeline complete in ${(event.totalDurationMs / 1000).toFixed(0)}s\n`)
        break
      case 'pipeline_failed':
        process.stderr.write(`\n✗  Pipeline failed at ${event.stage}: ${event.error}\n`)
        process.stderr.write(`   Error class: ${event.class}\n`)
        if (event.class === 'retriable' || event.class === 'fixable') {
          process.stderr.write(`   Run 'shipyard deploy --resume' to retry from this stage.\n`)
        }
        break
    }
  }
}

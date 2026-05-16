import { Command } from 'commander'
import { join } from 'path'
import fs from 'fs-extra'
import type { PipelineState } from '../types/index.js'

export function statusCommand(): Command {
  return new Command('status')
    .description('Show live review status from state file and store APIs')
    .option('--json', 'Output raw JSON')
    .action(async (opts) => {
      const statePath = join(process.cwd(), '.shipyard/state.json')
      if (!(await fs.pathExists(statePath))) {
        console.error('No .shipyard/state.json found. Run shipyard deploy first.')
        process.exit(1)
      }

      const state: PipelineState = await fs.readJson(statePath)

      if (opts.json) {
        console.log(JSON.stringify(state, null, 2))
        return
      }

      console.log(`\nShipyard Run: ${state.runId}`)
      console.log(`Started:      ${state.startedAt}\n`)

      for (const [stage, info] of Object.entries(state.stages)) {
        const icon =
          info.status === 'completed' ? '✓' :
          info.status === 'failed'    ? '✗' :
          info.status === 'running'   ? '▶' :
          info.status === 'skipped'   ? '⊘' : '·'
        const duration = info.durationMs ? ` (${(info.durationMs / 1000).toFixed(1)}s)` : ''
        console.log(`  ${icon}  ${stage.padEnd(12)} ${info.status}${duration}`)
        if (info.error) console.log(`        ↳ ${info.error}`)
      }

      console.log()
    })
}

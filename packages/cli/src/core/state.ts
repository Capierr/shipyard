import { join } from 'path'
import fs from 'fs-extra'
import type { PipelineState } from '../types/index.js'

const STATE_FILE = '.shipyard/state.json'

export async function readState(projectRoot: string): Promise<PipelineState> {
  const statePath = join(projectRoot, STATE_FILE)
  if (!(await fs.pathExists(statePath))) {
    throw new Error(`No state file found at ${statePath}. Run without --resume to start fresh.`)
  }
  return fs.readJson(statePath) as Promise<PipelineState>
}

export async function writeState(projectRoot: string, state: PipelineState): Promise<void> {
  const statePath = join(projectRoot, STATE_FILE)
  await fs.ensureDir(join(projectRoot, '.shipyard'))
  await fs.writeJson(statePath, state, { spaces: 2 })
}

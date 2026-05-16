import { join } from 'path'
import fs from 'fs-extra'
import yaml from 'js-yaml'
import { ShipyardConfigSchema, type ShipyardConfig } from '../types/index.js'

const CONFIG_PATH = '.shipyard/config.yml'

export async function loadConfig(projectRoot: string): Promise<ShipyardConfig> {
  const configPath = join(projectRoot, CONFIG_PATH)
  if (!(await fs.pathExists(configPath))) {
    throw new Error(
      `No .shipyard/config.yml found. Run 'shipyard setup' to initialise this project.`,
    )
  }
  const raw = yaml.load(await fs.readFile(configPath, 'utf8'))
  return ShipyardConfigSchema.parse(raw)
}

export async function writeConfig(projectRoot: string, config: ShipyardConfig): Promise<void> {
  const configPath = join(projectRoot, CONFIG_PATH)
  await fs.ensureDir(join(projectRoot, '.shipyard'))
  await fs.writeFile(configPath, yaml.dump(config), 'utf8')
}

export function resolveCredential(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw Object.assign(new Error(`Missing required credential: ${key}`), {
      class: 'credential',
    })
  }
  return value
}

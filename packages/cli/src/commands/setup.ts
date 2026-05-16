import { Command } from 'commander'

export function setupCommand(): Command {
  return new Command('setup')
    .description('One-time credential wizard for this project')
    .option('--repair', 'Re-collect only broken/missing credentials')
    .action(async (_opts) => {
      // TODO Phase 8: Interactive credential wizard
      // Detects storage backend (env | keychain | 1password)
      // Walks through each required credential
      // Validates each before saving
      // Writes .shipyard/config.yml if not present
      console.error('shipyard setup — credential wizard coming in Phase 8')
      process.exit(0)
    })
}

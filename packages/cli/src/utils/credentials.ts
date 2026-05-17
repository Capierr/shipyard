import { join } from 'path'
import fs from 'fs-extra'
import chalk from 'chalk'

const CREDS_DIR = '.shipyard'
const CREDS_FILE = '.env'

/**
 * Append a KEY=VALUE line to .shipyard/.env (creating the file if needed).
 * Emits a one-time warning reminding the user to gitignore the file.
 */
export async function storeCredential(
  key: string,
  value: string,
  projectRoot = process.cwd(),
): Promise<void> {
  const dir = join(projectRoot, CREDS_DIR)
  const filePath = join(dir, CREDS_FILE)

  await fs.ensureDir(dir)

  const alreadyExists = await fs.pathExists(filePath)
  if (!alreadyExists) {
    process.stderr.write(
      chalk.yellow(
        `\nWarning: Writing credentials to ${CREDS_DIR}/${CREDS_FILE}.\n` +
          `Make sure "${CREDS_DIR}/${CREDS_FILE}" is listed in your .gitignore so secrets are never committed.\n`,
      ),
    )
  }

  // Read existing content so we can overwrite a key that was already set
  let lines: string[] = []
  if (alreadyExists) {
    const existing = await fs.readFile(filePath, 'utf8')
    lines = existing.split('\n').filter(Boolean)
  }

  // Remove any pre-existing line for this key
  lines = lines.filter((line) => !line.startsWith(`${key}=`))
  lines.push(`${key}=${value}`)

  await fs.writeFile(filePath, lines.join('\n') + '\n', 'utf8')
}

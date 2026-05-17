import * as readline from 'readline'

const isCI = (): boolean =>
  !!process.env.CI || !!process.env.SHIPYARD_NON_INTERACTIVE

function createRL(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  })
}

/**
 * Ask the user for free-form text input.
 * Returns `defaultVal` immediately in CI/non-interactive mode.
 */
export async function ask(question: string, defaultVal?: string): Promise<string> {
  if (isCI()) {
    return defaultVal ?? ''
  }

  const rl = createRL()
  const prompt = defaultVal ? `${question} [${defaultVal}]: ` : `${question}: `

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close()
      resolve(answer.trim() || defaultVal || '')
    })
  })
}

/**
 * Present a numbered list of options and return the chosen value.
 * Returns `options[0]` immediately in CI/non-interactive mode.
 */
export async function choose(question: string, options: string[]): Promise<string> {
  if (isCI()) {
    return options[0] ?? ''
  }

  if (options.length === 0) {
    throw new Error('choose() requires at least one option')
  }

  const rl = createRL()

  process.stderr.write(`${question}\n`)
  options.forEach((opt, i) => {
    process.stderr.write(`  ${i + 1}) ${opt}\n`)
  })

  return new Promise((resolve) => {
    const askChoice = (): void => {
      rl.question(`Enter number [1]: `, (answer) => {
        const trimmed = answer.trim()
        if (trimmed === '') {
          rl.close()
          resolve(options[0])
          return
        }
        const idx = parseInt(trimmed, 10) - 1
        if (idx >= 0 && idx < options.length) {
          rl.close()
          resolve(options[idx])
        } else {
          process.stderr.write(`  Please enter a number between 1 and ${options.length}\n`)
          askChoice()
        }
      })
    }
    askChoice()
  })
}

/**
 * Ask a yes/no question and return a boolean.
 * Returns `defaultVal` immediately in CI/non-interactive mode.
 */
export async function confirm(question: string, defaultVal = true): Promise<boolean> {
  if (isCI()) {
    return defaultVal
  }

  const rl = createRL()
  const hint = defaultVal ? '[Y/n]' : '[y/N]'

  return new Promise((resolve) => {
    rl.question(`${question} ${hint}: `, (answer) => {
      rl.close()
      const trimmed = answer.trim().toLowerCase()
      if (trimmed === '') {
        resolve(defaultVal)
        return
      }
      resolve(trimmed === 'y' || trimmed === 'yes')
    })
  })
}

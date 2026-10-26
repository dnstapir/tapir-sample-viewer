import { describe, expect, it } from 'vitest'
import packageJson from '../package.json' with { type: 'json' }
import lockfile from '../pnpm-lock.yaml?raw'

describe('package.json', () => {
  it('should have MIT license', () => {
    expect(packageJson.license).toBe('MIT')
  })
})

describe('pnpm-lock.yaml', () => {
  it('should not install react or react-dom, directly or transitively', () => {
    // package keys are indented two spaces, e.g. `  react@19.0.0:` or `  'react-dom@19.0.0':`
    const reactPackages = lockfile.match(/^ {2}'?(react|react-dom)@[^\n]*/gm) ?? []
    expect(reactPackages).toEqual([])
  })
})

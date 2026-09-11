/** Workspace-less temporary Session scratch-directory isolation. */

import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent, AgentFactory } from '@deepseek-ai/dsh-agent'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import { afterEach, describe, expect, it } from 'vitest'
import type { TestSessionRemote } from './test-remote.ts'
import { createSessionTestRemote } from './test-remote.ts'

/** Booted contexts and their temp roots, torn down after each test. */
const contexts: Context[] = []
const tempDirs: string[] = []
afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempDir(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)))
  tempDirs.push(dir)
  return dir
}

/** Boot the production Session Controller over a stub Agent factory. */
async function harness(
  temporarySessionRoot?: string,
  useDeploymentScratchRoot = false,
): Promise<{ ctx: Context; remote: TestSessionRemote; cwd: string }> {
  const cwd = tempDir('dsh-temporary-session-')
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  const factory: AgentFactory = {
    async createAgent(_ownerCtx, options) {
      const session = ctx.sessions.create(
        options.sessionId,
        options.meta === undefined ? {} : { meta: options.meta },
      )
      const agent = { id: session.id, session, status: 'idle' } as unknown as Agent
      ;(agent as { ctx?: Context }).ctx = ctx
      await options.setup?.(ctx, agent)
      const unregister = ctx.agents.register(agent)
      return { agent, dispose: () => { unregister(); return Promise.resolve() } }
    },
    async resume(): Promise<never> {
      throw new Error('test harness has no persisted sessions')
    },
  }
  ctx.agents.setFactory(factory)
  const remote = createSessionTestRemote(ctx, {
    defaultModelSelection: () => ({ provider: 'test', model: 'test-model' }),
    cwd,
    ...temporarySessionRoot === undefined ? {} : { temporarySessionRoot },
    ...useDeploymentScratchRoot ? { useDeploymentScratchRoot: true } : {},
  })
  return { ctx, remote, cwd }
}

describe('workspace-less temporary Session isolation', () => {
  it('gives each Session its own scratch directory under the configured root', async () => {
    const root = tempDir('dsh-temporary-root-')
    const temporarySessionRoot = join(root, 'tmp-sessions')
    const { ctx, remote } = await harness(temporarySessionRoot)

    const first = await remote.create({ sessionId: SessionId('tmp-a') })
    expect(first.ok).toBe(true)
    const firstCwd = ctx.sessions.get(SessionId('tmp-a'))?.header.cwd
    expect(firstCwd?.startsWith(`${temporarySessionRoot}/`)).toBe(true)
    expect(existsSync(firstCwd as string)).toBe(true)

    const second = await remote.create({ sessionId: SessionId('tmp-b') })
    expect(second.ok).toBe(true)
    const secondCwd = ctx.sessions.get(SessionId('tmp-b'))?.header.cwd
    expect(secondCwd?.startsWith(`${temporarySessionRoot}/`)).toBe(true)
    expect(secondCwd).not.toBe(firstCwd)
  })

  it('honors an explicit cwd and keeps the shared default without a scratch root', async () => {
    const { ctx, remote, cwd } = await harness()
    const explicit = join(cwd, 'explicit')
    const explicitSession = await remote.create({ sessionId: SessionId('tmp-cwd'), cwd: explicit })
    expect(explicitSession.ok).toBe(true)
    expect(ctx.sessions.get(SessionId('tmp-cwd'))?.header.cwd).toBe(explicit)

    const shared = await remote.create({ sessionId: SessionId('tmp-default') })
    expect(shared.ok).toBe(true)
    expect(ctx.sessions.get(SessionId('tmp-default'))?.header.cwd).toBe(cwd)
  })

  it('resolves the deployment scratch root from DSH_HOME when no override is injected', async () => {
    const dshHome = tempDir('dsh-temporary-home-')
    const previous = process.env.DSH_HOME
    process.env.DSH_HOME = dshHome
    try {
      const { ctx, remote } = await harness(undefined, true)
      const created = await remote.create({ sessionId: SessionId('tmp-deployment') })
      expect(created.ok).toBe(true)
      const cwd = ctx.sessions.get(SessionId('tmp-deployment'))?.header.cwd
      expect(cwd?.startsWith(`${join(dshHome, 'tmp-sessions')}/`)).toBe(true)
      expect(existsSync(cwd as string)).toBe(true)
    } finally {
      if (previous === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previous
    }
  })
})

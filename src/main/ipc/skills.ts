import type { Store } from '../persistence'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import {
  SkillDiscoveryTargetSchema,
  type SkillDiscoveryResult,
  type SkillDiscoveryTarget
} from '../../shared/skills'
import {
  BundledSkillExecuteRequestSchema,
  BundledSkillPlanRequestSchema,
  type BundledSkillInstallResult,
  type BundledSkillPlan
} from '../../shared/bundled-skill-plan'
import {
  discoverSkillsOnTarget,
  resolveSkillDiscoveryTarget
} from '../skills/skill-discovery-target'
import { registerSkillCloudIpcHandlers } from './skill-cloud-ipc-handlers'
import { handleMainWindowSkillIpc } from './skill-ipc-main-window'
import { resolveSkillSourceCommit } from '../../shared/fork-hooks/skill-source-commit'

export function registerSkillsHandlers(store: Store, runtime?: OrcaRuntimeService): void {
  const discover = async (target?: SkillDiscoveryTarget): Promise<SkillDiscoveryResult> => {
    const parsedTarget = target ? SkillDiscoveryTargetSchema.parse(target) : undefined
    const resolvedTarget = resolveSkillDiscoveryTarget(parsedTarget)
    return discoverSkillsOnTarget(resolvedTarget, store.getRepos(), {
      providerRootOverrides: await runtime?.resolveSkillDiscoveryProviderRoots(resolvedTarget),
      refresh: parsedTarget?.refresh === true
    })
  }
<<<<<<< HEAD
  const scanInventory = (): Promise<SkillFreshnessInventory> =>
    // Why: the update command targets this machine's global homes. WSL and SSH
    // inventories stay out until their installer rail has an equivalent proof.
    inventorySkillFreshness({ repos: store.getRepos() })

  const runner = new SkillUpdateRunner({
    // fork: skill updates clone the upstream base when one is registered.
    sourceCommit: resolveSkillSourceCommit(ORCA_BUILD_COMMIT) ?? ORCA_BUILD_COMMIT,
    // Why: per-skill outcomes come from re-hashing what is actually on disk, not
    // from scraping stdout.
    rescanOutdatedNames: async (names) => {
      // Why: the run just rewrote skill packages on this host. Clients that never
      // send `refresh` (older builds) would otherwise read a pre-run scan.
      clearSkillDiscoveryCaches()
      return skillUpdateFailedNames(names, (await scanInventory()).installations)
    },
    onState: (run: SkillUpdateRun) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send('skills:updateRun', run)
        }
      }
    }
  })
=======
>>>>>>> 68828708505aaefe0402e8df994da9365a6f9e19

  handleMainWindowSkillIpc(
    'skills:discover',
    async (_event, target?: SkillDiscoveryTarget): Promise<SkillDiscoveryResult> => discover(target)
  )

  if (!runtime) {
    return
  }
  registerSkillCloudIpcHandlers(runtime, discover)

  // Local host only; paired hosts plan Orca's skills over RPC.
  handleMainWindowSkillIpc(
    'skills:bundledPlan',
    async (_event, value: unknown): Promise<BundledSkillPlan> =>
      runtime.planLocalBundledSkills(BundledSkillPlanRequestSchema.parse(value ?? {}))
  )
  handleMainWindowSkillIpc(
    'skills:bundledExecute',
    async (_event, value: unknown): Promise<BundledSkillInstallResult> =>
      runtime.executeLocalBundledSkills(BundledSkillExecuteRequestSchema.parse(value))
  )
}

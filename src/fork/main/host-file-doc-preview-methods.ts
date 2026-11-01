// F046: the host reads a doc preview outside every workspace by absolute path, through upstream's
// doc-preview access (canonical containment, fonts, PDF, ranged reads). Terminal grants stop at
// 512 KiB of text and refuse fonts.
import { realpath } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { z } from 'zod'
import type { OrcaRuntimeService } from '../../main/runtime/orca-runtime'
import { defineMethod } from '../../main/runtime/rpc/core'
import { remoteFileContentBudget } from '../../main/runtime/rpc/methods/files-remote-content-budget'
import { requireLocalRuntimeFileRoute } from '../../main/runtime/files/file-target'
import {
  assertPreviewWithinTransportBudget,
  LOCAL_PREVIEWABLE_BINARY_MAX_BYTES,
  MOBILE_FILE_READ_MAX_BYTES,
  previewableBinaryByteLimit
} from '../../main/runtime/files/file-preview-budget'
import {
  DOC_PREVIEW_PATH_AUTHORIZATION_ERROR,
  readAuthorizedDocPreviewFile,
  readAuthorizedDocPreviewFileChunk,
  type DocPreviewFileTarget
} from '../../shared/doc-preview-file-access'
import { WorktreeSelector } from '../../shared/rpc-contract/files-target-params'
import {
  HOST_DOC_PREVIEW_READ_CHUNK_METHOD,
  HOST_DOC_PREVIEW_READ_METHOD
} from '../../shared/fork-hooks/host-file-doc-preview'
import { isHiddenBelow } from './host-file-doc-preview-paths'

const HostPath = z.string().min(1).refine(isAbsolute, 'Expected an absolute path')

// `worktree` is the clicked workspace: it picks the route, it does not bound the read.
const HostDocPreviewRead = WorktreeSelector.extend({
  boundaryPath: HostPath,
  entryPath: HostPath,
  implicitRootPath: HostPath.nullable(),
  authorizedRootPaths: z.array(HostPath),
  targetPath: HostPath
})

const HostDocPreviewReadChunk = HostDocPreviewRead.extend({
  offset: z.number().int().nonnegative(),
  length: z
    .number()
    .int()
    .positive()
    .max(512 * 1024)
})

export type HostDocPreviewReadParams = z.input<typeof HostDocPreviewRead>

async function hostDocPreviewTarget(
  runtime: Pick<OrcaRuntimeService, 'resolveRuntimeFileTarget'>,
  params: z.output<typeof HostDocPreviewRead>
): Promise<DocPreviewFileTarget> {
  // Why: a workspace this host reaches over SSH names another machine's paths.
  requireLocalRuntimeFileRoute(await runtime.resolveRuntimeFileTarget(params.worktree))
  const [boundary, entry, target] = await Promise.all([
    realpath(params.boundaryPath),
    realpath(params.entryPath),
    realpath(params.targetPath)
  ])
  // Why canonical: a plain-named link beside the page must not reach `.env` either.
  if (target !== entry && isHiddenBelow(boundary, target)) {
    throw new Error(DOC_PREVIEW_PATH_AUTHORIZATION_ERROR)
  }
  return {
    boundaryPath: params.boundaryPath,
    entryPath: params.entryPath,
    implicitRootPath: params.implicitRootPath,
    authorizedRootPaths: params.authorizedRootPaths,
    targetPath: target
  }
}

// Desktop, orcad and `orca serve` share this table (src/fork/main/rpc-methods.ts).
export const HOST_FILE_DOC_PREVIEW_METHODS = [
  defineMethod({
    name: HOST_DOC_PREVIEW_READ_METHOD,
    permission: 'workspace',
    params: HostDocPreviewRead,
    handler: async (params, { runtime, clientKind, requestId }) => {
      const budget = remoteFileContentBudget(clientKind, requestId)
      return assertPreviewWithinTransportBudget(
        await readAuthorizedDocPreviewFile({
          ...(await hostDocPreviewTarget(runtime, params)),
          maxTextBytes: MOBILE_FILE_READ_MAX_BYTES,
          maxBinaryBytes:
            budget === undefined
              ? LOCAL_PREVIEWABLE_BINARY_MAX_BYTES
              : previewableBinaryByteLimit(budget)
        }),
        budget
      )
    }
  }),
  defineMethod({
    name: HOST_DOC_PREVIEW_READ_CHUNK_METHOD,
    permission: 'workspace',
    params: HostDocPreviewReadChunk,
    handler: async (params, { runtime }) =>
      readAuthorizedDocPreviewFileChunk(
        await hostDocPreviewTarget(runtime, params),
        params.offset,
        params.length
      )
  })
]

export type HostFileDocPreviewMethodName = (typeof HOST_FILE_DOC_PREVIEW_METHODS)[number]['name']

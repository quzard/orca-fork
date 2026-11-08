/* oxlint-disable max-lines -- fork: hook call only */
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
<<<<<<< HEAD
import { renderSidebarContextMenu } from '../../../../../../shared/fork-hooks/sidebar-chrome'
import { worktreeMenuGroups } from '../../../../../../shared/fork-hooks/worktree-menu-groups'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Copy,
  Bell,
  BellOff,
  CircleX,
  Pencil,
  Pin,
  PinOff,
  Trash2,
  Unlink,
  Workflow,
  FolderInput,
  FolderPlus,
  FolderTree,
  GitBranchPlus
} from 'lucide-react'
=======
import { Bell, BellOff, Pencil, Pin, PinOff, Unlink } from 'lucide-react'
>>>>>>> 8781bcb6be31f7c83651d5349fb151e8e29b8e66
import { cn } from '@/lib/utils'
import { WorktreeRowOpenInSubMenu } from '../open/WorktreeRowOpenInSubMenu'
import { WorktreeDeveloperMenu } from '../open/WorktreeDeveloperMenu'
import { WorkspaceSleepMenuItems } from '../sleep/WorkspaceSleepMenuItems'
import { isEventTargetInsideCurrentTarget } from '../../workspace-card/controller/worktree-card-dom-events'
import { useTranslate } from '@/i18n/use-translate'
import type { WorktreeContextMenuModel } from './use-worktree-context-menu-model'
import { WorktreeStatusMenuItems } from '../../workspace-status/presentation/WorktreeStatusMenuItems'
import { WorktreeWslHostStartMenuItem } from '../../workspace-card/host/WorktreeWslHostStartMenuItem'
import { WorktreeContextMenuOverlays } from './WorktreeContextMenuOverlays'
import { WorktreeContextMenuDeleteItems } from './WorktreeContextMenuDeleteItems'
import {
  WorktreeCopySubMenu,
  WorktreeLineageSubMenu,
  WorktreeProjectGroupSubMenu
} from './WorktreeContextMenuSubMenus'
import {
  WORKTREE_CONTEXT_MENU_SCOPE_ATTR,
  shouldIgnoreNestedWorktreeContextMenuScope,
  shouldRevealWorktreeDeveloperMenu,
  shouldUseNativeContextMenu
} from './worktree-context-menu-policy'
import { CLOSE_ALL_CONTEXT_MENUS_EVENT } from '@/lib/close-all-context-menus'

export default function WorktreeContextMenuView({ model }: { model: WorktreeContextMenuModel }) {
  const {
    children,
    contentClassName,
    contextMenuOpenedAtRef,
    contextWorkspaceStatus,
    deletingContext,
    deletingSubtree,
    developerMenuRevealed,
    effectiveSelectedWorktrees,
    handleAssignWorkspaceStatus,
    handleCloseAutoFocus,
    handleCloseTerminals,
    handleRemoveParentLink,
    handleRename,
    handleSleepSubtree,
    handleTogglePin,
    handleToggleRead,
    hasAnyContextLineage,
    isDeleting,
    isMultiContext,
    lineageDescendantCount,
    menuOpen,
    menuPoint,
    onContextMenuSelect,
    repo,
    scopeRef,
    setContextWorktrees,
    setDeveloperMenuRevealed,
    setMenuOpenState,
    setMenuPoint,
    sleepLabel,
    sleepableWorktrees,
    subtreeSleepableWorktrees,
    suppressOpeningPointerEvent,
    worktree,
    workspaceStatuses
  } = model
<<<<<<< HEAD
  const deleteShortcut = useOptionalShortcutLabel('workspace.delete')
  const menuGroups = worktreeMenuGroups({
    worktree,
    repo,
    projectGroups,
    handleMoveProjectToGroup,
    handleRemoveProjectFromGroup
  })
=======
  const t = useTranslate()
>>>>>>> 8781bcb6be31f7c83651d5349fb151e8e29b8e66
  return (
    <div
      ref={scopeRef}
      className="relative"
      {...{ [WORKTREE_CONTEXT_MENU_SCOPE_ATTR]: 'worktree' }}
      onContextMenuCapture={(event) => {
        if (!isEventTargetInsideCurrentTarget(event.currentTarget, event.target)) {
          return
        }
        if (shouldUseNativeContextMenu(event.target)) {
          return
        }
        if (shouldIgnoreNestedWorktreeContextMenuScope(event.currentTarget, event.target)) {
          return
        }
        event.preventDefault()
        contextMenuOpenedAtRef.current = Date.now()
        window.dispatchEvent(new Event(CLOSE_ALL_CONTEXT_MENUS_EVENT))
        setDeveloperMenuRevealed(event.altKey)
        setContextWorktrees(onContextMenuSelect?.(event) ?? effectiveSelectedWorktrees)
        const bounds = event.currentTarget.getBoundingClientRect()
        setMenuPoint({ x: event.clientX - bounds.left, y: event.clientY - bounds.top })
        setMenuOpenState(true)
      }}
      onClickCapture={(event) => {
        suppressOpeningPointerEvent(event)
      }}
    >
      {children}
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpenState} modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            aria-hidden
            tabIndex={-1}
            className="pointer-events-none absolute size-px opacity-0"
            style={{ left: menuPoint.x, top: menuPoint.y }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className={cn('min-w-52', contentClassName)}
          sideOffset={0}
          align="start"
          onPointerUpCapture={suppressOpeningPointerEvent}
          onPointerDownCapture={(event) => {
            if (event.button === 0) {
              contextMenuOpenedAtRef.current = null
            }
          }}
          onMouseUpCapture={suppressOpeningPointerEvent}
          onClickCapture={suppressOpeningPointerEvent}
          onCloseAutoFocus={handleCloseAutoFocus}
        >
          <DropdownMenuLabel>
            <span className="block max-w-60 truncate">
              {isMultiContext || !worktree.displayName
                ? t('auto.components.sidebar.WorktreeContextMenu.workspaceSection', 'Workspace')
                : worktree.displayName}
            </span>
          </DropdownMenuLabel>
          {!isMultiContext && <WorktreeWslHostStartMenuItem worktreeId={worktree.id} />}
<<<<<<< HEAD
          {!isMultiContext && (
            <DropdownMenuItem onSelect={handleRename} disabled={isDeleting}>
              <Pencil className="size-3.5" />
              {translate('auto.components.sidebar.WorktreeContextMenu.439fa94d53', 'Update')}
            </DropdownMenuItem>
          )}
          <WorktreeStatusMenuItems
            contextWorkspaceStatus={contextWorkspaceStatus}
            deletingContext={deletingContext}
            isMultiContext={isMultiContext}
            onAssignWorkspaceStatus={handleAssignWorkspaceStatus}
            workspaceStatuses={workspaceStatuses}
          />
          <DropdownMenuSeparator />
          {!isMultiContext && (
            <>
              <WorktreeRowOpenInSubMenu
                worktree={worktree}
                connectionId={repo?.connectionId ?? null}
                disabled={isDeleting}
              />
              <DropdownMenuItem onSelect={handleCopyPath} disabled={isDeleting}>
                <Copy className="size-3.5" />
                {translate('auto.components.sidebar.WorktreeContextMenu.3350101edb', 'Copy Path')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleCopyName} disabled={isDeleting}>
                <Copy className="size-3.5" />
                {translate(
                  'auto.components.sidebar.WorktreeContextMenu.copyWorktreeName',
                  'Copy Worktree Name'
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleTogglePin} disabled={isDeleting}>
                {worktree.isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                {worktree.isPinned
                  ? translate('auto.components.sidebar.WorktreeContextMenu.697d0f6e1b', 'Unpin')
                  : translate('auto.components.sidebar.WorktreeContextMenu.3baa7d6507', 'Pin')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleToggleRead} disabled={isDeleting}>
                {worktree.isUnread ? (
                  <BellOff className="size-3.5" />
                ) : (
                  <Bell className="size-3.5" />
                )}
                {worktree.isUnread
                  ? translate('auto.components.sidebar.WorktreeContextMenu.8dacff1fe0', 'Mark Read')
                  : translate(
                      'auto.components.sidebar.WorktreeContextMenu.f50603c6b2',
                      'Mark Unread'
                    )}
              </DropdownMenuItem>
              {repo ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={handleCreateGroupFromRepo} disabled={isDeleting}>
                    <FolderPlus className="size-3.5" />
                    {translate(
                      'auto.components.sidebar.WorktreeContextMenu.503ec0f8e6',
                      'New group from project'
                    )}
                  </DropdownMenuItem>
                  {menuGroups.groups.length > 0 ? (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger disabled={isDeleting}>
                        <FolderInput className="size-3.5" />
                        {translate(
                          'auto.components.sidebar.WorktreeContextMenu.76865d827f',
                          'Move to group'
                        )}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {menuGroups.groups.map((group) => (
                          <DropdownMenuItem
                            key={group.id}
                            disabled={menuGroups.currentGroupId === group.id}
                            onSelect={() => menuGroups.onMove(group.id)}
                          >
                            <span className="max-w-48 truncate">{group.name}</span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  ) : null}
                  {menuGroups.currentGroupId ? (
                    <DropdownMenuItem onSelect={menuGroups.onRemove} disabled={isDeleting}>
                      <CircleX className="size-3.5" />
                      {translate(
                        'auto.components.sidebar.WorktreeContextMenu.d35dfeae58',
                        'Remove from group'
                      )}
                    </DropdownMenuItem>
                  ) : null}
                </>
              ) : null}
              <DropdownMenuSeparator />
              {model.canCreateChildWorktree ? (
                <DropdownMenuItem onSelect={handleNewChildWorktree} disabled={isDeleting}>
                  <GitBranchPlus className="size-3.5" />
                  {translate(
                    'auto.components.sidebar.WorktreeContextMenu.newChildWorktree',
                    'New Child Worktree...'
                  )}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                onSelect={handleOpenParentPicker}
                disabled={isWorktreeParentPickerDisabled({ isDeleting, eligibleParentCount })}
              >
                <FolderTree className="size-3.5" />
                {getWorktreeParentPickerLabel(validParentWorktreeId)}
              </DropdownMenuItem>
              {(validParentWorktreeId || hasParentLink) && (
                <>
                  {validParentWorktreeId && (
                    <DropdownMenuItem onSelect={handleOpenParent} disabled={isDeleting}>
                      <Workflow className="size-3.5" />
                      {translate(
                        'auto.components.sidebar.WorktreeContextMenu.8d9cd19d09',
                        'Open Parent Worktree'
                      )}
                    </DropdownMenuItem>
                  )}
                  {hasParentLink && (
                    <DropdownMenuItem onSelect={handleRemoveParentLink} disabled={isDeleting}>
                      <Unlink className="size-3.5" />
                      {translate(
                        'auto.components.sidebar.WorktreeContextMenu.579b1a8e61',
                        'Remove from Parent'
                      )}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                </>
              )}
            </>
          )}
          {isMultiContext && hasAnyContextLineage ? (
            <>
              <DropdownMenuItem onSelect={handleRemoveParentLink} disabled={deletingContext}>
                <Unlink className="size-3.5" />
                {translate(
                  'auto.components.sidebar.WorktreeContextMenu.579b1a8e61',
                  'Remove from Parent'
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}

          {shouldRevealWorktreeDeveloperMenu({ developerMenuRevealed, isMultiContext }) ? (
            <>
              <WorktreeDeveloperMenu worktreeId={worktree.id} disabled={isDeleting} />
              <DropdownMenuSeparator />
            </>
          ) : null}
          {isMultiContext ? null : renderSidebarContextMenu(worktree)}
=======
>>>>>>> 8781bcb6be31f7c83651d5349fb151e8e29b8e66
          <WorkspaceSleepMenuItems
            isMultiContext={isMultiContext}
            sleepLabel={sleepLabel}
            sleepDisabled={deletingContext || sleepableWorktrees.length === 0}
            descendantCount={lineageDescendantCount}
            subtreeSleepDisabled={deletingSubtree || subtreeSleepableWorktrees.length === 0}
            onSleep={handleCloseTerminals}
            onSleepSubtree={handleSleepSubtree}
          />
          {!isMultiContext && (
            <DropdownMenuItem onSelect={handleToggleRead} disabled={isDeleting}>
              {worktree.isUnread ? <BellOff className="size-3.5" /> : <Bell className="size-3.5" />}
              {worktree.isUnread
                ? t('auto.components.sidebar.WorktreeContextMenu.8dacff1fe0', 'Mark Read')
                : t('auto.components.sidebar.WorktreeContextMenu.f50603c6b2', 'Mark Unread')}
            </DropdownMenuItem>
          )}
          <WorktreeContextMenuDeleteItems model={model} />
          <DropdownMenuSeparator />
          {!isMultiContext && (
            <>
              <DropdownMenuItem onSelect={handleRename} disabled={isDeleting}>
                <Pencil className="size-3.5" />
                {t('auto.components.sidebar.WorktreeContextMenu.editDetails', 'Edit Details…')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleTogglePin} disabled={isDeleting}>
                {worktree.isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                {worktree.isPinned
                  ? t('auto.components.sidebar.WorktreeContextMenu.697d0f6e1b', 'Unpin')
                  : t('auto.components.sidebar.WorktreeContextMenu.3baa7d6507', 'Pin')}
              </DropdownMenuItem>
            </>
          )}
          <WorktreeStatusMenuItems
            contextWorkspaceStatus={contextWorkspaceStatus}
            deletingContext={deletingContext}
            isMultiContext={isMultiContext}
            onAssignWorkspaceStatus={handleAssignWorkspaceStatus}
            workspaceStatuses={workspaceStatuses}
          />
          {!isMultiContext && (
            <>
              <DropdownMenuSeparator />
              <WorktreeRowOpenInSubMenu
                worktree={worktree}
                connectionId={repo?.connectionId ?? null}
                disabled={isDeleting}
              />
              <WorktreeCopySubMenu model={model} />
              <WorktreeLineageSubMenu model={model} />
              <WorktreeProjectGroupSubMenu model={model} />
            </>
          )}
          {isMultiContext && hasAnyContextLineage ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleRemoveParentLink} disabled={deletingContext}>
                <Unlink className="size-3.5" />
                {t('auto.components.sidebar.WorktreeContextMenu.579b1a8e61', 'Remove from Parent')}
              </DropdownMenuItem>
            </>
          ) : null}
          {shouldRevealWorktreeDeveloperMenu({ developerMenuRevealed, isMultiContext }) ? (
            <>
              <DropdownMenuSeparator />
              <WorktreeDeveloperMenu worktreeId={worktree.id} disabled={isDeleting} />
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <WorktreeContextMenuOverlays model={model} />
    </div>
  )
}

// The card's dimmed directory prefix in host-directory rows, truncated from the left.
import React from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { registerWorktreeDirectoryPrefix } from '../../shared/fork-hooks/sidebar-chrome'
import { DIRECTORY_TITLE_SEPARATOR } from './section-keys'

function DirectoryPrefix({ label, path }: { label: string; path: string }): React.JSX.Element {
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            dir="rtl"
            className="max-w-[45%] shrink truncate text-left text-xs text-muted-foreground"
          >
            <span dir="ltr">{label}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{path}</TooltipContent>
      </Tooltip>
      <span className="shrink-0 text-xs text-muted-foreground">{DIRECTORY_TITLE_SEPARATOR}</span>
    </>
  )
}

export function registerDirectoryPrefix(): void {
  registerWorktreeDirectoryPrefix((label, path) => <DirectoryPrefix label={label} path={path} />)
}

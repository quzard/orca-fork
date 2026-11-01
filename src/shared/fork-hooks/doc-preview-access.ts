// fork: F051. A document preview reads everything under its request base without a folder prompt.
// Unregistered, a grant keeps upstream's reach: the entry (and its folder below the base) until the
// reader allows more.
let openAccess: ((grantId: string) => void) | null = null

/** Main process (desktop): runs as each grant is minted. */
export function registerDocPreviewOpenAccess(next: (grantId: string) => void): void {
  openAccess = next
}

/** Right after minting, before the page can ask for anything. */
export function openDocPreviewAccess(grantId: string): void {
  openAccess?.(grantId)
}

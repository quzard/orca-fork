export type ForkTsProject = { name: string; include: RegExp[]; exclude: RegExp[]; aliases: boolean }
export function globToRegExp(glob: string): RegExp
export function readProject(file: string, name: string): ForkTsProject
export function violations(project: ForkTsProject): string[]
export function readForkProjects(): ForkTsProject[]

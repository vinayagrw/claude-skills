export type Call = { tool: string; what: string; tokens: number; at: number; isSub: boolean }
export type Sub = { id: string; label: string; startedAt: number; doneAt: number | null }

// One file as it stood before an edit; `before` null means the edit created it.
export type Snap = { n: number; turn: number; tool: string; path: string; before: string | null; at: number }

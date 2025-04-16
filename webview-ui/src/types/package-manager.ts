export type ComponentType = "mode" | "prompt" | "package" | "mcp server"

export interface ComponentMetadata {
	name: string
	description: string
	version: string
	type: ComponentType
	tags?: string[]
	author?: string
	authorUrl?: string
}

export interface PackageManagerItem {
	name: string
	description: string
	type: ComponentType
	url: string
	repoUrl: string
	sourceName?: string
	author?: string
	authorUrl?: string
	tags?: string[]
	version?: string
	lastUpdated?: string
	sourceUrl?: string
	defaultBranch?: string
	path?: string
	items?: {
		type: ComponentType
		path: string
		metadata?: ComponentMetadata
		lastUpdated?: string
	}[]
}

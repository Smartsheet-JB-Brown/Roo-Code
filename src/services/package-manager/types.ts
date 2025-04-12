/**
 * Supported component types
 */
export type ComponentType = "mode" | "prompt" | "package" | "mcp server"

/**
 * Base metadata interface
 */
export interface BaseMetadata {
	name: string
	description: string
	version: string
	tags?: string[]
}

/**
 * Repository root metadata
 */
export interface RepositoryMetadata extends BaseMetadata {}

/**
 * Component metadata with type
 */
export interface ComponentMetadata extends BaseMetadata {
	type: ComponentType
}

/**
 * Package metadata with optional external items
 */
export interface PackageMetadata extends ComponentMetadata {
	type: "package"
	items?: {
		type: ComponentType
		path: string
	}[]
}

/**
 * Represents an individual package manager item
 */
export interface PackageManagerItem {
	name: string
	description: string
	type: ComponentType
	url: string
	repoUrl: string
	sourceName?: string
	author?: string
	tags?: string[]
	version?: string
	lastUpdated?: string
	sourceUrl?: string
	items?: { type: ComponentType; path: string }[]
}

/**
 * Represents a Git repository source for package manager items
 */
export interface PackageManagerSource {
	url: string
	name?: string
	enabled: boolean
}

/**
 * Represents a repository with its metadata and items
 */
export interface PackageManagerRepository {
	metadata: RepositoryMetadata
	items: PackageManagerItem[]
	url: string
	error?: string
}

/**
 * Utility type for metadata files with locale
 */
export type LocalizedMetadata<T> = {
	[locale: string]: T
}

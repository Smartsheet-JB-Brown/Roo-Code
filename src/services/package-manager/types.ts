/**
 * Information about why an item matched search/filter criteria
 */
export interface MatchInfo {
	matched: boolean
	matchReason?: {
		nameMatch?: boolean
		descriptionMatch?: boolean
		tagMatch?: boolean
		typeMatch?: boolean
		hasMatchingSubcomponents?: boolean
	}
}

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
	author?: string
	authorUrl?: string
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
 * Package metadata with optional subcomponents
 */
export interface PackageMetadata extends ComponentMetadata {
	type: "package"
	items?: {
		type: ComponentType
		path: string
		metadata?: ComponentMetadata
	}[]
}

/**
 * Subcomponent metadata with parent reference
 */
export interface SubcomponentMetadata extends ComponentMetadata {
	parentPackage: {
		name: string
		path: string
	}
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
	authorUrl?: string
	tags?: string[]
	version?: string
	lastUpdated?: string
	sourceUrl?: string
	defaultBranch?: string
	path?: string // Add path to main item
	items?: {
		type: ComponentType
		path: string
		metadata?: ComponentMetadata
		lastUpdated?: string
		matchInfo?: MatchInfo // Add match information for subcomponents
	}[]
	matchInfo?: MatchInfo // Add match information for the package itself
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
	defaultBranch?: string
}

/**
 * Utility type for metadata files with locale
 */
export type LocalizedMetadata<T> = {
	[locale: string]: T
}

/**
 * Options for localization handling
 */
export interface LocalizationOptions {
	userLocale: string
	fallbackLocale: string
}

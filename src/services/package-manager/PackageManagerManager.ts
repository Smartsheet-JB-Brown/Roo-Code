import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs/promises"
import { GitFetcher } from "./GitFetcher"
import {
	PackageManagerItem,
	PackageManagerRepository,
	PackageManagerSource,
	ComponentType,
	ComponentMetadata,
	LocalizationOptions,
} from "./types"
import { getUserLocale } from "./utils"

/**
 * Service for managing package manager data
 */
export class PackageManagerManager {
	private currentItems: PackageManagerItem[] = []
	private static readonly CACHE_EXPIRY_MS = 3600000 // 1 hour

	private gitFetcher: GitFetcher
	private cache: Map<string, { data: PackageManagerRepository; timestamp: number }> = new Map()
	public isFetching = false

	// Concurrency control
	private activeSourceOperations = new Set<string>() // Track active git operations per source
	private isMetadataScanActive = false // Track active metadata scanning
	private pendingOperations: Array<() => Promise<void>> = [] // Queue for pending operations

	constructor(private readonly context: vscode.ExtensionContext) {
		const localizationOptions: LocalizationOptions = {
			userLocale: getUserLocale(),
			fallbackLocale: "en",
		}
		this.gitFetcher = new GitFetcher(context, localizationOptions)
	}

	/**
	 * Gets package manager items from all enabled sources
	 * @param sources The package manager sources
	 * @returns An array of PackageManagerItem objects
	 */
	/**
	 * Queue an operation to run when no metadata scan is active
	 */
	private async queueOperation(operation: () => Promise<void>): Promise<void> {
		if (this.isMetadataScanActive) {
			return new Promise((resolve) => {
				this.pendingOperations.push(async () => {
					await operation()
					resolve()
				})
			})
		}

		try {
			this.isMetadataScanActive = true
			await operation()
		} finally {
			this.isMetadataScanActive = false

			// Process any pending operations
			const nextOperation = this.pendingOperations.shift()
			if (nextOperation) {
				void this.queueOperation(nextOperation)
			}
		}
	}

	async getPackageManagerItems(
		sources: PackageManagerSource[],
	): Promise<{ items: PackageManagerItem[]; errors?: string[] }> {
		const items: PackageManagerItem[] = []
		const errors: string[] = []

		// Filter enabled sources
		const enabledSources = sources.filter((s) => s.enabled)

		// Process sources sequentially with locking
		for (const source of enabledSources) {
			if (this.isSourceLocked(source.url)) {
				continue
			}

			try {
				this.lockSource(source.url)

				// Queue metadata scanning operation
				await this.queueOperation(async () => {
					const repo = await this.getRepositoryData(source.url, false, source.name)

					if (repo.items && repo.items.length > 0) {
						items.push(...repo.items)
					}
				})
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error)
				console.error(`PackageManagerManager: Failed to fetch data from ${source.url}:`, error)
				errors.push(`Source ${source.url}: ${errorMessage}`)
			} finally {
				this.unlockSource(source.url)
			}
		}

		// Store the current items
		this.currentItems = items

		// Return both items and errors
		const result = {
			items,
			...(errors.length > 0 && { errors }),
		}

		return result
	}

	/**
	 * Gets repository data from a URL, using cache if available
	 * @param url The repository URL
	 * @param forceRefresh Whether to bypass the cache and force a refresh
	 * @param sourceName The name of the source
	 * @returns A PackageManagerRepository object
	 */
	/**
	 * Check if a source operation is in progress
	 */
	private isSourceLocked(url: string): boolean {
		return this.activeSourceOperations.has(url)
	}

	/**
	 * Lock a source for operations
	 */
	private lockSource(url: string): void {
		this.activeSourceOperations.add(url)
	}

	/**
	 * Unlock a source after operations complete
	 */
	private unlockSource(url: string): void {
		this.activeSourceOperations.delete(url)
	}

	async getRepositoryData(
		url: string,
		forceRefresh: boolean = false,
		sourceName?: string,
	): Promise<PackageManagerRepository> {
		try {
			// Check cache first (unless force refresh is requested)
			const cached = this.cache.get(url)

			if (!forceRefresh && cached && Date.now() - cached.timestamp < PackageManagerManager.CACHE_EXPIRY_MS) {
				return cached.data
			}

			// Fetch fresh data with timeout protection
			const fetchPromise = this.gitFetcher.fetchRepository(url, forceRefresh, sourceName)

			// Create a timeout promise
			let timeoutId: NodeJS.Timeout | undefined
			const timeoutPromise = new Promise<PackageManagerRepository>((_, reject) => {
				timeoutId = setTimeout(() => {
					reject(new Error(`Repository fetch timed out after 30 seconds: ${url}`))
				}, 30000) // 30 second timeout
			})

			try {
				// Race the fetch against the timeout
				const result = await Promise.race([fetchPromise, timeoutPromise])

				// Cache the result
				this.cache.set(url, { data: result, timestamp: Date.now() })

				return result
			} finally {
				if (timeoutId) {
					clearTimeout(timeoutId)
				}
			}
		} catch (error) {
			console.error(`PackageManagerManager: Error fetching repository data for ${url}:`, error)

			// Return empty repository data instead of throwing
			return {
				metadata: {
					name: "Unknown Repository",
					description: "Failed to load repository",
					version: "0.0.0",
				},
				items: [],
				url,
			}
		}
	}

	/**
	 * Refreshes a specific repository, bypassing the cache
	 * @param url The repository URL to refresh
	 * @param sourceName Optional name of the source
	 * @returns The refreshed repository data
	 */
	async refreshRepository(url: string, sourceName?: string): Promise<PackageManagerRepository> {
		try {
			// Force a refresh by bypassing the cache
			const data = await this.getRepositoryData(url, true, sourceName)
			return data
		} catch (error) {
			console.error(`PackageManagerManager: Failed to refresh repository ${url}:`, error)
			return {
				metadata: {
					name: "Unknown Repository",
					description: "Failed to load repository",
					version: "0.0.0",
				},
				items: [],
				url,
				error: error instanceof Error ? error.message : String(error),
			}
		}
	}

	/**
	 * Clears the in-memory cache
	 */
	clearCache(): void {
		this.cache.clear()
	}

	/**
	 * Cleans up cache directories for repositories that are no longer in the configured sources
	 * @param currentSources The current list of package manager sources
	 */
	async cleanupCacheDirectories(currentSources: PackageManagerSource[]): Promise<void> {
		try {
			// Get the cache directory path
			const cacheDir = path.join(this.context.globalStorageUri.fsPath, "package-manager-cache")

			// Check if cache directory exists
			try {
				await fs.stat(cacheDir)
			} catch (error) {
				return
			}

			// Get all subdirectories in the cache directory
			const entries = await fs.readdir(cacheDir, { withFileTypes: true })
			const cachedRepoDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)

			// Get the list of repository names from current sources
			const currentRepoNames = currentSources.map((source) => this.getRepoNameFromUrl(source.url))

			// Find directories to delete
			const dirsToDelete = cachedRepoDirs.filter((dir) => !currentRepoNames.includes(dir))

			// Delete each directory that's no longer in the sources
			for (const dirName of dirsToDelete) {
				try {
					const dirPath = path.join(cacheDir, dirName)
					await fs.rm(dirPath, { recursive: true, force: true })
				} catch (error) {
					console.error(`PackageManagerManager: Failed to delete directory ${dirName}:`, error)
				}
			}
		} catch (error) {
			console.error("PackageManagerManager: Error cleaning up cache directories:", error)
		}
	}

	/**
	 * Extracts a safe directory name from a Git URL
	 * @param url The Git repository URL
	 * @returns A sanitized directory name
	 */
	private getRepoNameFromUrl(url: string): string {
		// Extract repo name from URL and sanitize it
		const urlParts = url.split("/").filter((part) => part !== "")
		const repoName = urlParts[urlParts.length - 1].replace(/\.git$/, "")
		return repoName.replace(/[^a-zA-Z0-9-_]/g, "-")
	}

	/**
	 * Filters package manager items based on criteria
	 * @param items The items to filter
	 * @param filters The filter criteria
	 * @returns Filtered items
	 */
	filterItems(
		items: PackageManagerItem[],
		filters: { type?: ComponentType; search?: string; tags?: string[] },
	): PackageManagerItem[] {
		// Helper function to normalize text for case/whitespace-insensitive comparison
		const normalizeText = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim()

		// Normalize search term once
		const searchTerm = filters.search ? normalizeText(filters.search) : ""

		// Helper function to check if text contains the search term
		const containsSearchTerm = (text: string) => {
			if (!searchTerm) return true
			return normalizeText(text).includes(normalizeText(searchTerm))
		}

		// Create a deep clone of all items
		const clonedItems = items.map((originalItem) => JSON.parse(JSON.stringify(originalItem)) as PackageManagerItem)

		// Apply filters
		const filteredItems = clonedItems.filter((item) => {
			// Check parent item matches
			const itemMatches = {
				type: !filters.type || item.type === filters.type,
				search: !searchTerm || containsSearchTerm(item.name) || containsSearchTerm(item.description),
				tags: !filters.tags?.length || (item.tags && filters.tags.some((tag) => item.tags!.includes(tag))),
			}

			// Check subcomponent matches
			const subcomponentMatches =
				item.items?.some((subItem) => {
					const subMatches = {
						type: !filters.type || subItem.type === filters.type,
						search:
							!searchTerm ||
							(subItem.metadata &&
								(containsSearchTerm(subItem.metadata.name) ||
									containsSearchTerm(subItem.metadata.description))),
						tags:
							!filters.tags?.length ||
							(subItem.metadata?.tags &&
								filters.tags.some((tag) => subItem.metadata!.tags!.includes(tag))),
					}

					// When filtering by type, require exact type match
					// For other filters (search/tags), any match is sufficient
					return (
						subMatches.type &&
						(!searchTerm || subMatches.search) &&
						(!filters.tags?.length || subMatches.tags)
					)
				}) ?? false

			// Include item if either:
			// 1. Parent matches all active filters, or
			// 2. Parent is a package and any subcomponent matches any active filter
			const hasActiveFilters = filters.type || searchTerm || filters.tags?.length
			if (!hasActiveFilters) return true

			const parentMatchesAll = itemMatches.type && itemMatches.search && itemMatches.tags
			const isPackageWithMatchingSubcomponent = item.type === "package" && subcomponentMatches
			return parentMatchesAll || isPackageWithMatchingSubcomponent
		})

		// Add match info to filtered items
		return filteredItems.map((item) => {
			// Calculate parent item matches
			const itemMatches = {
				type: !filters.type || item.type === filters.type,
				search: !searchTerm || containsSearchTerm(item.name) || containsSearchTerm(item.description),
				tags: !filters.tags?.length || (item.tags && filters.tags.some((tag) => item.tags!.includes(tag))),
			}

			// Process subcomponents
			let hasMatchingSubcomponents = false
			if (item.items) {
				item.items = item.items.map((subItem) => {
					// Calculate individual filter matches for subcomponent
					const subMatches = {
						type: !filters.type || subItem.type === filters.type,
						search:
							!searchTerm ||
							(subItem.metadata &&
								(containsSearchTerm(subItem.metadata.name) ||
									containsSearchTerm(subItem.metadata.description))),
						tags:
							!filters.tags?.length ||
							(subItem.metadata?.tags &&
								filters.tags.some((tag) => subItem.metadata!.tags!.includes(tag))),
					}

					// A subcomponent matches if it matches all active filters
					const subMatched = subMatches.type && subMatches.search && subMatches.tags

					if (subMatched) {
						hasMatchingSubcomponents = true
						// Build match reason for matched subcomponent
						const matchReason: Record<string, boolean> = {
							...(searchTerm && {
								nameMatch: !!subItem.metadata && containsSearchTerm(subItem.metadata.name),
								descriptionMatch:
									!!subItem.metadata && containsSearchTerm(subItem.metadata.description),
							}),
							...(filters.type && { typeMatch: subMatches.type }),
							...(filters.tags?.length && { tagMatch: !!subMatches.tags }),
						}

						subItem.matchInfo = {
							matched: true,
							matchReason,
						}
					} else {
						subItem.matchInfo = {
							matched: false,
						}
					}

					return subItem
				})
			}

			// Build match reason for parent item
			const matchReason: Record<string, boolean> = {
				nameMatch: searchTerm ? containsSearchTerm(item.name) : true,
				descriptionMatch: searchTerm ? containsSearchTerm(item.description) : true,
			}

			if (filters.type) {
				matchReason.typeMatch = itemMatches.type
			}
			if (filters.tags?.length) {
				matchReason.tagMatch = !!itemMatches.tags
			}
			if (hasMatchingSubcomponents) {
				matchReason.hasMatchingSubcomponents = true
			}

			// Parent item is matched if:
			// 1. It matches all active filters directly, or
			// 2. It's a package and has any matching subcomponents
			const parentMatchesAll =
				(!filters.type || itemMatches.type) &&
				(!searchTerm || itemMatches.search) &&
				(!filters.tags?.length || itemMatches.tags)

			const isPackageWithMatchingSubcomponent = item.type === "package" && hasMatchingSubcomponents

			item.matchInfo = {
				matched: parentMatchesAll || isPackageWithMatchingSubcomponent,
				matchReason,
			}

			return item
		})
	}

	/**
	 * Sorts package manager items
	 * @param items The items to sort
	 * @param sortBy The field to sort by
	 * @param sortOrder The sort order
	 * @returns Sorted items
	 */
	sortItems(
		items: PackageManagerItem[],
		sortBy: keyof Pick<PackageManagerItem, "name" | "author" | "lastUpdated">,
		sortOrder: "asc" | "desc",
		sortSubcomponents: boolean = false,
	): PackageManagerItem[] {
		return [...items]
			.map((item) => {
				// Deep clone the item
				const clonedItem = { ...item }

				// Sort or preserve subcomponents
				if (clonedItem.items && clonedItem.items.length > 0) {
					clonedItem.items = [...clonedItem.items]
					if (sortSubcomponents) {
						clonedItem.items.sort((a, b) => {
							const aValue = this.getSortValue(a, sortBy)
							const bValue = this.getSortValue(b, sortBy)
							const comparison = aValue.localeCompare(bValue)
							return sortOrder === "asc" ? comparison : -comparison
						})
					}
				}

				return clonedItem
			})
			.sort((a, b) => {
				const aValue = this.getSortValue(a, sortBy)
				const bValue = this.getSortValue(b, sortBy)
				const comparison = aValue.localeCompare(bValue)
				return sortOrder === "asc" ? comparison : -comparison
			})
	}
	/**
	 * Gets the current package manager items
	 * @returns The current items
	 */
	getCurrentItems(): PackageManagerItem[] {
		return this.currentItems
	}

	/**
	 * Cleans up resources used by the package manager
	 */
	async cleanup(): Promise<void> {
		// Clean up cache directories for all sources
		const sources = Array.from(this.cache.keys()).map((url) => ({ url, enabled: true }))
		await this.cleanupCacheDirectories(sources)
		this.clearCache()
	}

	/**
	 * Helper method to get the sort value for an item
	 */
	private getSortValue(
		item:
			| PackageManagerItem
			| { type: ComponentType; path: string; metadata?: ComponentMetadata; lastUpdated?: string },
		sortBy: keyof Pick<PackageManagerItem, "name" | "author" | "lastUpdated">,
	): string {
		if ("metadata" in item && item.metadata) {
			// Handle subcomponent
			switch (sortBy) {
				case "name":
					return item.metadata.name
				case "author":
					return ""
				case "lastUpdated":
					return item.lastUpdated || ""
				default:
					return item.metadata.name
			}
		} else {
			// Handle parent item
			const parentItem = item as PackageManagerItem
			switch (sortBy) {
				case "name":
					return parentItem.name
				case "author":
					return parentItem.author || ""
				case "lastUpdated":
					return parentItem.lastUpdated || ""
				default:
					return parentItem.name
			}
		}
	}
}

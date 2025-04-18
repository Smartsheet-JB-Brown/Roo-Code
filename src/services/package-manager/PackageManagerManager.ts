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
	// Cache size limit to prevent memory issues
	private static readonly MAX_CACHE_SIZE = 100
	private filterCache = new Map<
		string,
		{
			items: PackageManagerItem[]
			timestamp: number
		}
	>()

	/**
	 * Clear old entries from the filter cache
	 */
	private cleanupFilterCache(): void {
		if (this.filterCache.size > PackageManagerManager.MAX_CACHE_SIZE) {
			// Sort by timestamp and keep only the most recent entries
			const entries = Array.from(this.filterCache.entries())
				.sort(([, a], [, b]) => b.timestamp - a.timestamp)
				.slice(0, PackageManagerManager.MAX_CACHE_SIZE)

			this.filterCache.clear()
			entries.forEach(([key, value]) => this.filterCache.set(key, value))
		}
	}

	filterItems(
		items: PackageManagerItem[],
		filters: { type?: ComponentType; search?: string; tags?: string[] },
	): PackageManagerItem[] {
		// Create cache key from filters
		const cacheKey = JSON.stringify(filters)
		const cached = this.filterCache.get(cacheKey)
		if (cached) {
			return cached.items
		}

		// Clean up old cache entries
		this.cleanupFilterCache()

		// Helper function to normalize text for case/whitespace-insensitive comparison
		const normalizeText = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim()

		// Normalize search term once
		const searchTerm = filters.search ? normalizeText(filters.search) : ""

		// Helper function to check if text contains the search term
		const containsSearchTerm = (text: string) => {
			if (!searchTerm) return true
			return normalizeText(text).includes(normalizeText(searchTerm))
		}

		// Filter items with shallow copies
		const filteredItems = items
			.map((item) => {
				// Create shallow copy of item
				const itemCopy = { ...item }

				// Check parent item matches
				const itemMatches = {
					type: !filters.type || itemCopy.type === filters.type,
					search:
						!searchTerm || containsSearchTerm(itemCopy.name) || containsSearchTerm(itemCopy.description),
					tags:
						!filters.tags?.length ||
						(itemCopy.tags && filters.tags.some((tag) => itemCopy.tags!.includes(tag))),
				}

				// Process subcomponents and track if any match
				let hasMatchingSubcomponents = false
				if (itemCopy.items?.length) {
					itemCopy.items = itemCopy.items.map((subItem) => {
						const subMatches = {
							type: !filters.type || subItem.type === filters.type,
							search:
								!searchTerm ||
								(subItem.metadata &&
									(containsSearchTerm(subItem.metadata.name) ||
										containsSearchTerm(subItem.metadata.description))),
							tags:
								!filters.tags?.length ||
								!!(
									subItem.metadata?.tags &&
									filters.tags.some((tag) => subItem.metadata!.tags!.includes(tag))
								),
						}

						const subItemMatched =
							subMatches.type &&
							(!searchTerm || subMatches.search) &&
							(!filters.tags?.length || subMatches.tags)

						if (subItemMatched) {
							hasMatchingSubcomponents = true
							// Set matchInfo for matching subcomponent
							// Build match reason based on active filters
							const matchReason: Record<string, boolean> = {}

							if (searchTerm) {
								matchReason.nameMatch = containsSearchTerm(subItem.metadata?.name || "")
								matchReason.descriptionMatch = containsSearchTerm(subItem.metadata?.description || "")
							}

							// Always include typeMatch when filtering by type
							if (filters.type) {
								matchReason.typeMatch = subMatches.type
							}

							subItem.matchInfo = {
								matched: true,
								matchReason,
							}
						} else {
							subItem.matchInfo = { matched: false }
						}

						return subItem
					})
				}

				const hasActiveFilters = filters.type || searchTerm || filters.tags?.length
				if (!hasActiveFilters) return itemCopy

				const parentMatchesAll = itemMatches.type && itemMatches.search && itemMatches.tags
				const isPackageWithMatchingSubcomponent = itemCopy.type === "package" && hasMatchingSubcomponents

				if (parentMatchesAll || isPackageWithMatchingSubcomponent) {
					// Add match info without deep cloning
					// Build parent match reason based on active filters
					const matchReason: Record<string, boolean> = {}

					if (searchTerm) {
						matchReason.nameMatch = containsSearchTerm(itemCopy.name)
						matchReason.descriptionMatch = containsSearchTerm(itemCopy.description)
					} else {
						matchReason.nameMatch = false
						matchReason.descriptionMatch = false
					}

					// Always include typeMatch when filtering by type
					if (filters.type) {
						matchReason.typeMatch = itemMatches.type
					}

					if (hasMatchingSubcomponents) {
						matchReason.hasMatchingSubcomponents = true
					}

					itemCopy.matchInfo = {
						matched: true,
						matchReason,
					}
					return itemCopy
				}
				return null
			})
			.filter((item): item is PackageManagerItem => item !== null)

		// Cache the results with timestamp
		this.filterCache.set(cacheKey, {
			items: filteredItems,
			timestamp: Date.now(),
		})
		return filteredItems
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
	 * Updates current items with filtered results
	 * @param filters The filter criteria
	 * @returns Filtered items
	 */
	updateWithFilteredItems(filters: { type?: ComponentType; search?: string; tags?: string[] }): PackageManagerItem[] {
		const filteredItems = this.filterItems(this.currentItems, filters)
		this.currentItems = filteredItems
		return filteredItems
	}

	/**
	 * Cleans up resources used by the package manager
	 */
	async cleanup(): Promise<void> {
		// Clean up cache directories for all sources
		const sources = Array.from(this.cache.keys()).map((url) => ({ url, enabled: true }))
		await this.cleanupCacheDirectories(sources)
		this.clearCache()
		// Clear filter cache
		this.filterCache.clear()
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

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
		console.log(`PackageManagerManager: Getting items from ${sources.length} sources`)
		const items: PackageManagerItem[] = []
		const errors: string[] = []

		// Filter enabled sources
		const enabledSources = sources.filter((s) => s.enabled)
		console.log(`PackageManagerManager: ${enabledSources.length} enabled sources`)

		// Process sources sequentially with locking
		for (const source of enabledSources) {
			if (this.isSourceLocked(source.url)) {
				console.log(`PackageManagerManager: Source ${source.url} is locked, skipping`)
				continue
			}

			try {
				this.lockSource(source.url)
				console.log(`PackageManagerManager: Processing source ${source.url}`)

				// Queue metadata scanning operation
				await this.queueOperation(async () => {
					const repo = await this.getRepositoryData(source.url, false, source.name)

					if (repo.items && repo.items.length > 0) {
						console.log(`PackageManagerManager: Found ${repo.items.length} items in ${source.url}`)
						items.push(...repo.items)
					} else {
						console.log(`PackageManagerManager: No items found in ${source.url}`)
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

		console.log(`PackageManagerManager: Returning ${items.length} total items`)
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
			console.log(`PackageManagerManager: Getting repository data for ${url}`)

			// Check cache first (unless force refresh is requested)
			const cached = this.cache.get(url)

			if (!forceRefresh && cached && Date.now() - cached.timestamp < PackageManagerManager.CACHE_EXPIRY_MS) {
				console.log(
					`PackageManagerManager: Using cached data for ${url} (age: ${Date.now() - cached.timestamp}ms)`,
				)
				return cached.data
			}

			if (forceRefresh) {
				console.log(`PackageManagerManager: Force refresh requested for ${url}, bypassing cache`)
			}

			console.log(`PackageManagerManager: Cache miss or expired for ${url}, fetching fresh data`)

			// Fetch fresh data with timeout protection
			const fetchPromise = this.gitFetcher.fetchRepository(url, forceRefresh, sourceName)

			// Create a timeout promise
			const timeoutPromise = new Promise<PackageManagerRepository>((_, reject) => {
				setTimeout(() => {
					reject(new Error(`Repository fetch timed out after 30 seconds: ${url}`))
				}, 30000) // 30 second timeout
			})

			// Race the fetch against the timeout
			const data = await Promise.race([fetchPromise, timeoutPromise])

			// Cache the result
			this.cache.set(url, { data, timestamp: Date.now() })
			console.log(`PackageManagerManager: Successfully fetched and cached data for ${url}`)

			return data
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
		console.log(`PackageManagerManager: Refreshing repository ${url}`)

		try {
			// Force a refresh by bypassing the cache
			const data = await this.getRepositoryData(url, true, sourceName)
			console.log(`PackageManagerManager: Repository ${url} refreshed successfully`)
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
				console.log("PackageManagerManager: Cache directory doesn't exist yet, nothing to clean up")
				return
			}

			// Get all subdirectories in the cache directory
			const entries = await fs.readdir(cacheDir, { withFileTypes: true })
			const cachedRepoDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)

			console.log(`PackageManagerManager: Found ${cachedRepoDirs.length} cached repositories`)

			// Get the list of repository names from current sources
			const currentRepoNames = currentSources.map((source) => this.getRepoNameFromUrl(source.url))

			// Find directories to delete
			const dirsToDelete = cachedRepoDirs.filter((dir) => !currentRepoNames.includes(dir))

			console.log(`PackageManagerManager: Found ${dirsToDelete.length} repositories to delete`)

			// Delete each directory that's no longer in the sources
			for (const dirName of dirsToDelete) {
				try {
					const dirPath = path.join(cacheDir, dirName)
					console.log(`PackageManagerManager: Deleting cache directory ${dirPath}`)
					await fs.rm(dirPath, { recursive: true, force: true })
					console.log(`PackageManagerManager: Successfully deleted ${dirPath}`)
				} catch (error) {
					console.error(`PackageManagerManager: Failed to delete directory ${dirName}:`, error)
				}
			}

			console.log(`PackageManagerManager: Cache cleanup completed, deleted ${dirsToDelete.length} directories`)
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
		console.log("DEBUG: Starting filterItems", {
			itemCount: items.length,
			filters: {
				type: filters.type,
				search: filters.search,
				tags: filters.tags,
			},
		})

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

		console.log("Initial items:", JSON.stringify(clonedItems))

		// Apply filters
		const filteredItems = clonedItems.filter((item) => {
			// Check if item itself matches type filter
			const itemTypeMatch = !filters.type || item.type === filters.type

			// Check if any subcomponents match type filter
			const subcomponentTypeMatch =
				item.items?.some((subItem) => !filters.type || subItem.type === filters.type) ?? false

			// Type filter - include if item or any subcomponent matches
			if (filters.type && !itemTypeMatch && !subcomponentTypeMatch) {
				return false
			}

			// Search filter
			if (searchTerm) {
				const nameMatch = containsSearchTerm(item.name)
				const descMatch = containsSearchTerm(item.description)
				const subcomponentMatch =
					item.items?.some(
						(subItem) =>
							subItem.metadata &&
							(containsSearchTerm(subItem.metadata.name) ||
								containsSearchTerm(subItem.metadata.description)),
					) ?? false
				return nameMatch || descMatch || subcomponentMatch
			}

			return true
		})

		console.log("Filtered items:", {
			before: clonedItems.length,
			after: filteredItems.length,
			filters,
		})
		// Add match info to filtered items
		return filteredItems.map((item) => {
			const nameMatch = searchTerm ? containsSearchTerm(item.name) : true
			const descMatch = searchTerm ? containsSearchTerm(item.description) : true
			const typeMatch = filters.type ? item.type === filters.type : true

			// Process subcomponents first to determine if any match
			let hasMatchingSubcomponents = false
			if (item.items) {
				item.items = item.items.map((subItem) => {
					// Calculate matches
					const subNameMatch =
						searchTerm && subItem.metadata ? containsSearchTerm(subItem.metadata.name) : true
					const subDescMatch =
						searchTerm && subItem.metadata ? containsSearchTerm(subItem.metadata.description) : true

					// Only calculate type match if type filter is active
					const subTypeMatch = filters.type ? subItem.type === filters.type : false

					// Determine if item matches based on active filters
					const subMatched = filters.type
						? subNameMatch || subDescMatch || subTypeMatch
						: subNameMatch || subDescMatch

					if (subMatched) {
						hasMatchingSubcomponents = true

						// Only include matchReason if the item matches
						const matchReason: Record<string, boolean> = {
							nameMatch: subNameMatch,
							descriptionMatch: subDescMatch,
						}

						// Only include type match in reason if type filter is active
						if (filters.type) {
							matchReason.typeMatch = subTypeMatch
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

			const matchReason: Record<string, boolean> = {
				nameMatch,
				descriptionMatch: descMatch,
			}

			// Only include typeMatch and hasMatchingSubcomponents in matchReason if relevant
			if (filters.type) {
				matchReason.typeMatch = typeMatch
			}
			if (hasMatchingSubcomponents) {
				matchReason.hasMatchingSubcomponents = true
			}

			item.matchInfo = {
				matched: nameMatch || descMatch || typeMatch || hasMatchingSubcomponents,
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

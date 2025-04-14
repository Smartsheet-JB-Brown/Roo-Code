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
	public isFetching = false
	// Cache expiry time in milliseconds (set to a low value for testing)
	private static readonly CACHE_EXPIRY_MS = 3600000 // 1 hour

	private gitFetcher: GitFetcher
	private cache: Map<string, { data: PackageManagerRepository; timestamp: number }> = new Map()

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
	async getPackageManagerItems(
		sources: PackageManagerSource[],
	): Promise<{ items: PackageManagerItem[]; errors?: string[] }> {
		console.log(`PackageManagerManager: Getting items from ${sources.length} sources`)
		const items: PackageManagerItem[] = []
		const errors: string[] = []

		// Filter enabled sources
		const enabledSources = sources.filter((s) => s.enabled)
		console.log(`PackageManagerManager: ${enabledSources.length} enabled sources`)

		// Process sources sequentially to avoid overwhelming the system
		for (const source of enabledSources) {
			try {
				console.log(`PackageManagerManager: Processing source ${source.url}`)
				// Pass the source name to getRepositoryData
				const repo = await this.getRepositoryData(source.url, false, source.name)

				if (repo.items && repo.items.length > 0) {
					console.log(`PackageManagerManager: Found ${repo.items.length} items in ${source.url}`)
					items.push(...repo.items)
				} else {
					console.log(`PackageManagerManager: No items found in ${source.url}`)
				}
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error)
				console.error(`PackageManagerManager: Failed to fetch data from ${source.url}:`, error)
				errors.push(`Source ${source.url}: ${errorMessage}`)
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
		// Helper function to normalize text for case/whitespace-insensitive comparison
		const normalizeText = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim()

		// Normalize search term once
		const searchTerm = filters.search ? normalizeText(filters.search) : ""

		// Helper function to check if text contains the search term
		const containsSearchTerm = (text: string) => {
			if (!searchTerm) return true
			return normalizeText(text).includes(normalizeText(searchTerm))
		}

		const filteredItems = items.map((originalItem) => {
			// Create a deep clone of the item to avoid modifying the original
			return JSON.parse(JSON.stringify(originalItem)) as PackageManagerItem
		})

		console.log("Initial items:", JSON.stringify(filteredItems))
		return filteredItems.filter((item) => {
			// For packages, handle differently based on filters
			if (item.type === "package") {
				// If we have a type filter that's not "package"
				if (filters.type && filters.type !== "package") {
					// Only keep packages that have at least one matching subcomponent
					if (!item.items) return false

					// Mark subcomponents with matchInfo based on type
					item.items.forEach((subItem) => {
						subItem.matchInfo = {
							matched: subItem.type === filters.type,
						}
					})

					// Keep package if it has any matching subcomponents
					const hasMatchingType = item.items.some((subItem) => subItem.type === filters.type)

					// Set package matchInfo
					item.matchInfo = {
						matched: hasMatchingType,
						matchReason: {
							nameMatch: false,
							descriptionMatch: false,
							hasMatchingSubcomponents: hasMatchingType,
						},
					}

					return hasMatchingType
				}

				// For search term
				if (searchTerm) {
					// Check package and subcomponents
					const nameMatch = containsSearchTerm(item.name)
					const descMatch = containsSearchTerm(item.description)

					// Process subcomponents if they exist
					if (item.items && item.items.length > 0) {
						// Add matchInfo to each subcomponent
						item.items.forEach((subItem) => {
							if (!subItem.metadata) {
								subItem.matchInfo = { matched: false }
								return
							}

							const subNameMatch = containsSearchTerm(subItem.metadata.name)
							const subDescMatch = containsSearchTerm(subItem.metadata.description)

							console.log(`Checking subcomponent: ${subItem.metadata.name}`)
							console.log(`Search term: ${searchTerm}`)
							console.log(`Name match: ${subNameMatch}, Desc match: ${subDescMatch}`)

							if (subNameMatch || subDescMatch) {
								subItem.matchInfo = {
									matched: true,
									matchReason: {
										nameMatch: subNameMatch,
										descriptionMatch: subDescMatch,
									},
								}
							} else {
								subItem.matchInfo = { matched: false }
							}
						})
					}

					// Check if any subcomponents matched
					const hasMatchingSubcomponents = item.items?.some((subItem) => subItem.matchInfo?.matched) ?? false

					// Set package matchInfo
					item.matchInfo = {
						matched: nameMatch || descMatch || hasMatchingSubcomponents,
						matchReason: {
							nameMatch,
							descriptionMatch: descMatch,
							hasMatchingSubcomponents,
						},
					}

					// Only keep package if it or its subcomponents match the exact search term
					const packageMatches = nameMatch || descMatch
					const subcomponentMatches = hasMatchingSubcomponents
					return packageMatches || subcomponentMatches
				}

				// No search term, everything matches
				item.matchInfo = { matched: true }
				if (item.items) {
					item.items.forEach((subItem) => {
						subItem.matchInfo = { matched: true }
					})
				}
				return true
			}

			// For non-packages
			if (filters.type && item.type !== filters.type) {
				return false
			}
			if (searchTerm) {
				return containsSearchTerm(item.name) || containsSearchTerm(item.description)
			}
			return true
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

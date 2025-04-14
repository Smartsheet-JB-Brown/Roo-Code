import * as path from "path"
import * as fs from "fs/promises"
import * as vscode from "vscode"
import * as yaml from "js-yaml"
import { SimpleGit } from "simple-git"
import { validateAnyMetadata } from "./schemas"
import {
	ComponentMetadata,
	ComponentType,
	LocalizationOptions,
	LocalizedMetadata,
	PackageManagerItem,
	PackageMetadata,
} from "./types"
import { getUserLocale } from "./utils"

/**
 * Handles component discovery and metadata loading
 */
export class MetadataScanner {
	private readonly git?: SimpleGit
	private localizationOptions: LocalizationOptions

	constructor(git?: SimpleGit, localizationOptions?: LocalizationOptions) {
		this.git = git
		this.localizationOptions = localizationOptions || {
			userLocale: getUserLocale(),
			fallbackLocale: "en",
		}
	}

	/**
	 * Scans a directory for components
	 * @param rootDir The root directory to scan
	 * @param repoUrl The repository URL
	 * @param sourceName Optional source repository name
	 * @returns Array of discovered items
	 */
	async scanDirectory(rootDir: string, repoUrl: string, sourceName?: string): Promise<PackageManagerItem[]> {
		const items: PackageManagerItem[] = []

		try {
			const entries = await fs.readdir(rootDir, { withFileTypes: true })

			for (const entry of entries) {
				if (!entry.isDirectory()) continue

				const componentDir = path.join(rootDir, entry.name)
				const metadata = await this.loadComponentMetadata(componentDir)

				// Skip if no metadata found at all
				if (!metadata) continue

				// Get localized metadata with fallback
				const localizedMetadata = this.getLocalizedMetadata(metadata)
				if (!localizedMetadata) continue

				const item = await this.createPackageManagerItem(localizedMetadata, componentDir, repoUrl, sourceName)
				if (item) {
					// If this is a package, scan for subcomponents
					if (this.isPackageMetadata(localizedMetadata)) {
						// Load metadata for items listed in package metadata
						if (localizedMetadata.items) {
							const subcomponents = await Promise.all(
								localizedMetadata.items.map(async (subItem) => {
									const subPath = path.join(componentDir, subItem.path)
									const subMetadata = await this.loadComponentMetadata(subPath)

									// Skip if no metadata found
									if (!subMetadata) return null

									// Get localized metadata with fallback
									const localizedSubMetadata = this.getLocalizedMetadata(subMetadata)
									if (!localizedSubMetadata) return null

									return {
										type: subItem.type,
										path: subItem.path,
										metadata: localizedSubMetadata,
										lastUpdated: await this.getLastModifiedDate(subPath),
									}
								}),
							)
							item.items = subcomponents.filter((sub): sub is NonNullable<typeof sub> => sub !== null)
						}

						// Also scan directory for unlisted subcomponents
						await this.scanPackageSubcomponents(componentDir, item)
					}
					items.push(item)
					// Skip recursion if this is a package directory
					if (this.isPackageMetadata(localizedMetadata)) {
						continue
					}
				}

				// Recursively scan subdirectories only if not in a package
				if (!metadata || !this.isPackageMetadata(localizedMetadata)) {
					const subItems = await this.scanDirectory(componentDir, repoUrl, sourceName)
					items.push(...subItems)
				}
			}
		} catch (error) {
			console.error(`Error scanning directory ${rootDir}:`, error)
		}

		return items
	}

	/**
	 * Gets localized metadata with fallback
	 * @param metadata The localized metadata object
	 * @returns The metadata in the user's locale or fallback locale, or null if neither is available
	 */
	private getLocalizedMetadata(metadata: LocalizedMetadata<ComponentMetadata>): ComponentMetadata | null {
		const { userLocale, fallbackLocale } = this.localizationOptions

		// First try user's locale
		if (metadata[userLocale]) {
			return metadata[userLocale]
		}

		// Fall back to fallbackLocale (typically English)
		if (metadata[fallbackLocale]) {
			return metadata[fallbackLocale]
		}

		// No suitable metadata found
		return null
	}

	/**
	 * Loads metadata for a component
	 * @param componentDir The component directory
	 * @returns Localized metadata or null if no metadata found
	 */
	private async loadComponentMetadata(componentDir: string): Promise<LocalizedMetadata<ComponentMetadata> | null> {
		const metadata: LocalizedMetadata<ComponentMetadata> = {}

		try {
			const entries = await fs.readdir(componentDir, { withFileTypes: true })

			// Look for metadata.{locale}.yml files
			for (const entry of entries) {
				if (!entry.isFile()) continue

				const match = entry.name.match(/^metadata\.([a-z]{2})\.yml$/)
				if (!match) continue

				const locale = match[1]
				const metadataPath = path.join(componentDir, entry.name)

				try {
					const content = await fs.readFile(metadataPath, "utf-8")
					const parsed = yaml.load(content) as Record<string, any>

					// Add type field if missing but has a parent directory indicating type
					if (!parsed.type) {
						const parentDir = path.basename(componentDir)
						if (parentDir === "mcp servers" || parentDir === "mcp-servers") {
							parsed.type = "mcp server"
						}
					}

					metadata[locale] = validateAnyMetadata(parsed) as ComponentMetadata
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error)
					console.error(`Error loading metadata from ${metadataPath}:`, error)

					// Show validation errors to user
					if (errorMessage.includes("Invalid metadata:")) {
						vscode.window.showErrorMessage(
							`Invalid metadata in ${path.basename(metadataPath)}: ${errorMessage.replace("Invalid metadata:", "").trim()}`,
						)
					}
				}
			}
		} catch (error) {
			console.error(`Error reading directory ${componentDir}:`, error)
		}

		return Object.keys(metadata).length > 0 ? metadata : null
	}

	/**
	 * Creates a PackageManagerItem from component metadata
	 * @param metadata The component metadata
	 * @param componentDir The component directory
	 * @param repoUrl The repository URL
	 * @param sourceName Optional source repository name
	 * @returns PackageManagerItem or null if invalid
	 */
	private async createPackageManagerItem(
		metadata: ComponentMetadata,
		componentDir: string,
		repoUrl: string,
		sourceName?: string,
	): Promise<PackageManagerItem | null> {
		// Skip if no type or invalid type
		if (!metadata.type || !this.isValidComponentType(metadata.type)) {
			return null
		}

		return {
			name: metadata.name,
			description: metadata.description,
			type: metadata.type,
			version: metadata.version,
			tags: metadata.tags,
			url: componentDir,
			repoUrl,
			sourceName,
			lastUpdated: await this.getLastModifiedDate(componentDir),
			items: [], // Initialize empty items array for all components
		}
	}

	/**
	 * Gets the last modified date for a component using git history
	 * @param componentDir The component directory
	 * @returns ISO date string
	 */
	private async getLastModifiedDate(componentDir: string): Promise<string> {
		if (this.git) {
			try {
				// Get the latest commit date for the directory and its contents
				const result = await this.git.raw([
					"log",
					"-1",
					"--format=%aI", // ISO 8601 format
					"--",
					componentDir,
				])
				if (result) {
					return result.trim()
				}
			} catch (error) {
				console.error(`Error getting git history for ${componentDir}:`, error)
				// Fall through to fs.stat fallback
			}
		}

		// Fallback to fs.stat if git is not available or fails
		try {
			const stats = await fs.stat(componentDir)
			return stats.mtime.toISOString()
		} catch {
			return new Date().toISOString()
		}
	}

	/**
	 * Recursively scans a package directory for subcomponents
	 * @param packageDir The package directory to scan
	 * @param packageItem The package item to add subcomponents to
	 */
	private async scanPackageSubcomponents(
		packageDir: string,
		packageItem: PackageManagerItem,
		parentPath: string = "",
	): Promise<void> {
		console.log(`Scanning directory: ${packageDir}`)
		const entries = await fs.readdir(packageDir, { withFileTypes: true })

		for (const entry of entries) {
			if (!entry.isDirectory()) continue

			const subPath = path.join(packageDir, entry.name)
			const relativePath = parentPath ? path.join(parentPath, entry.name) : entry.name
			console.log(`Found directory: ${entry.name}, relative path: ${relativePath}`)

			// Try to load metadata directly
			const subMetadata = await this.loadComponentMetadata(subPath)

			if (subMetadata) {
				// Get localized metadata with fallback
				const localizedSubMetadata = this.getLocalizedMetadata(subMetadata)
				if (localizedSubMetadata) {
					console.log(`Metadata for ${entry.name}:`, localizedSubMetadata)

					const isListed = packageItem.items?.some((i) => i.path === relativePath)
					console.log(`${entry.name} is ${isListed ? "already listed" : "not listed"}`)

					if (!isListed) {
						const subItem = {
							type: localizedSubMetadata.type,
							path: relativePath,
							metadata: localizedSubMetadata,
							lastUpdated: await this.getLastModifiedDate(subPath),
						}
						packageItem.items = packageItem.items || []
						packageItem.items.push(subItem)
						console.log(`Added ${entry.name} to items`)
					}
				}
			}

			// Recursively scan this directory
			await this.scanPackageSubcomponents(subPath, packageItem, relativePath)
		}
	}

	/**
	 * Type guard for component types
	 * @param type The type to check
	 * @returns Whether the type is valid
	 */
	private isValidComponentType(type: string): type is ComponentType {
		return ["role", "mcp server", "storage", "mode", "prompt", "package"].includes(type)
	}

	/**
	 * Type guard for package metadata
	 * @param metadata The metadata to check
	 * @returns Whether the metadata is for a package
	 */
	private isPackageMetadata(metadata: ComponentMetadata): metadata is PackageMetadata {
		return metadata.type === "package"
	}
}

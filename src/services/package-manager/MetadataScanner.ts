import * as path from "path"
import * as fs from "fs/promises"
import * as vscode from "vscode"
import * as yaml from "js-yaml"
import { validateAnyMetadata } from "./schemas"
import { ComponentMetadata, ComponentType, LocalizedMetadata, PackageManagerItem, PackageMetadata } from "./types"

/**
 * Handles component discovery and metadata loading
 */
export class MetadataScanner {
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

				if (metadata?.["en"]) {
					const item = await this.createPackageManagerItem(metadata["en"], componentDir, repoUrl, sourceName)
					if (item) {
						items.push(item)
						// Skip recursion if this is a package directory
						if (this.isPackageMetadata(metadata["en"])) {
							continue
						}
					}
				}

				// Recursively scan subdirectories only if not in a package
				if (!metadata?.["en"] || !this.isPackageMetadata(metadata["en"])) {
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
		}
	}

	/**
	 * Gets the last modified date for a component
	 * @param componentDir The component directory
	 * @returns ISO date string
	 */
	private async getLastModifiedDate(componentDir: string): Promise<string> {
		try {
			const stats = await fs.stat(componentDir)
			return stats.mtime.toISOString()
		} catch {
			return new Date().toISOString()
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

import * as assert from "assert"
import * as path from "path"
import * as vscode from "vscode"
import { waitFor } from "./utils"
import { PackageManagerItem, PackageManagerSource } from "../../../src/services/package-manager/types"
import type { RooCodeAPI } from "../../../src/exports/roo-code"

interface PackageManager {
	addSource(source: PackageManagerSource): Promise<void>
	removeSource(url: string): Promise<void>
	getSources(): Promise<PackageManagerSource[]>
	getItems(): Promise<PackageManagerItem[]>
}

interface WaitForOptions {
	timeout?: number
	interval?: number
	message?: string
}

suite("Package Manager Integration Tests", () => {
	let extension: vscode.Extension<RooCodeAPI> | undefined

	suiteSetup(async () => {
		extension = vscode.extensions.getExtension<RooCodeAPI>("RooVeterinaryInc.roo-cline")
		if (!extension) {
			throw new Error("Extension not found")
		}
		if (!extension.isActive) {
			await extension.activate()
		}
	})

	test("should load sources from real cache location", async () => {
		// Get the package manager service
		const packageManager = (api as any).getPackageManager() as PackageManager
		assert.ok(packageManager, "Package manager service should be available")

		// Add a test source
		const testSource: PackageManagerSource = {
			url: "https://github.com/roo-team/package-manager-template",
			enabled: true,
		}
		await packageManager.addSource(testSource)

		// Wait for the source to be loaded
		await waitFor(
			async () => {
				const sources = await packageManager.getSources()
				return sources.some((source) => source.url === testSource.url)
			},
			{ message: "Source should be added to the list" } as WaitForOptions,
		)

		// Verify the cache directory exists
		const cacheDir = path.join("/test/global-storage", "package-manager-cache", "package-manager-template")
		let cacheExists = false
		try {
			await vscode.workspace.fs.stat(vscode.Uri.file(cacheDir))
			cacheExists = true
		} catch {
			cacheExists = false
		}
		assert.ok(cacheExists, "Cache directory should exist")

		// Load items from the source
		const items = await packageManager.getItems()
		assert.ok(items.length > 0, "Should load items from cache")

		// Verify items have correct metadata
		const hasValidItems = items.every((item: PackageManagerItem) => {
			return (
				typeof item.name === "string" &&
				typeof item.description === "string" &&
				typeof item.version === "string" &&
				["mode", "mcp server", "prompt", "package"].includes(item.type)
			)
		})
		assert.ok(hasValidItems, "All items should have valid metadata")

		// Clean up
		await packageManager.removeSource(testSource.url)
	})

	test("should handle package metadata with external items", async () => {
		const packageManager = (api as any).getPackageManager() as PackageManager

		// Add a source with package metadata
		const packageSource: PackageManagerSource = {
			url: "https://github.com/roo-team/package-with-externals",
			name: "Test Package Source",
			enabled: true,
		}
		await packageManager.addSource(packageSource)

		// Wait for the source to be loaded
		await waitFor(
			async () => {
				const sources = await packageManager.getSources()
				return sources.some((source) => source.url === packageSource.url)
			},
			{ message: "Package source should be added to the list" } as WaitForOptions,
		)

		// Load items and verify package metadata
		const items = await packageManager.getItems()
		const packageItems = items.filter(
			(item: PackageManagerItem) => item.repoUrl === packageSource.url && item.type === "package",
		)

		assert.ok(packageItems.length > 0, "Should find package items")
		assert.ok(
			packageItems.some((item) => item.items && item.items.length > 0),
			"Should have packages with external items",
		)

		// Clean up
		await packageManager.removeSource(packageSource.url)
	})

	test("should handle items with optional fields", async () => {
		const packageManager = (api as any).getPackageManager() as PackageManager

		// Add a source with items containing optional fields
		const detailedSource: PackageManagerSource = {
			url: "https://github.com/roo-team/detailed-items",
			enabled: true,
		}
		await packageManager.addSource(detailedSource)

		// Wait for the source to be loaded
		await waitFor(
			async () => {
				const sources = await packageManager.getSources()
				return sources.some((source) => source.url === detailedSource.url)
			},
			{ message: "Detailed source should be added to the list" } as WaitForOptions,
		)

		// Load items and verify optional fields
		const items = await packageManager.getItems()
		const detailedItems = items.filter((item: PackageManagerItem) => item.repoUrl === detailedSource.url)

		assert.ok(detailedItems.length > 0, "Should find detailed items")
		assert.ok(
			detailedItems.some((item) => item.author && item.tags && item.lastUpdated && item.sourceUrl),
			"Should have items with optional fields",
		)

		// Clean up
		await packageManager.removeSource(detailedSource.url)
	})

	test("should handle invalid source gracefully", async () => {
		const packageManager = (api as any).getPackageManager() as PackageManager

		// Add an invalid source
		const invalidSource: PackageManagerSource = {
			url: "https://github.com/invalid/repo",
			enabled: true,
		}
		await packageManager.addSource(invalidSource)

		// Wait for the source to be processed
		await waitFor(
			async () => {
				const sources = await packageManager.getSources()
				return sources.some((source) => source.url === invalidSource.url)
			},
			{ message: "Invalid source should be added to the list" } as WaitForOptions,
		)

		// Verify it returns empty items without crashing
		const items = await packageManager.getItems()
		assert.deepStrictEqual(
			items.filter((item: PackageManagerItem) => item.repoUrl === invalidSource.url),
			[],
			"Invalid source should return no items",
		)

		// Clean up
		await packageManager.removeSource(invalidSource.url)
	})

	test("should handle source with missing metadata gracefully", async () => {
		const packageManager = (api as any).getPackageManager() as PackageManager

		// Add a source with missing metadata
		const badSource: PackageManagerSource = {
			url: "https://github.com/roo-team/bad-package-template",
			enabled: true,
		}
		await packageManager.addSource(badSource)

		// Wait for the source to be processed
		await waitFor(
			async () => {
				const sources = await packageManager.getSources()
				return sources.some((source) => source.url === badSource.url)
			},
			{ message: "Bad source should be added to the list" } as WaitForOptions,
		)

		// Verify it returns empty items without crashing
		const items = await packageManager.getItems()
		assert.deepStrictEqual(
			items.filter((item: PackageManagerItem) => item.repoUrl === badSource.url),
			[],
			"Source with missing metadata should return no items",
		)

		// Clean up
		await packageManager.removeSource(badSource.url)
	})

	test("should handle localized metadata", async () => {
		const packageManager = (api as any).getPackageManager() as PackageManager

		// Add a source with localized metadata
		const localizedSource: PackageManagerSource = {
			url: "https://github.com/roo-team/localized-package-template",
			enabled: true,
		}
		await packageManager.addSource(localizedSource)

		// Wait for the source to be processed
		await waitFor(
			async () => {
				const sources = await packageManager.getSources()
				return sources.some((source) => source.url === localizedSource.url)
			},
			{ message: "Localized source should be added to the list" } as WaitForOptions,
		)

		// Load items from the source
		const items = await packageManager.getItems()
		const localizedItems = items.filter((item: PackageManagerItem) => item.repoUrl === localizedSource.url)

		// Verify items are loaded with correct metadata
		assert.ok(localizedItems.length > 0, "Should load localized items")
		assert.ok(
			localizedItems.every((item: PackageManagerItem) => {
				return (
					typeof item.name === "string" &&
					typeof item.description === "string" &&
					typeof item.version === "string"
				)
			}),
			"All localized items should have valid metadata",
		)

		// Clean up
		await packageManager.removeSource(localizedSource.url)
	})
})

import { PackageManagerManager } from "../PackageManagerManager"
import { PackageManagerItem } from "../types"
import { MetadataScanner } from "../MetadataScanner"
import * as path from "path"
import * as vscode from "vscode"

describe("PackageManagerManager", () => {
	let manager: PackageManagerManager
	let metadataScanner: MetadataScanner
	let realItems: PackageManagerItem[]

	beforeAll(async () => {
		// Load real data from the template
		const templatePath = path.resolve(__dirname, "../../../../package-manager-template")
		metadataScanner = new MetadataScanner()
		realItems = await metadataScanner.scanDirectory(templatePath, "https://example.com")
	})

	beforeEach(() => {
		const context = {
			globalStorageUri: { fsPath: path.resolve(__dirname, "../../../../mock/settings/path") },
		} as vscode.ExtensionContext
		manager = new PackageManagerManager(context)
	})

	describe("filterItems with subcomponents", () => {
		const testItems: PackageManagerItem[] = [
			{
				name: "Test Package",
				description: "A test package",
				type: "package",
				version: "1.0.0",
				url: "/test/package",
				repoUrl: "https://example.com",
				items: [
					{
						type: "mode",
						path: "modes/child",
						metadata: {
							name: "Child Mode",
							description: "A child mode",
							type: "mode",
							version: "1.0.0",
						},
						lastUpdated: "2025-04-13T10:00:00-07:00",
					},
					{
						type: "mode",
						path: "modes/another",
						metadata: {
							name: "Another Mode",
							description: "Another child mode",
							type: "mode",
							version: "1.0.0",
						},
						lastUpdated: "2025-04-13T10:00:00-07:00",
					},
				],
			},
			{
				name: "Simple Package",
				description: "A package without subcomponents",
				type: "package",
				version: "1.0.0",
				url: "/test/simple",
				repoUrl: "https://example.com",
				items: [],
			},
		]

		it("should filter by type including subcomponents", () => {
			const filtered = manager.filterItems(testItems, { type: "mode" })
			expect(filtered).toHaveLength(1) // The package with modes
			expect(filtered[0].items).toHaveLength(2)
			expect(filtered[0].items![0].type).toBe("mode")
			expect(filtered[0].items![1].type).toBe("mode")
		})

		it("should find packages by subcomponent name regardless of type filter", () => {
			const testItems: PackageManagerItem[] = [
				{
					name: "Data Platform",
					description: "A platform for data processing",
					type: "package",
					version: "1.0.0",
					url: "/test/data-platform",
					repoUrl: "https://example.com",
					items: [
						{
							type: "mcp server",
							path: "mcp servers/data-validator",
							metadata: {
								name: "Data Validator",
								description: "An MCP server for validating data quality",
								type: "mcp server",
								version: "1.0.0",
							},
							lastUpdated: "2025-04-13T10:00:00-07:00",
						},
					],
				},
			]

			// Search without type filter first
			const noTypeFilter = manager.filterItems(testItems, { search: "data validator" })
			expect(noTypeFilter).toHaveLength(1)
			expect(noTypeFilter[0].name).toBe("Data Platform")
			expect(noTypeFilter[0].items).toHaveLength(1)
			expect(noTypeFilter[0].items![0].metadata!.name).toBe("Data Validator")

			// Search with type filter - should still find package but without subcomponents
			const withTypeFilter = manager.filterItems(testItems, {
				search: "data validator",
				type: "mode",
			})
			expect(withTypeFilter).toHaveLength(0) // Should not match since neither package nor subcomponent is a mode
		})

		it("should handle case-insensitive substring matching", () => {
			const testItems: PackageManagerItem[] = [
				{
					name: "Example Package",
					description: "A test package",
					type: "package",
					version: "1.0.0",
					url: "/test/data-platform",
					repoUrl: "https://example.com",
					items: [
						{
							type: "mcp server",
							path: "mcp servers/data-validator",
							metadata: {
								name: "Test Component",
								description: "An MCP server for testing",
								type: "mcp server",
								version: "1.0.0",
							},
							lastUpdated: "2025-04-13T10:00:00-07:00",
						},
						{
							type: "mode",
							path: "modes/task-runner",
							metadata: {
								name: "Other Component",
								description: "A mode for doing work",
								type: "mode",
								version: "1.0.0",
							},
							lastUpdated: "2025-04-13T10:00:00-07:00",
						},
					],
				},
			]

			// Test exact match
			const filtered = manager.filterItems(testItems, { search: "test component" })
			expect(filtered.length).toBe(1)
			expect(filtered[0].items?.length).toBe(1)
			expect(filtered[0].items![0].metadata!.name).toBe("Test Component")

			// Test case insensitive
			const filteredUpper = manager.filterItems(testItems, { search: "TEST COMPONENT" })
			expect(filteredUpper.length).toBe(1)
			expect(filteredUpper[0].items?.length).toBe(1)
			expect(filteredUpper[0].items![0].metadata!.name).toBe("Test Component")

			// Test extra whitespace
			const filteredSpace = manager.filterItems(testItems, { search: "Test  Component" })
			expect(filteredSpace.length).toBe(1)
			expect(filteredSpace[0].items?.length).toBe(1)
			expect(filteredSpace[0].items![0].metadata!.name).toBe("Test Component")

			// Test non-matching terms
			const nonMatchingTerms = [
				"xyz", // No match
				"data", // No match
				"runner", // No match
				"platform", // No match
			]

			for (const term of nonMatchingTerms) {
				const nonMatching = manager.filterItems(testItems, { search: term })
				expect(nonMatching.length).toBe(0)
			}
		})

		it("should find subcomponents by name and description", () => {
			const testItems: PackageManagerItem[] = [
				{
					name: "Data Platform",
					description: "A platform for data processing",
					type: "package",
					version: "1.0.0",
					url: "/test/data-platform",
					repoUrl: "https://example.com",
					items: [
						{
							type: "mcp server",
							path: "mcp servers/data-validator",
							metadata: {
								name: "Data Validator",
								description: "An MCP server for validating data quality",
								type: "mcp server",
								version: "1.0.0",
							},
							lastUpdated: "2025-04-13T10:00:00-07:00",
						},
					],
				},
			]

			const filtered = manager.filterItems(testItems, { search: "data validator" })
			expect(filtered).toHaveLength(1)
			expect(filtered[0].items).toHaveLength(1)
			expect(filtered[0].items![0].metadata!.name).toBe("Data Validator")
		})

		it("should search in subcomponent metadata", () => {
			const filtered = manager.filterItems(testItems, { search: "child mode" })
			expect(filtered).toHaveLength(1)
			expect(filtered[0].items).toBeDefined()
			expect(filtered[0].items![0].metadata!.name).toBe("Child Mode")
		})

		it("should handle empty subcomponents array", () => {
			const filtered = manager.filterItems(testItems, { type: "package" })
			expect(filtered).toHaveLength(2)
			expect(filtered[1].items).toHaveLength(0)
		})
	})

	describe("sortItems with subcomponents", () => {
		const testItems: PackageManagerItem[] = [
			{
				name: "B Package",
				description: "Package B",
				type: "package",
				version: "1.0.0",
				url: "/test/b",
				repoUrl: "https://example.com",
				items: [
					{
						type: "mode",
						path: "modes/y",
						metadata: {
							name: "Y Mode",
							description: "Mode Y",
							type: "mode",
							version: "1.0.0",
						},
						lastUpdated: "2025-04-13T09:00:00-07:00",
					},
					{
						type: "mode",
						path: "modes/x",
						metadata: {
							name: "X Mode",
							description: "Mode X",
							type: "mode",
							version: "1.0.0",
						},
						lastUpdated: "2025-04-13T09:00:00-07:00",
					},
				],
			},
			{
				name: "A Package",
				description: "Package A",
				type: "package",
				version: "1.0.0",
				url: "/test/a",
				repoUrl: "https://example.com",
				items: [
					{
						type: "mode",
						path: "modes/z",
						metadata: {
							name: "Z Mode",
							description: "Mode Z",
							type: "mode",
							version: "1.0.0",
						},
						lastUpdated: "2025-04-13T08:00:00-07:00",
					},
				],
			},
		]

		it("should sort parent items while preserving subcomponents", () => {
			const sorted = manager.sortItems(testItems, "name", "asc")
			expect(sorted[0].name).toBe("A Package")
			expect(sorted[1].name).toBe("B Package")
			expect(sorted[0].items![0].metadata!.name).toBe("Z Mode")
			expect(sorted[1].items![0].metadata!.name).toBe("Y Mode")
		})

		it("should sort subcomponents within parents", () => {
			const sorted = manager.sortItems(testItems, "name", "asc", true)
			expect(sorted[1].items![0].metadata!.name).toBe("X Mode")
			expect(sorted[1].items![1].metadata!.name).toBe("Y Mode")
		})

		it("should preserve subcomponent order when sortSubcomponents is false", () => {
			const sorted = manager.sortItems(testItems, "name", "asc", false)
			expect(sorted[1].items![0].metadata!.name).toBe("Y Mode")
			expect(sorted[1].items![1].metadata!.name).toBe("X Mode")
		})

		it("should handle empty subcomponents when sorting", () => {
			const itemsWithEmpty = [
				...testItems,
				{
					name: "C Package",
					description: "Package C",
					type: "package" as const,
					version: "1.0.0",
					url: "/test/c",
					repoUrl: "https://example.com",
					items: [],
				} as PackageManagerItem,
			]
			const sorted = manager.sortItems(itemsWithEmpty, "name", "asc")
			expect(sorted[2].name).toBe("C Package")
			expect(sorted[2].items).toHaveLength(0)
		})
	})
	describe("filterItems with real data", () => {
		it("should find data validator in package-manager-template", async () => {
			// Load real data from the template
			const templatePath = path.resolve(__dirname, "../../../../package-manager-template")
			const scanner = new MetadataScanner()
			const items = await scanner.scanDirectory(templatePath, "https://example.com")

			// Test 1: Search for "data validator" (lowercase)
			const filtered1 = manager.filterItems(items, { search: "data validator" })
			console.log("Test 1 - Search for 'data validator'")
			console.log("Filtered items count:", filtered1.length)

			// Verify we find the Data Validator component
			expect(filtered1.length).toBeGreaterThan(0)

			// Find the Data Validator component in the filtered results
			let foundDataValidator1 = false
			for (const item of filtered1) {
				if (item.items) {
					for (const subItem of item.items) {
						if (subItem.metadata?.name === "Data Validator") {
							foundDataValidator1 = true
							break
						}
					}
				}
			}
			expect(foundDataValidator1).toBe(true)

			// Test 2: Search for "DATA VALIDATOR" (uppercase)
			const filtered2 = manager.filterItems(items, { search: "DATA VALIDATOR" })
			console.log("\nTest 2 - Search for 'DATA VALIDATOR'")
			console.log("Filtered items count:", filtered2.length)

			// Verify we find the Data Validator component
			expect(filtered2.length).toBeGreaterThan(0)

			// Test 3: Search for "validator" (partial match)
			const filtered3 = manager.filterItems(items, { search: "validator" })
			console.log("\nTest 3 - Search for 'validator'")
			console.log("Filtered items count:", filtered3.length)

			// Verify we find the Data Validator component
			expect(filtered3.length).toBeGreaterThan(0)

			// Test 4: Search for "data valid" (partial match)
			const filtered4 = manager.filterItems(items, { search: "data valid" })
			console.log("\nTest 4 - Search for 'data valid'")
			console.log("Filtered items count:", filtered4.length)

			// Verify we find the Data Validator component
			expect(filtered4.length).toBeGreaterThan(0)
		})
	})
})

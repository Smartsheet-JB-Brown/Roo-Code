import * as path from "path"
import { PackageManagerManager } from "../PackageManagerManager"
import { MetadataScanner } from "../MetadataScanner"
import { PackageManagerItem } from "../types"

describe("Package Manager with Real Data", () => {
	let manager: PackageManagerManager
	let templateItems: PackageManagerItem[]

	beforeAll(async () => {
		// Load real data from template
		const metadataScanner = new MetadataScanner()
		const templatePath = path.resolve(__dirname, "../../../../package-manager-template")
		templateItems = await metadataScanner.scanDirectory(templatePath, "https://example.com")
	})

	beforeEach(() => {
		// Create manager with template data
		manager = new PackageManagerManager({
			extensionPath: path.resolve(__dirname, "../../../../"),
			globalStorageUri: { fsPath: path.resolve(__dirname, "../../../../mock/settings/path") },
		} as any)
		manager["currentItems"] = [...templateItems]
	})

	describe("search functionality with real data", () => {
		it("should match case-insensitive and whitespace-insensitive substrings", () => {
			const searchTerms = [
				"Data Valid", // Should match "Data Validator"
				"DATA VALID", // Should match "Data Validator"
				"data  valid", // Should match "Data Validator"
				"validator", // Should match "Data Validator"
			]

			for (const term of searchTerms) {
				const filteredItems = manager.filterItems(templateItems, { search: term })

				// Should find Data Platform Package containing Data Validator
				expect(filteredItems.length).toBe(1)
				expect(filteredItems[0].name).toBe("Data Platform Package")
				expect(filteredItems[0].items?.length).toBe(1)
				expect(filteredItems[0].items?.[0].metadata?.name).toBe("Data Validator")

				// Verify excluded items
				const excludedItems = templateItems.filter(
					(item) => !filteredItems.some((filtered) => filtered.name === item.name),
				)
				expect(excludedItems).toContainEqual(expect.objectContaining({ name: "Data Processor" }))
				expect(excludedItems).toContainEqual(expect.objectContaining({ name: "Data Engineer" }))
				expect(excludedItems).toContainEqual(expect.objectContaining({ name: "Example MCP Server" }))

				// Verify excluded subcomponents
				const excludedSubcomponents = templateItems
					.find((item) => item.name === "Data Platform Package")
					?.items?.filter(
						(subItem) =>
							!filteredItems[0].items?.some(
								(filtered) => filtered.metadata?.name === subItem.metadata?.name,
							),
					)
				expect(excludedSubcomponents).toContainEqual(
					expect.objectContaining({
						metadata: expect.objectContaining({
							name: "Data Platform Administrator",
						}),
					}),
				)
			}
		})

		it("should find partial matches in standalone components", () => {
			const searchTerms = [
				"data proc", // Should match "Data Processor"
				"DATA PROC", // Should match "Data Processor"
				"processor", // Should match "Data Processor"
			]

			for (const term of searchTerms) {
				const filteredItems = manager.filterItems(templateItems, { search: term })

				// Should find Data Processor as standalone component
				expect(filteredItems.length).toBe(1)
				expect(filteredItems[0].name).toBe("Data Processor")
				expect(filteredItems[0].type).toBe("mcp server")

				// Verify excluded items
				const excludedItems = templateItems.filter(
					(item) => !filteredItems.some((filtered) => filtered.name === item.name),
				)
				expect(excludedItems).toContainEqual(expect.objectContaining({ name: "Data Platform Package" }))
				expect(excludedItems).toContainEqual(expect.objectContaining({ name: "Example MCP Server" }))
				expect(excludedItems).toContainEqual(expect.objectContaining({ name: "Data Engineer" }))
			}
		})

		it("should handle type filtering with search correctly", () => {
			// Test with broad search term "data" and type "mcp server"
			const filteredItems = manager.filterItems(templateItems, {
				search: "data",
				type: "mcp server",
			})

			// Should find two items because:
			// 1. Data Processor - matches "data" and is an MCP server
			// 2. Data Platform Package - contains Data Validator which is an MCP server and matches "data"
			expect(filteredItems.length).toBe(2)

			// Verify Data Processor (standalone MCP server)
			const standaloneServer = filteredItems.find((item) => item.type === "mcp server")
			expect(standaloneServer).toBeDefined()
			expect(standaloneServer?.name).toBe("Data Processor")

			// Verify Data Platform Package (contains matching MCP server)
			const packageWithServer = filteredItems.find((item) => item.type === "package")
			expect(packageWithServer).toBeDefined()
			expect(packageWithServer?.name).toBe("Data Platform Package")
			expect(packageWithServer?.items?.length).toBe(1)
			expect(packageWithServer?.items?.[0].metadata?.name).toBe("Data Validator")

			// Verify excluded items (either wrong type or no "data" match)
			const excludedItems = templateItems.filter(
				(item) => !filteredItems.some((filtered) => filtered.name === item.name),
			)
			// Example MCP Server - right type but no "data" match
			expect(excludedItems).toContainEqual(expect.objectContaining({ name: "Example MCP Server" }))
			// File Analyzer - right type but no "data" match
			expect(excludedItems).toContainEqual(expect.objectContaining({ name: "File Analyzer MCP Server" }))
			// Data Engineer - has "data" but wrong type
			expect(excludedItems).toContainEqual(expect.objectContaining({ name: "Data Engineer" }))

			// Verify excluded subcomponents (either wrong type or no "data" match)
			const excludedSubcomponents = templateItems
				.find((item) => item.name === "Data Platform Package")
				?.items?.filter(
					(subItem) =>
						!filteredItems
							.find((item) => item.name === "Data Platform Package")
							?.items?.some((filtered) => filtered.metadata?.name === subItem.metadata?.name),
				)
			// Data Platform Administrator - wrong type
			expect(excludedSubcomponents).toContainEqual(
				expect.objectContaining({
					metadata: expect.objectContaining({
						name: "Data Platform Administrator",
					}),
				}),
			)
		})

		it("should handle specific search with type filtering", () => {
			// Test with specific search "valid" and type "mcp server"
			const filteredItems = manager.filterItems(templateItems, {
				search: "valid",
				type: "mcp server",
			})

			// Should only find Data Platform Package containing Data Validator
			expect(filteredItems.length).toBe(1)
			expect(filteredItems[0].name).toBe("Data Platform Package")
			expect(filteredItems[0].items?.length).toBe(1)
			expect(filteredItems[0].items?.[0].metadata?.name).toBe("Data Validator")

			// Verify excluded items
			const excludedItems = templateItems.filter(
				(item) => !filteredItems.some((filtered) => filtered.name === item.name),
			)
			// Data Processor - right type but no "valid" match
			expect(excludedItems).toContainEqual(expect.objectContaining({ name: "Data Processor" }))
			// Example MCP Server - right type but no "valid" match
			expect(excludedItems).toContainEqual(expect.objectContaining({ name: "Example MCP Server" }))
			// Data Engineer - no "valid" match and wrong type
			expect(excludedItems).toContainEqual(expect.objectContaining({ name: "Data Engineer" }))
		})

		it("should handle no matches by excluding everything", () => {
			const filteredItems = manager.filterItems(templateItems, { search: "nonexistent" })
			expect(filteredItems).toHaveLength(0)

			// Verify all items were excluded
			const excludedItems = templateItems.filter(
				(item) => !filteredItems.some((filtered) => filtered.name === item.name),
			)
			expect(excludedItems.length).toBe(templateItems.length)
		})

		it("should exclude non-matching types", () => {
			const filteredItems = manager.filterItems(templateItems, { type: "mode" })

			// Should exclude all non-mode items
			const excludedItems = templateItems.filter(
				(item) => !filteredItems.some((filtered) => filtered.name === item.name),
			)
			expect(excludedItems).toContainEqual(
				expect.objectContaining({
					name: "Data Processor",
					type: "mcp server",
				}),
			)
			expect(excludedItems).toContainEqual(
				expect.objectContaining({
					name: "Data Platform Package",
					type: "package",
				}),
			)
		})
	})
})

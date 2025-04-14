import * as path from "path"
import * as vscode from "vscode"
import { PackageManagerManager } from "../PackageManagerManager"
import { MetadataScanner } from "../MetadataScanner"
import { handlePackageManagerMessages } from "../../../core/webview/packageManagerMessageHandler"
import { ClineProvider } from "../../../core/webview/ClineProvider"
import { WebviewMessage } from "../../../shared/WebviewMessage"
import { PackageManagerItem } from "../types"

// Mock vscode
jest.mock("vscode")

describe("Package Manager Tests", () => {
	let manager: PackageManagerManager
	let metadataScanner: MetadataScanner
	let provider: ClineProvider
	let postedMessages: any[] = []
	let templateItems: PackageManagerItem[]

	beforeAll(async () => {
		// Load real data from template once for all tests
		metadataScanner = new MetadataScanner()
		const templatePath = path.resolve(__dirname, "../../../../package-manager-template")
		templateItems = await metadataScanner.scanDirectory(templatePath, "https://example.com")
	})

	beforeEach(() => {
		// Reset mocks
		jest.clearAllMocks()
		postedMessages = []

		// Create a real context-like object
		const context = {
			extensionPath: path.resolve(__dirname, "../../../../"),
			globalStorageUri: { fsPath: path.resolve(__dirname, "../../../../mock/settings/path") },
		} as vscode.ExtensionContext

		// Create real instances
		manager = new PackageManagerManager(context)

		// Set up manager with template data
		manager["currentItems"] = [...templateItems]

		// Create a minimal provider mock that tracks posted messages
		provider = {
			postMessageToWebview: jest.fn((message) => {
				postedMessages.push(message)
				return Promise.resolve()
			}),
			postStateToWebview: jest.fn(() => Promise.resolve()),
			getStateToPostToWebview: jest.fn(() => Promise.resolve({})),
			contextProxy: {
				getValue: jest.fn(),
				setValue: jest.fn(),
			},
		} as unknown as ClineProvider
	})

	describe("Direct Filtering Tests", () => {
		describe("Basic search functionality", () => {
			it("should match exact search terms", () => {
				const searchTerms = [
					"data validator", // Exact match
					"Data Validator", // Case variation
					"DATA VALIDATOR", // All caps
					"data  validator", // Extra space
				]

				for (const term of searchTerms) {
					const filteredItems = manager.filterItems(templateItems, { search: term })

					// Should find Data Platform Package containing Data Validator
					expect(filteredItems.length).toBe(1)
					expect(filteredItems[0].name).toBe("Data Platform Package")

					// Count how many subcomponents have matchInfo.matched = true
					const matchingSubcomponents =
						filteredItems[0].items?.filter((item) => item.matchInfo?.matched) || []
					expect(matchingSubcomponents.length).toBe(1)
					expect(matchingSubcomponents[0].metadata?.name).toBe("Data Validator")
				}
			})

			it("should match partial search terms", () => {
				const searchTerms = [
					"valid", // Partial match for "validator"
					"data valid", // Partial match
					"validator", // Partial match
				]

				for (const term of searchTerms) {
					const filteredItems = manager.filterItems(templateItems, { search: term })

					// Should find Data Platform Package containing Data Validator
					expect(filteredItems.length).toBe(1)
					expect(filteredItems[0].name).toBe("Data Platform Package")

					// Count how many subcomponents have matchInfo.matched = true
					const matchingSubcomponents =
						filteredItems[0].items?.filter((item) => item.matchInfo?.matched) || []
					expect(matchingSubcomponents.length).toBe(1)
					expect(matchingSubcomponents[0].metadata?.name).toBe("Data Validator")
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
				}
			})

			it("should not match words in wrong order", () => {
				// Test with words in wrong order
				const term = "validator data" // Wrong order from "Data Validator"

				console.log(`\n[DEBUG] Testing search term: "${term}"`)
				const filteredItems = manager.filterItems(templateItems, { search: term })

				// Log filtered items for debugging
				console.log(`[DEBUG] Found ${filteredItems.length} items matching "${term}"`)
				filteredItems.forEach((item) => {
					console.log(`[DEBUG] - Item: ${item.name} (${item.type})`)
					if (item.items) {
						item.items.forEach((subItem) => {
							console.log(
								`[DEBUG]   - Subitem: ${subItem.metadata?.name} (${subItem.type}), matched: ${subItem.matchInfo?.matched}`,
							)
							if (subItem.matchInfo?.matched) {
								console.log(
									`[DEBUG]     - Match reason: nameMatch=${subItem.matchInfo?.matchReason?.nameMatch}, descMatch=${subItem.matchInfo?.matchReason?.descriptionMatch}`,
								)
							}
						})
					}
				})

				// Should not find Data Validator with words in wrong order
				const hasDataValidator = filteredItems.some(
					(item) =>
						item.name === "Data Platform Package" ||
						item.items?.some((subItem) => subItem.metadata?.name === "Data Validator"),
				)
				console.log(`[DEBUG] hasDataValidator: ${hasDataValidator}`)
				expect(hasDataValidator).toBe(false)
			})

			it("should match when search term appears in description", () => {
				// Test with a term that appears in the description
				const term = "validating data" // Appears in "An MCP server for validating data quality..."

				console.log(`\n[DEBUG] Testing search term: "${term}"`)
				const filteredItems = manager.filterItems(templateItems, { search: term })

				// Log filtered items for debugging
				console.log(`[DEBUG] Found ${filteredItems.length} items matching "${term}"`)
				filteredItems.forEach((item) => {
					console.log(`[DEBUG] - Item: ${item.name} (${item.type})`)
					if (item.items) {
						item.items.forEach((subItem) => {
							console.log(
								`[DEBUG]   - Subitem: ${subItem.metadata?.name} (${subItem.type}), matched: ${subItem.matchInfo?.matched}`,
							)
							if (subItem.matchInfo?.matched) {
								console.log(
									`[DEBUG]     - Match reason: nameMatch=${subItem.matchInfo?.matchReason?.nameMatch}, descMatch=${subItem.matchInfo?.matchReason?.descriptionMatch}`,
								)
							}
						})
					}
				})

				// Should find Data Validator because "validating data" appears in its description
				const hasDataValidator = filteredItems.some(
					(item) =>
						item.name === "Data Platform Package" &&
						item.items?.some(
							(subItem) => subItem.metadata?.name === "Data Validator" && subItem.matchInfo?.matched,
						),
				)
				console.log(`[DEBUG] hasDataValidator: ${hasDataValidator}`)
				expect(hasDataValidator).toBe(true)

				// Verify it matched in the description, not the name
				const dataValidator = filteredItems
					.find((item) => item.name === "Data Platform Package")
					?.items?.find((subItem) => subItem.metadata?.name === "Data Validator")

				expect(dataValidator?.matchInfo?.matchReason?.nameMatch).toBe(false)
				expect(dataValidator?.matchInfo?.matchReason?.descriptionMatch).toBe(true)
			})

			it("should handle no matches", () => {
				const nonMatchingTerms = ["nonexistent", "xyz", "nomatch", "qwerty"]

				for (const term of nonMatchingTerms) {
					const filteredItems = manager.filterItems(templateItems, { search: term })
					expect(filteredItems).toHaveLength(0)
				}
			})
		})

		describe("Type filtering", () => {
			it("should filter by type only", () => {
				const filteredItems = manager.filterItems(templateItems, { type: "mode" })

				// Should include only mode items
				const modeItems = filteredItems.filter((item) => item.type === "mode")
				expect(modeItems.length).toBeGreaterThan(0)

				// Verify that the filtered results include items of type "mode"
				expect(modeItems.length).toBeGreaterThan(0)

				// Verify specific items are not in the filtered items
				const filteredItemNames = filteredItems.map((item) => item.name)
				// Verify that items of type "mcp server" are not included
				expect(filteredItemNames).not.toContain("Data Processor")
				expect(filteredItemNames).not.toContain("Example MCP Server")
				expect(filteredItemNames).not.toContain("File Analyzer MCP Server")
			})

			it("should filter by type including subcomponents", () => {
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

				const filtered = manager.filterItems(testItems, { type: "mode" })
				expect(filtered).toHaveLength(1) // The package with modes
				expect(filtered[0].items).toHaveLength(2)
				expect(filtered[0].items![0].type).toBe("mode")
				expect(filtered[0].items![1].type).toBe("mode")
			})
		})

		describe("Combined search and type filtering", () => {
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

				// Count how many subcomponents have matchInfo.matched = true
				const matchingSubcomponents = packageWithServer?.items?.filter((item) => item.matchInfo?.matched) || []
				expect(matchingSubcomponents.length).toBe(1)
				expect(matchingSubcomponents[0].metadata?.name).toBe("Data Validator")

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

				// Count how many subcomponents have matchInfo.matched = true
				const matchingSubcomponents = filteredItems[0].items?.filter((item) => item.matchInfo?.matched) || []
				expect(matchingSubcomponents.length).toBe(1)
				expect(matchingSubcomponents[0].metadata?.name).toBe("Data Validator")

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
		})

		describe("Match info and subcomponents", () => {
			it("should return all subcomponents with match info", () => {
				const testItems: PackageManagerItem[] = [
					{
						name: "Data Platform Package",
						description: "A test platform",
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
							{
								type: "mode",
								path: "modes/task-runner",
								metadata: {
									name: "Task Runner",
									description: "A mode for running tasks",
									type: "mode",
									version: "1.0.0",
								},
								lastUpdated: "2025-04-13T10:00:00-07:00",
							},
						],
					},
				]

				// Search for "data validator"
				const filtered = manager.filterItems(testItems, { search: "data validator" })

				// Verify package is returned
				expect(filtered.length).toBe(1)
				const pkg = filtered[0]

				// Verify all subcomponents are returned
				expect(pkg.items?.length).toBe(2)

				// Verify matching subcomponent has correct matchInfo
				const validator = pkg.items?.find((item) => item.metadata?.name === "Data Validator")
				expect(validator?.matchInfo).toEqual({
					matched: true,
					matchReason: {
						nameMatch: true,
						descriptionMatch: false,
					},
				})

				// Verify non-matching subcomponent has correct matchInfo
				const runner = pkg.items?.find((item) => item.metadata?.name === "Task Runner")
				expect(runner?.matchInfo).toEqual({
					matched: false,
				})

				// Verify package has matchInfo indicating it contains matches
				expect(pkg.matchInfo).toEqual({
					matched: true,
					matchReason: {
						nameMatch: false,
						descriptionMatch: false,
						hasMatchingSubcomponents: true,
					},
				})
			})
		})
	})

	describe("Sorting Tests", () => {
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

	describe("Message Handler Integration Tests", () => {
		it("should find exact match for 'data validator' via message handler", async () => {
			// Search for exact match "data validator"
			await handlePackageManagerMessages(
				provider,
				{
					type: "filterPackageManagerItems",
					filters: {
						search: "data validator",
					},
				} as WebviewMessage,
				manager,
			)

			// Verify the filtered results in the state update
			const stateUpdate = postedMessages.find(
				(msg) => msg.type === "state" && msg.state?.packageManagerItems !== undefined,
			)
			expect(stateUpdate).toBeDefined()

			const filteredItems = stateUpdate.state.packageManagerItems as PackageManagerItem[]
			expect(filteredItems).toBeDefined()

			// Should only find the package containing "Data Validator"
			expect(filteredItems.length).toBe(1)
			expect(filteredItems[0].name).toBe("Data Platform Package")

			// Verify the data validator component is present
			const dataValidator = filteredItems[0].items?.find(
				(item) => item.type === "mcp server" && item.metadata?.name === "Data Validator",
			)
			expect(dataValidator).toBeDefined()
			expect(dataValidator?.metadata?.description).toContain("validating data quality")

			// Verify only matching subcomponents have matchInfo.matched = true
			const matchingSubcomponents = filteredItems[0].items?.filter((item) => item.matchInfo?.matched) || []
			expect(matchingSubcomponents.length).toBe(1)
			expect(matchingSubcomponents[0].metadata?.name).toBe("Data Validator")
		})

		it("should handle partial matches via message handler", async () => {
			// Test partial match "validator"
			await handlePackageManagerMessages(
				provider,
				{
					type: "filterPackageManagerItems",
					filters: {
						search: "validator",
					},
				} as WebviewMessage,
				manager,
			)

			const stateUpdate = postedMessages.find(
				(msg) => msg.type === "state" && msg.state?.packageManagerItems !== undefined,
			)
			const filteredItems = stateUpdate.state.packageManagerItems as PackageManagerItem[]

			expect(filteredItems.length).toBe(1)
			expect(filteredItems[0].name).toBe("Data Platform Package")
		})

		it("should handle type filtering with search via message handler", async () => {
			// Search with type filter
			await handlePackageManagerMessages(
				provider,
				{
					type: "filterPackageManagerItems",
					filters: {
						search: "data",
						type: "mcp server",
					},
				} as WebviewMessage,
				manager,
			)

			const stateUpdate = postedMessages.find(
				(msg) => msg.type === "state" && msg.state?.packageManagerItems !== undefined,
			)
			const filteredItems = stateUpdate.state.packageManagerItems as PackageManagerItem[]

			// Should find:
			// 1. Data Processor (standalone MCP server)
			// 2. Data Platform Package (contains Data Validator MCP server)
			expect(filteredItems.length).toBe(2)

			// Verify standalone MCP server
			const standaloneServer = filteredItems.find((item) => item.type === "mcp server")
			expect(standaloneServer).toBeDefined()
			expect(standaloneServer?.name).toBe("Data Processor")

			// Verify package with MCP server
			const packageWithServer = filteredItems.find((item) => item.type === "package")
			expect(packageWithServer).toBeDefined()
			expect(packageWithServer?.name).toBe("Data Platform Package")
		})

		it("should handle no matches via message handler", async () => {
			// Search for non-existent term
			await handlePackageManagerMessages(
				provider,
				{
					type: "filterPackageManagerItems",
					filters: {
						search: "nonexistent",
					},
				} as WebviewMessage,
				manager,
			)

			const stateUpdate = postedMessages.find(
				(msg) => msg.type === "state" && msg.state?.packageManagerItems !== undefined,
			)
			const filteredItems = stateUpdate.state.packageManagerItems as PackageManagerItem[]

			expect(filteredItems).toHaveLength(0)
		})

		it("should be case insensitive via message handler", async () => {
			// Test different cases
			const searchTerms = ["DATA VALIDATOR", "data validator", "Data Validator", "dAtA vAlIdAtOr"]

			for (const term of searchTerms) {
				postedMessages = [] // Reset for each test
				await handlePackageManagerMessages(
					provider,
					{
						type: "filterPackageManagerItems",
						filters: {
							search: term,
						},
					} as WebviewMessage,
					manager,
				)

				const stateUpdate = postedMessages.find(
					(msg) => msg.type === "state" && msg.state?.packageManagerItems !== undefined,
				)
				const filteredItems = stateUpdate.state.packageManagerItems as PackageManagerItem[]

				expect(filteredItems.length).toBe(1)
				expect(filteredItems[0].name).toBe("Data Platform Package")
			}
		})
	})
})

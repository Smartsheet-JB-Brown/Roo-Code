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

describe("Package Manager Integration", () => {
	let manager: PackageManagerManager
	let metadataScanner: MetadataScanner
	let provider: ClineProvider
	let postedMessages: any[] = []
	let templateItems: PackageManagerItem[]

	beforeAll(async () => {
		// Load real data from template once
		metadataScanner = new MetadataScanner()
		const templatePath = path.resolve(__dirname, "../../../../package-manager-template")
		templateItems = await metadataScanner.scanDirectory(templatePath, "https://example.com")

		// Debug log the loaded data
		console.log("Loaded template items:", JSON.stringify(templateItems, null, 2))
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

	describe("search functionality", () => {
		it("should find exact match for 'data validator'", async () => {
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

			// Should not find other items containing just "data" or just "validator"
			const otherDataItems = filteredItems.filter(
				(item) =>
					item.name !== "Data Platform Package" &&
					(item.name.toLowerCase().includes("data") || item.description.toLowerCase().includes("data")),
			)
			expect(otherDataItems).toHaveLength(0)

			// Verify the data validator component is present
			const dataValidator = filteredItems[0].items?.find(
				(item) => item.type === "mcp server" && item.metadata?.name === "Data Validator",
			)
			expect(dataValidator).toBeDefined()
			expect(dataValidator?.metadata?.description).toContain("validating data quality")

			// Verify only matching subcomponents are included
			expect(filteredItems[0].items?.length).toBe(1)
			expect(filteredItems[0].items?.[0].metadata?.name).toBe("Data Validator")
		})

		it("should handle partial matches", async () => {
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

		it("should handle type filtering with search", async () => {
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
			expect(packageWithServer?.items?.length).toBe(1)
			expect(packageWithServer?.items?.[0].metadata?.name).toBe("Data Validator")

			// Verify excluded items
			const allItems = [...templateItems]
			const excludedItems = allItems.filter(
				(item) => !filteredItems.some((filtered) => filtered.name === item.name),
			)

			// Example MCP Server - right type but no "data" match
			expect(excludedItems).toContainEqual(expect.objectContaining({ name: "Example MCP Server" }))
			// File Analyzer - right type but no "data" match
			expect(excludedItems).toContainEqual(expect.objectContaining({ name: "File Analyzer MCP Server" }))
			// Data Engineer - has "data" but wrong type
			expect(excludedItems).toContainEqual(expect.objectContaining({ name: "Data Engineer" }))
		})

		it("should handle no matches", async () => {
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

		it("should be case insensitive", async () => {
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

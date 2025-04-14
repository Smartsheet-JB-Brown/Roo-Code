import { PackageManagerManager } from "../PackageManagerManager"
import { ComponentType, PackageManagerItem } from "../types"
import * as vscode from "vscode"

// Mock vscode
jest.mock("vscode")

describe("Type Filter Behavior", () => {
	let packageManagerManager: PackageManagerManager
	let mockContext: vscode.ExtensionContext

	beforeEach(() => {
		mockContext = {
			globalStorageUri: { fsPath: "/test/path" },
		} as unknown as vscode.ExtensionContext

		packageManagerManager = new PackageManagerManager(mockContext)
	})

	describe("Package with Subcomponents", () => {
		let testItems: PackageManagerItem[]

		beforeEach(() => {
			// Create test items
			testItems = [
				{
					name: "Test Package",
					description: "A test package",
					type: "package",
					url: "test/package",
					repoUrl: "https://example.com",
					items: [
						{
							type: "mode",
							path: "test/mode",
							metadata: {
								name: "Test Mode",
								description: "A test mode",
								version: "1.0.0",
								type: "mode",
							},
						},
						{
							type: "mcp server",
							path: "test/server",
							metadata: {
								name: "Test Server",
								description: "A test server",
								version: "1.0.0",
								type: "mcp server",
							},
						},
					],
				},
				{
					name: "Test Mode",
					description: "A standalone test mode",
					type: "mode",
					url: "test/standalone-mode",
					repoUrl: "https://example.com",
				},
			]
		})

		test("should include package when filtering by its own type", () => {
			// Filter by package type
			const filtered = packageManagerManager.filterItems(testItems, { type: "package" })

			// Should include the package
			expect(filtered.length).toBe(1)
			expect(filtered[0].name).toBe("Test Package")
			expect(filtered[0].matchInfo?.matched).toBe(true)
			expect(filtered[0].matchInfo?.matchReason?.typeMatch).toBe(true)
		})

		test("should include package when filtering by subcomponent type", () => {
			// Filter by mode type
			const filtered = packageManagerManager.filterItems(testItems, { type: "mode" })

			// Should include both the package (because it has a mode subcomponent) and the standalone mode
			expect(filtered.length).toBe(2)

			// Check the package
			const packageItem = filtered.find((item) => item.type === "package")
			expect(packageItem).toBeDefined()
			expect(packageItem?.matchInfo?.matched).toBe(true)
			expect(packageItem?.matchInfo?.matchReason?.typeMatch).toBe(false)
			expect(packageItem?.matchInfo?.matchReason?.hasMatchingSubcomponents).toBe(true)

			// Check that the mode subcomponent is marked as matched
			const modeSubcomponent = packageItem?.items?.find((item) => item.type === "mode")
			expect(modeSubcomponent).toBeDefined()
			expect(modeSubcomponent?.matchInfo?.matched).toBe(true)

			// Check that the server subcomponent is not marked as matched
			const serverSubcomponent = packageItem?.items?.find((item) => item.type === "mcp server")
			expect(serverSubcomponent).toBeDefined()
			expect(serverSubcomponent?.matchInfo?.matched).toBe(false)

			// Check the standalone mode
			const modeItem = filtered.find((item) => item.type === "mode")
			expect(modeItem).toBeDefined()
		})

		test("should not include package when filtering by type with no matching subcomponents", () => {
			// Create a package with no matching subcomponents
			const noMatchPackage: PackageManagerItem = {
				name: "No Match Package",
				description: "A package with no matching subcomponents",
				type: "package",
				url: "test/no-match",
				repoUrl: "https://example.com",
				items: [
					{
						type: "prompt",
						path: "test/prompt",
						metadata: {
							name: "Test Prompt",
							description: "A test prompt",
							version: "1.0.0",
							type: "prompt",
						},
					},
				],
			}

			// Filter by mode type
			const filtered = packageManagerManager.filterItems([noMatchPackage], { type: "mode" })

			// Should not include the package
			expect(filtered.length).toBe(0)
		})

		test("should handle package with no subcomponents", () => {
			// Create a package with no subcomponents
			const noSubcomponentsPackage: PackageManagerItem = {
				name: "No Subcomponents Package",
				description: "A package with no subcomponents",
				type: "package",
				url: "test/no-subcomponents",
				repoUrl: "https://example.com",
			}

			// Filter by mode type
			const filtered = packageManagerManager.filterItems([noSubcomponentsPackage], { type: "mode" })

			// Should not include the package
			expect(filtered.length).toBe(0)
		})
	})

	describe("Consistency with Search Term Behavior", () => {
		let testItems: PackageManagerItem[]

		beforeEach(() => {
			// Create test items
			testItems = [
				{
					name: "Test Package",
					description: "A test package",
					type: "package",
					url: "test/package",
					repoUrl: "https://example.com",
					items: [
						{
							type: "mode",
							path: "test/mode",
							metadata: {
								name: "Test Mode",
								description: "A test mode",
								version: "1.0.0",
								type: "mode",
							},
						},
					],
				},
			]
		})

		test("should behave consistently with search term for packages", () => {
			// Filter by type
			const typeFiltered = packageManagerManager.filterItems(testItems, { type: "package" })

			// Filter by search term that matches the package
			const searchFiltered = packageManagerManager.filterItems(testItems, { search: "test package" })

			// Both should include the package
			expect(typeFiltered.length).toBe(1)
			expect(searchFiltered.length).toBe(1)

			// Both should mark the package as matched
			expect(typeFiltered[0].matchInfo?.matched).toBe(true)
			expect(searchFiltered[0].matchInfo?.matched).toBe(true)
		})

		test("should behave consistently with search term for subcomponents", () => {
			// Filter by type that matches a subcomponent
			const typeFiltered = packageManagerManager.filterItems(testItems, { type: "mode" })

			// Filter by search term that matches a subcomponent
			const searchFiltered = packageManagerManager.filterItems(testItems, { search: "test mode" })

			// Both should include the package
			expect(typeFiltered.length).toBe(1)
			expect(searchFiltered.length).toBe(1)

			// Both should mark the package as matched
			expect(typeFiltered[0].matchInfo?.matched).toBe(true)
			expect(searchFiltered[0].matchInfo?.matched).toBe(true)

			// Both should mark the subcomponent as matched
			expect(typeFiltered[0].items?.[0].matchInfo?.matched).toBe(true)
			expect(searchFiltered[0].items?.[0].matchInfo?.matched).toBe(true)
		})
	})
})

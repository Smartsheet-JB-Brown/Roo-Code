import { PackageManagerManager } from "../PackageManagerManager"
import { ComponentType, PackageManagerItem } from "../types"
import * as vscode from "vscode"

// Mock vscode
jest.mock("vscode")

describe("Combined Features", () => {
	let packageManagerManager: PackageManagerManager
	let mockContext: vscode.ExtensionContext

	beforeEach(() => {
		mockContext = {
			globalStorageUri: { fsPath: "/test/path" },
		} as unknown as vscode.ExtensionContext

		packageManagerManager = new PackageManagerManager(mockContext)
	})

	describe("Type Filter and Localization", () => {
		test("should work together correctly", () => {
			// This test verifies that the type filter and localization changes work together
			// Since we can't easily test the actual localization in a unit test,
			// we're just verifying that the type filter works correctly

			// Create test items
			const testItems: PackageManagerItem[] = [
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
	})
})

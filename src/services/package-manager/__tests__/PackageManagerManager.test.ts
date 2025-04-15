import { PackageManagerManager } from "../PackageManagerManager"
import { PackageManagerItem, PackageManagerSource, PackageManagerRepository, ComponentType } from "../types"
import { MetadataScanner } from "../MetadataScanner"
import { GitFetcher } from "../GitFetcher"
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

	describe("Type Filter Behavior", () => {
		let typeFilterTestItems: PackageManagerItem[]

		beforeEach(() => {
			// Create test items
			typeFilterTestItems = [
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

		// Concurrency Control tests moved to their own describe block

		test("should include package when filtering by its own type", () => {
			// Filter by package type
			const filtered = manager.filterItems(typeFilterTestItems, { type: "package" })

			// Should include the package
			expect(filtered.length).toBe(1)
			expect(filtered[0].name).toBe("Test Package")
			expect(filtered[0].matchInfo?.matched).toBe(true)
			expect(filtered[0].matchInfo?.matchReason?.typeMatch).toBe(true)
		})

		// Note: The test "should include package when filtering by subcomponent type" is already covered by
		// the test "should work with type filter and localization together" in the filterItems with subcomponents section

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
			const filtered = manager.filterItems([noMatchPackage], { type: "mode" })

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
			const filtered = manager.filterItems([noSubcomponentsPackage], { type: "mode" })

			// Should not include the package
			expect(filtered.length).toBe(0)
		})

		describe("Consistency with Search Term Behavior", () => {
			let consistencyTestItems: PackageManagerItem[]

			beforeEach(() => {
				// Create test items
				consistencyTestItems = [
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
				const typeFiltered = manager.filterItems(consistencyTestItems, { type: "package" })

				// Filter by search term that matches the package
				const searchFiltered = manager.filterItems(consistencyTestItems, { search: "test package" })

				// Both should include the package
				expect(typeFiltered.length).toBe(1)
				expect(searchFiltered.length).toBe(1)

				// Both should mark the package as matched
				expect(typeFiltered[0].matchInfo?.matched).toBe(true)
				expect(searchFiltered[0].matchInfo?.matched).toBe(true)
			})

			test("should behave consistently with search term for subcomponents", () => {
				// Filter by type that matches a subcomponent
				const typeFiltered = manager.filterItems(consistencyTestItems, { type: "mode" })

				// Filter by search term that matches a subcomponent
				const searchFiltered = manager.filterItems(consistencyTestItems, { search: "test mode" })

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

	// This test was skipped because it depends on the actual content of the package-manager-template
	// which may change over time
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

describe("Concurrency Control", () => {
	let manager: PackageManagerManager

	beforeEach(() => {
		const mockContext = {
			globalStorageUri: { fsPath: "/test/path" },
		} as vscode.ExtensionContext
		manager = new PackageManagerManager(mockContext)
	})

	it("should not allow concurrent operations on the same source", async () => {
		const source: PackageManagerSource = {
			url: "https://github.com/test/repo",
			enabled: true,
		}

		// Mock getRepositoryData to be slow
		const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
		const slowGetRepositoryData = jest.spyOn(manager as any, "getRepositoryData").mockImplementation(async () => {
			await delay(100) // Simulate slow operation
			return {
				metadata: { name: "test", description: "test", version: "1.0.0" },
				items: [],
				url: source.url,
			} as PackageManagerRepository
		})

		// Start two concurrent operations
		const operation1 = manager.getPackageManagerItems([source])
		const operation2 = manager.getPackageManagerItems([source])

		// Wait for both to complete
		const [result1, result2] = await Promise.all([operation1, operation2])

		// Verify getRepositoryData was only called once
		expect(slowGetRepositoryData).toHaveBeenCalledTimes(1)
	})

	it("should not allow metadata scanning during git operations", async () => {
		const source1: PackageManagerSource = {
			url: "https://github.com/test/repo1",
			enabled: true,
		}
		const source2: PackageManagerSource = {
			url: "https://github.com/test/repo2",
			enabled: true,
		}

		let isGitOperationActive = false
		let metadataScanDuringGit = false

		// Mock git operation to be slow and set flag
		jest.spyOn(GitFetcher.prototype, "fetchRepository").mockImplementation(async () => {
			isGitOperationActive = true
			await new Promise((resolve) => setTimeout(resolve, 100))
			isGitOperationActive = false
			return {
				metadata: { name: "test", description: "test", version: "1.0.0" },
				items: [],
				url: source1.url,
			}
		})

		// Mock metadata scanner to check if git operation is active
		jest.spyOn(MetadataScanner.prototype, "scanDirectory").mockImplementation(async () => {
			if (isGitOperationActive) {
				metadataScanDuringGit = true
			}
			return []
		})

		// Process both sources
		await manager.getPackageManagerItems([source1, source2])

		// Verify metadata scanning didn't occur during git operations
		expect(metadataScanDuringGit).toBe(false)
	})

	it("should queue metadata scans and process them sequentially", async () => {
		const sources: PackageManagerSource[] = [
			{ url: "https://github.com/test/repo1", enabled: true },
			{ url: "https://github.com/test/repo2", enabled: true },
			{ url: "https://github.com/test/repo3", enabled: true },
		]

		let activeScans = 0
		let maxConcurrentScans = 0
		const scanPromises: Promise<void>[] = []

		// Create a mock MetadataScanner
		const mockScanner = new MetadataScanner()
		const scanDirectorySpy = jest.spyOn(mockScanner, "scanDirectory").mockImplementation(async () => {
			activeScans++
			maxConcurrentScans = Math.max(maxConcurrentScans, activeScans)
			const promise = new Promise<void>((resolve) => setTimeout(resolve, 50))
			scanPromises.push(promise)
			await promise
			activeScans--
			return []
		})

		// Create a mock GitFetcher that uses our mock scanner
		const mockGitFetcher = new GitFetcher({
			globalStorageUri: { fsPath: "/test/path" },
		} as vscode.ExtensionContext)

		// Replace GitFetcher's metadataScanner with our mock
		;(mockGitFetcher as any).metadataScanner = mockScanner

		// Mock GitFetcher's fetchRepository to trigger metadata scanning
		jest.spyOn(mockGitFetcher, "fetchRepository").mockImplementation(async (repoUrl: string) => {
			// Call scanDirectory through our mock scanner
			await mockScanner.scanDirectory("/test/path", repoUrl)

			return {
				metadata: { name: "test", description: "test", version: "1.0.0" },
				items: [],
				url: repoUrl,
			}
		})

		// Replace the GitFetcher instance in the manager
		;(manager as any).gitFetcher = mockGitFetcher

		// Process all sources
		await manager.getPackageManagerItems(sources)
		await Promise.all(scanPromises)

		// Verify scans were called and only one was active at a time
		expect(scanDirectorySpy).toHaveBeenCalledTimes(sources.length)
		expect(maxConcurrentScans).toBe(1)
	})
})

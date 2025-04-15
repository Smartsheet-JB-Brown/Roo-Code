import * as path from "path"

// Helper function to normalize paths for test assertions
const normalizePath = (p: string) => p.replace(/\\/g, "/")
import * as fs from "fs/promises"
import { Dirent } from "fs"
import { MetadataScanner } from "../MetadataScanner"
import { SimpleGit } from "simple-git"
import { ComponentMetadata, LocalizationOptions, LocalizedMetadata, PackageMetadata } from "../types"

// Mock fs/promises
jest.mock("fs/promises")

// Create mock Dirent objects
const createMockDirent = (name: string, isDir: boolean): Dirent => {
	return {
		name,
		isDirectory: () => isDir,
		isFile: () => !isDir,
		isBlockDevice: () => false,
		isCharacterDevice: () => false,
		isFIFO: () => false,
		isSocket: () => false,
		isSymbolicLink: () => false,
		// These are readonly in the real Dirent
		path: "",
		parentPath: "",
	} as Dirent
}

describe("MetadataScanner", () => {
	let metadataScanner: MetadataScanner
	const mockBasePath = "/test/repo"
	const mockRepoUrl = "https://example.com/repo"

	beforeEach(() => {
		// Reset all mocks
		jest.resetAllMocks()

		// Create mock git instance with default date
		const mockGit = {
			raw: jest.fn().mockResolvedValue("2025-04-13T09:00:00-07:00"),
			revparse: jest.fn().mockResolvedValue("main"),
		} as unknown as SimpleGit

		// Initialize MetadataScanner with mock git
		metadataScanner = new MetadataScanner(mockGit)

		// Mock fs.stat to handle repository validation and metadata files
		;(fs.stat as jest.Mock).mockImplementation((filePath: string) => {
			if (filePath.endsWith(".git")) {
				return Promise.resolve({
					isDirectory: () => true,
					isFile: () => false,
				})
			}
			if (filePath.endsWith("metadata.en.yml")) {
				return Promise.resolve({
					mtime: new Date("2025-04-13T09:00:00-07:00"),
					isFile: () => true,
					isDirectory: () => false,
				})
			}
			if (filePath.endsWith("README.md")) {
				return Promise.resolve({
					mtime: new Date(),
					isFile: () => true,
					isDirectory: () => false,
				})
			}
			return Promise.resolve({
				mtime: new Date(),
				isFile: () => false,
				isDirectory: () => true,
			})
		})
	})

	describe("Basic Metadata Scanning", () => {
		it("should discover components with English metadata", async () => {
			// Mock directory structure
			// Mock fs.readdir to simulate directory structure
			;(fs.readdir as jest.Mock).mockImplementation((dirPath: string) => {
				// Normalize path to use forward slashes
				const normalizedPath = dirPath.replace(/\\/g, "/")
				const relativePath = path.relative(mockBasePath, normalizedPath).replace(/\\/g, "/")
				const parts = relativePath.split("/")

				if (normalizedPath === mockBasePath) {
					return Promise.resolve([
						createMockDirent("component1", true),
						createMockDirent("README.md", false),
						createMockDirent(".git", true),
					])
				}
				if (normalizedPath.includes("component1")) {
					return Promise.resolve([createMockDirent("metadata.en.yml", false)])
				}
				return Promise.resolve([])
			})
			;(fs.readFile as jest.Mock).mockImplementation((path: any) => {
				const pathStr = path.toString()
				if (pathStr.includes("metadata.en.yml")) {
					return Promise.resolve(`
name: Test Component
description: A test component
type: mcp server
version: 1.0.0
`)
				}
				return Promise.resolve("")
			})

			const items = await metadataScanner.scanDirectory(mockBasePath, mockRepoUrl)

			expect(items).toHaveLength(1)
			expect(items[0].name).toBe("Test Component")
			expect(items[0].type).toBe("mcp server")
			expect(items[0].url).toBe("https://example.com/repo/tree/main/component1")
			expect(items[0].path).toBe("component1")
		})

		it("should skip components without English metadata", async () => {
			;(fs.readdir as jest.Mock).mockImplementation((path: any, options?: any) => {
				const pathStr = path.toString()
				if (pathStr === mockBasePath) {
					return Promise.resolve([
						createMockDirent("component1", true),
						createMockDirent("README.md", false),
						createMockDirent(".git", true),
					])
				}
				if (pathStr.includes("component1")) {
					return Promise.resolve([createMockDirent("metadata.fr.yml", false)])
				}
				return Promise.resolve([])
			})

			const items = await metadataScanner.scanDirectory(mockBasePath, mockRepoUrl)

			expect(items).toHaveLength(0)
		})

		it("should handle invalid metadata files", async () => {
			;(fs.readdir as jest.Mock).mockImplementation((path: any, options?: any) => {
				const pathStr = path.toString()
				if (pathStr === mockBasePath) {
					return Promise.resolve([
						createMockDirent("component1", true),
						createMockDirent("README.md", false),
						createMockDirent(".git", true),
					])
				}
				if (pathStr.includes("component1")) {
					return Promise.resolve([createMockDirent("metadata.en.yml", false)])
				}
				return Promise.resolve([])
			})
			;(fs.readFile as jest.Mock).mockImplementation((path: any) => {
				const pathStr = path.toString()
				if (pathStr.includes("metadata.en.yml")) {
					return Promise.resolve("invalid: yaml: content")
				}
				return Promise.resolve("")
			})

			const items = await metadataScanner.scanDirectory(mockBasePath, mockRepoUrl)

			expect(items).toHaveLength(0)
		})

		it("should include source name in items when provided", async () => {
			;(fs.readdir as jest.Mock).mockImplementation((path: any, options?: any) => {
				const pathStr = path.toString()
				if (pathStr === mockBasePath) {
					return Promise.resolve([
						createMockDirent("component1", true),
						createMockDirent("README.md", false),
						createMockDirent(".git", true),
					])
				}
				if (pathStr.includes("component1")) {
					return Promise.resolve([createMockDirent("metadata.en.yml", false)])
				}
				return Promise.resolve([])
			})
			;(fs.readFile as jest.Mock).mockImplementation((path: any) => {
				const pathStr = path.toString()
				if (pathStr.includes("metadata.en.yml")) {
					return Promise.resolve(`
name: Test Component
description: A test component
type: mcp server
version: 1.0.0
`)
				}
				return Promise.resolve("")
			})

			const items = await metadataScanner.scanDirectory(mockBasePath, mockRepoUrl, "Custom Source")

			expect(items).toHaveLength(1)
			expect(items[0].sourceName).toBe("Custom Source")
		})
	})

	describe("Directory Structure Handling", () => {
		let mockGit: SimpleGit

		beforeEach(() => {
			// Reset all mocks
			jest.clearAllMocks()

			// Create mock git instance with default date
			mockGit = {
				raw: jest.fn().mockImplementation((args: string[]) => {
					const path = args[args.length - 1]
					if (path.includes("file-analyzer")) {
						return Promise.resolve("2025-04-13T10:00:00-07:00")
					}
					if (path.includes("developer-mode")) {
						return Promise.resolve("2025-04-13T11:00:00-07:00")
					}
					return Promise.resolve("2025-04-13T09:00:00-07:00")
				}),
				revparse: jest.fn().mockResolvedValue("main"),
			} as unknown as SimpleGit

			// Initialize MetadataScanner with mock git
			metadataScanner = new MetadataScanner(mockGit)

			// Mock fs.stat to handle repository validation and metadata files
			;(fs.stat as jest.Mock).mockImplementation((filePath: string) => {
				if (filePath.endsWith(".git")) {
					return Promise.resolve({
						isDirectory: () => true,
						isFile: () => false,
					})
				}
				if (filePath.endsWith("metadata.en.yml")) {
					return Promise.resolve({
						mtime: new Date("2025-04-13T09:00:00-07:00"),
						isFile: () => true,
						isDirectory: () => false,
					})
				}
				if (filePath.endsWith("README.md")) {
					return Promise.resolve({
						mtime: new Date(),
						isFile: () => true,
						isDirectory: () => false,
					})
				}
				return Promise.resolve({
					mtime: new Date(),
					isFile: () => false,
					isDirectory: () => true,
				})
			})
		})

		it("should parse items from mcp-servers directory", async () => {
			const mockRepo = "/mock/repo"
			const mcpServersDir = path.join(mockRepo, "mcp servers")
			const fileAnalyzerDir = path.join(mcpServersDir, "file-analyzer")
			const metadataFile = path.join(fileAnalyzerDir, "metadata.en.yml")
			const readmeFile = path.join(mockRepo, "README.md")

			// Mock fs.stat to handle repository validation and metadata files
			;(fs.stat as jest.Mock).mockImplementation((filePath: string) => {
				const normalizedPath = filePath.replace(/\\/g, "/")
				if (normalizedPath === fileAnalyzerDir) {
					return Promise.resolve({
						mtime: new Date("2025-04-13T10:00:00-07:00"),
						isFile: () => false,
						isDirectory: () => true,
					})
				}
				return Promise.resolve({
					mtime: new Date(),
					isFile: () => false,
					isDirectory: () => true,
				})
			})

			// Mock directory structure using createMockDirent helper
			// Mock fs.readdir to simulate directory structure
			// Mock directory structure
			const mockDirs = new Map<string, Dirent[]>()
			mockDirs.set(mockRepo, [
				createMockDirent("mcp servers", true),
				createMockDirent("README.md", false),
				createMockDirent(".git", true),
			])
			mockDirs.set(mcpServersDir, [createMockDirent("file-analyzer", true)])
			mockDirs.set(fileAnalyzerDir, [createMockDirent("metadata.en.yml", false)])
			;(fs.readdir as jest.Mock).mockImplementation((dirPath: string) => {
				const normalizedPath = dirPath.replace(/\\/g, "/")
				return Promise.resolve(mockDirs.get(normalizedPath) || [])
			})

			// Mock fs.stat to handle repository validation and metadata files
			;(fs.stat as jest.Mock).mockImplementation((filePath: string) => {
				const normalizedPath = filePath.replace(/\\/g, "/")
				const relativePath = path.relative(mockRepo, normalizedPath).replace(/\\/g, "/")
				const parts = relativePath.split("/")

				if (parts[0] === "mcp servers" && parts[1] === "file-analyzer" && parts[2] === "metadata.en.yml") {
					return Promise.resolve({
						mtime: new Date("2025-04-13T10:00:00-07:00"),
						isFile: () => true,
						isDirectory: () => false,
					})
				}

				return Promise.resolve({
					mtime: new Date(),
					isFile: () => false,
					isDirectory: () => true,
				})
			})

			// Mock fs.stat to handle repository validation and metadata files
			;(fs.stat as jest.Mock).mockImplementation((filePath: string) => {
				const normalizedPath = filePath.replace(/\\/g, "/")
				const relativePath = path.relative(mockRepo, normalizedPath).replace(/\\/g, "/")
				const parts = relativePath.split("/")

				if (parts[0] === "mcp servers" && parts[1] === "file-analyzer" && parts[2] === "metadata.en.yml") {
					return Promise.resolve({
						mtime: new Date("2025-04-13T10:00:00-07:00"),
						isFile: () => true,
						isDirectory: () => false,
					})
				}

				return Promise.resolve({
					mtime: new Date(),
					isFile: () => false,
					isDirectory: () => true,
				})
			})

			// Mock metadata file content with proper YAML format
			;(fs.readFile as jest.Mock).mockImplementation((filePath: string) => {
				if (filePath === metadataFile) {
					return Promise.resolve(`---
name: "File Analyzer MCP Server"
description: "An MCP server that analyzes files"
type: "mcp server"
version: "1.0.0"
tags: []`)
				}
				if (filePath === readmeFile) {
					return Promise.resolve("# Test Repository")
				}
				return Promise.resolve("")
			})

			const items = await metadataScanner.scanDirectory(mockRepo, "https://github.com/example/repo")
			console.log("Items:", items)

			expect(items).toHaveLength(1)
			expect(items[0].name).toBe("File Analyzer MCP Server")
			expect(items[0].description).toBe("An MCP server that analyzes files")
			expect(items[0].type).toBe("mcp server")
			expect(items[0].version).toBe("1.0.0")
			expect(items[0].lastUpdated).toBe("2025-04-13T10:00:00-07:00")
			expect(items[0].url).toBe("https://github.com/example/repo/tree/main/mcp%20servers/file-analyzer")
			expect(items[0].path).toBe("mcp servers/file-analyzer")
		})
		it("should handle nested group directories without path duplication", async () => {
			const mockRepo = "/mock/repo"
			const groupsDir = path.join(mockRepo, "groups")
			const dataEngDir = path.join(groupsDir, "data-engineering")
			const modesDir = path.join(dataEngDir, "modes")
			const engineerModeDir = path.join(modesDir, "data-engineer-mode")
			const metadataFile = path.join(engineerModeDir, "metadata.en.yml")

			// Mock directory structure
			const mockDirs = new Map<string, Dirent[]>()
			mockDirs.set(mockRepo, [createMockDirent("groups", true)])
			mockDirs.set(groupsDir, [createMockDirent("data-engineering", true)])
			mockDirs.set(dataEngDir, [createMockDirent("modes", true)])
			mockDirs.set(modesDir, [createMockDirent("data-engineer-mode", true)])
			mockDirs.set(engineerModeDir, [createMockDirent("metadata.en.yml", false)])
			;(fs.readdir as jest.Mock).mockImplementation((dirPath: string) => {
				const normalizedPath = dirPath.replace(/\\/g, "/")
				return Promise.resolve(mockDirs.get(normalizedPath) || [])
			})

			// Mock metadata file content
			;(fs.readFile as jest.Mock).mockImplementation((filePath: string) => {
				if (filePath === metadataFile) {
					return Promise.resolve(`---
name: Data Engineer Mode
description: A mode for data engineering
type: mode
version: 1.0.0
`)
				}
				return Promise.resolve("")
			})

			const items = await metadataScanner.scanDirectory(mockRepo, "https://github.com/example/repo")

			expect(items).toHaveLength(1)
			expect(items[0].name).toBe("Data Engineer Mode")
			expect(items[0].type).toBe("mode")
			expect(normalizePath(items[0].path!)).toBe("groups/data-engineering/modes/data-engineer-mode")
			expect(items[0].url).toBe(
				"https://github.com/example/repo/tree/main/groups/data-engineering/modes/data-engineer-mode",
			)
		})

		it("should handle deeply nested directories", async () => {
			const mockRepo = "/mock/repo"
			const nestedPath = path.join(mockRepo, "mcp servers", "category", "subcategory", "deep-component")
			const metadataFile = path.join(nestedPath, "metadata.en.yml")

			// Mock fs.stat to handle repository validation and metadata files
			;(fs.stat as jest.Mock).mockImplementation((filePath: string) => {
				const normalizedPath = filePath.replace(/\\/g, "/")
				if (normalizedPath === nestedPath) {
					return Promise.resolve({
						mtime: new Date("2025-04-13T10:00:00-07:00"),
						isFile: () => false,
						isDirectory: () => true,
					})
				}
				return Promise.resolve({
					mtime: new Date(),
					isFile: () => false,
					isDirectory: () => true,
				})
			})

			// Mock directory structure
			const mockDirs = new Map<string, Dirent[]>()
			const mcpServersDir = path.join(mockRepo, "mcp servers")
			const categoryDir = path.join(mcpServersDir, "category")
			const subcategoryDir = path.join(categoryDir, "subcategory")
			const deepComponentDir = path.join(subcategoryDir, "deep-component")

			mockDirs.set(mockRepo, [createMockDirent("mcp servers", true)])
			mockDirs.set(mcpServersDir, [createMockDirent("category", true)])
			mockDirs.set(categoryDir, [createMockDirent("subcategory", true)])
			mockDirs.set(subcategoryDir, [createMockDirent("deep-component", true)])
			mockDirs.set(deepComponentDir, [createMockDirent("metadata.en.yml", false)])
			;(fs.readdir as jest.Mock).mockImplementation((dirPath: string) => {
				const normalizedPath = dirPath.replace(/\\/g, "/")
				return Promise.resolve(mockDirs.get(normalizedPath) || [])
			})

			// Mock fs.stat to handle repository validation and metadata files
			;(fs.stat as jest.Mock).mockImplementation((filePath: string) => {
				const normalizedPath = filePath.replace(/\\/g, "/")
				const relativePath = path.relative(mockRepo, normalizedPath).replace(/\\/g, "/")
				const parts = relativePath.split("/")

				if (
					parts[0] === "mcp servers" &&
					parts[1] === "category" &&
					parts[2] === "subcategory" &&
					parts[3] === "deep-component" &&
					parts[4] === "metadata.en.yml"
				) {
					return Promise.resolve({
						mtime: new Date("2025-04-13T10:00:00-07:00"),
						isFile: () => true,
						isDirectory: () => false,
					})
				}

				return Promise.resolve({
					mtime: new Date(),
					isFile: () => false,
					isDirectory: () => true,
				})
			})

			// Mock metadata file content
			;(fs.readFile as jest.Mock).mockImplementation((filePath: string) => {
				const relativePath = path.relative(mockRepo, filePath)
				if (
					relativePath ===
					path.join("mcp servers", "category", "subcategory", "deep-component", "metadata.en.yml")
				) {
					return Promise.resolve(`---
name: Deep Component
description: A deeply nested component
type: mcp server
version: 1.0.0
`)
				}
				return Promise.resolve("")
			})

			const items = await metadataScanner.scanDirectory(mockRepo, "https://github.com/example/repo")

			expect(items).toHaveLength(1)
			expect(items[0].name).toBe("Deep Component")
			expect(items[0].type).toBe("mcp server")
			expect(items[0].url).toBe(
				"https://github.com/example/repo/tree/main/mcp%20servers/category/subcategory/deep-component",
			)
			expect(items[0].path).toBe("mcp servers/category/subcategory/deep-component")
		})

		it("should parse items from modes directory", async () => {
			const mockRepo = "/mock/repo"
			const modesDir = path.join(mockRepo, "modes")
			const developerModeDir = path.join(modesDir, "developer-mode")
			const metadataFile = path.join(developerModeDir, "metadata.en.yml")
			const readmeFile = path.join(mockRepo, "README.md")

			// Mock directory structure using createMockDirent helper
			;(fs.readdir as jest.Mock).mockImplementation((dirPath: string) => {
				if (dirPath === mockRepo) {
					return Promise.resolve([
						createMockDirent("modes", true),
						createMockDirent("README.md", false),
						createMockDirent(".git", true),
					])
				}
				if (dirPath === modesDir) {
					return Promise.resolve([createMockDirent("developer-mode", true)])
				}
				if (dirPath === developerModeDir) {
					return Promise.resolve([createMockDirent("metadata.en.yml", false)])
				}
				return Promise.resolve([])
			})

			// Mock metadata file content with proper YAML format
			;(fs.readFile as jest.Mock).mockImplementation((filePath: string) => {
				if (filePath === metadataFile) {
					return Promise.resolve(`---
name: Full-Stack Developer Mode
description: A mode for full-stack development
type: mode
version: 1.0.0
`)
				}
				if (filePath === readmeFile) {
					return Promise.resolve("# Test Repository")
				}
				return Promise.resolve("")
			})

			const items = await metadataScanner.scanDirectory(mockRepo, "https://github.com/example/repo")

			expect(items).toHaveLength(1)
			expect(items[0].name).toBe("Full-Stack Developer Mode")
			expect(items[0].description).toBe("A mode for full-stack development")
			expect(items[0].type).toBe("mode")
			expect(items[0].version).toBe("1.0.0")
			expect(items[0].lastUpdated).toBe("2025-04-13T11:00:00-07:00")
		})

		it("should parse items from multiple directories", async () => {
			const mockRepo = "/mock/repo"
			const mcpServersDir = path.join(mockRepo, "mcp servers")
			const modesDir = path.join(mockRepo, "modes")
			const fileAnalyzerDir = path.join(mcpServersDir, "file-analyzer")
			const developerModeDir = path.join(modesDir, "developer-mode")
			const fileAnalyzerMetadata = path.join(fileAnalyzerDir, "metadata.en.yml")
			const developerModeMetadata = path.join(developerModeDir, "metadata.en.yml")
			const readmeFile = path.join(mockRepo, "README.md")

			// Mock directory structure using createMockDirent helper
			;(fs.readdir as jest.Mock).mockImplementation((dirPath: string) => {
				if (dirPath === mockRepo) {
					return Promise.resolve([
						createMockDirent("mcp servers", true),
						createMockDirent("modes", true),
						createMockDirent("README.md", false),
						createMockDirent(".git", true),
					])
				}
				if (dirPath === mcpServersDir) {
					return Promise.resolve([createMockDirent("file-analyzer", true)])
				}
				if (dirPath === modesDir) {
					return Promise.resolve([createMockDirent("developer-mode", true)])
				}
				if (dirPath === fileAnalyzerDir || dirPath === developerModeDir) {
					return Promise.resolve([createMockDirent("metadata.en.yml", false)])
				}
				return Promise.resolve([])
			})

			// Mock metadata file content with proper YAML format
			;(fs.readFile as jest.Mock).mockImplementation((filePath: string) => {
				if (filePath === fileAnalyzerMetadata) {
					return Promise.resolve(`---
name: File Analyzer MCP Server
description: An MCP server that analyzes files
type: mcp server
version: 1.0.0
`)
				}
				if (filePath === developerModeMetadata) {
					return Promise.resolve(`---
name: Full-Stack Developer Mode
description: A mode for full-stack development
type: mode
version: 1.0.0
`)
				}
				if (filePath === readmeFile) {
					return Promise.resolve("# Test Repository")
				}
				return Promise.resolve("")
			})

			const items = await metadataScanner.scanDirectory(mockRepo, "https://github.com/example/repo")

			expect(items).toHaveLength(2)

			// Check for MCP server item
			const mcpServerItem = items.find((item) => item.type === "mcp server")
			expect(mcpServerItem).toBeDefined()
			expect(mcpServerItem?.name).toBe("File Analyzer MCP Server")
			expect(mcpServerItem?.description).toBe("An MCP server that analyzes files")
			expect(mcpServerItem?.version).toBe("1.0.0")
			expect(mcpServerItem?.lastUpdated).toBe("2025-04-13T10:00:00-07:00")

			// Check for mode item
			const modeItem = items.find((item) => item.type === "mode")
			expect(modeItem).toBeDefined()
			expect(modeItem?.name).toBe("Full-Stack Developer Mode")
			expect(modeItem?.description).toBe("A mode for full-stack development")
			expect(modeItem?.version).toBe("1.0.0")
			expect(modeItem?.lastUpdated).toBe("2025-04-13T11:00:00-07:00")
		})
	})

	describe("Package Scanning", () => {
		it("should not scan inside package directories", async () => {
			// Mock directory structure:
			// /test/repo/
			//   package1/
			//     metadata.en.yml (package)
			//     item1/
			//       metadata.en.yml
			//     item2/
			//       metadata.en.yml
			//   package2/
			//     metadata.en.yml (package)
			//     item3/
			//       metadata.en.yml

			// Mock root directory listing
			const mockRootEntries = [createMockDirent("package1", true), createMockDirent("package2", true)]

			;(fs.readdir as jest.Mock).mockImplementation((dir: string) => {
				if (dir === mockBasePath) {
					return mockRootEntries
				}
				if (dir === path.join(mockBasePath, "package1")) {
					return [
						createMockDirent("metadata.en.yml", false),
						createMockDirent("item1", true),
						createMockDirent("item2", true),
					]
				}
				if (dir === path.join(mockBasePath, "package2")) {
					return [createMockDirent("metadata.en.yml", false), createMockDirent("item3", true)]
				}
				return []
			})

			// Mock metadata file reads
			;(fs.readFile as jest.Mock).mockImplementation((filePath: string) => {
				if (filePath.includes("package1/metadata.en.yml")) {
					return JSON.stringify({
						name: "Package 1",
						description: "Test Package 1",
						version: "1.0.0",
						type: "package",
						items: [
							{ type: "mode", path: "item1" },
							{ type: "prompt", path: "item2" },
						],
					})
				}
				if (filePath.includes("package2/metadata.en.yml")) {
					return JSON.stringify({
						name: "Package 2",
						description: "Test Package 2",
						version: "1.0.0",
						type: "package",
						items: [{ type: "mode", path: "item3" }],
					})
				}
				return "{}"
			})

			// Mock file stats
			;(fs.stat as jest.Mock).mockResolvedValue({
				mtime: new Date(),
				isFile: () => true,
			})

			const items = await metadataScanner.scanDirectory(mockBasePath, mockRepoUrl)

			// Should only return the two packages, not their nested items
			expect(items).toHaveLength(2)
			expect(items[0].name).toBe("Package 1")
			expect(items[1].name).toBe("Package 2")

			// Verify we didn't try to read metadata from nested items
			const readFileCalls = (fs.readFile as jest.Mock).mock.calls.map((call) => call[0])
			expect(readFileCalls).not.toContain(expect.stringContaining("item1/metadata.en.yml"))
			expect(readFileCalls).not.toContain(expect.stringContaining("item2/metadata.en.yml"))
			expect(readFileCalls).not.toContain(expect.stringContaining("item3/metadata.en.yml"))
		})

		it("should handle nested packages correctly", async () => {
			// Mock directory structure:
			// /test/repo/
			//   outer-package/
			//     metadata.en.yml (package)
			//     inner-package/
			//       metadata.en.yml (package)

			// Mock directory listings
			const mockRootEntries = [createMockDirent("outer-package", true)]
			;(fs.readdir as jest.Mock).mockImplementation((dir: string) => {
				if (dir === mockBasePath) {
					return mockRootEntries
				}
				if (dir === path.join(mockBasePath, "outer-package")) {
					return [createMockDirent("metadata.en.yml", false), createMockDirent("inner-package", true)]
				}
				return []
			})

			// Mock metadata file reads
			;(fs.readFile as jest.Mock).mockImplementation((filePath: string) => {
				if (filePath.includes("outer-package/metadata.en.yml")) {
					return JSON.stringify({
						name: "Outer Package",
						description: "Test Outer Package",
						version: "1.0.0",
						type: "package",
						items: [{ type: "package", path: "inner-package" }],
					})
				}
				return "{}"
			})

			// Mock file stats
			;(fs.stat as jest.Mock).mockResolvedValue({
				mtime: new Date(),
				isFile: () => true,
			})

			const items = await metadataScanner.scanDirectory(mockBasePath, mockRepoUrl)

			// Should only return the outer package
			expect(items).toHaveLength(1)
			expect(items[0].name).toBe("Outer Package")

			// Verify we didn't try to read inner package metadata
			const readFileCalls = (fs.readFile as jest.Mock).mock.calls.map((call) => call[0])
			expect(readFileCalls).not.toContain(expect.stringContaining("inner-package/metadata.en.yml"))
		})

		it("should handle mixed package and non-package directories", async () => {
			// Mock directory structure:
			// /test/repo/
			//   package1/
			//     metadata.en.yml (package)
			//   mode1/
			//     metadata.en.yml (mode)
			//     submode/
			//       metadata.en.yml (mode)

			// Mock directory listings
			const mockRootEntries = [createMockDirent("package1", true), createMockDirent("mode1", true)]
			;(fs.readdir as jest.Mock).mockImplementation((dir: string) => {
				if (dir === mockBasePath) {
					return mockRootEntries
				}
				if (dir === path.join(mockBasePath, "package1")) {
					return [createMockDirent("metadata.en.yml", false)]
				}
				if (dir === path.join(mockBasePath, "mode1")) {
					return [createMockDirent("metadata.en.yml", false), createMockDirent("submode", true)]
				}
				if (dir === path.join(mockBasePath, "mode1/submode")) {
					return [createMockDirent("metadata.en.yml", false)]
				}
				return []
			})

			// Mock metadata file reads
			;(fs.readFile as jest.Mock).mockImplementation((filePath: string) => {
				if (filePath.includes("package1/metadata.en.yml")) {
					return JSON.stringify({
						name: "Package 1",
						description: "Test Package",
						version: "1.0.0",
						type: "package",
					})
				}
				if (filePath.includes("mode1/metadata.en.yml")) {
					return JSON.stringify({
						name: "Mode 1",
						description: "Test Mode",
						version: "1.0.0",
						type: "mode",
					})
				}
				if (filePath.includes("submode/metadata.en.yml")) {
					return JSON.stringify({
						name: "Submode",
						description: "Test Submode",
						version: "1.0.0",
						type: "mode",
					})
				}
				return "{}"
			})

			// Mock file stats
			;(fs.stat as jest.Mock).mockResolvedValue({
				mtime: new Date(),
				isFile: () => true,
			})

			const items = await metadataScanner.scanDirectory(mockBasePath, mockRepoUrl)

			// Should return package and both modes
			expect(items).toHaveLength(3)

			// Verify items are returned in correct order
			const types = items.map((item) => item.type)
			expect(types).toContain("package")
			expect(types).toContain("mode")

			// Verify we recursed into mode directory but not package
			const readFileCalls = (fs.readFile as jest.Mock).mock.calls.map((call) => call[0])
			expect(readFileCalls).toContainEqual(expect.stringContaining("mode1/submode/metadata.en.yml"))
		})
	})

	describe("Package Subcomponents", () => {
		let subcomponentsScanner: MetadataScanner
		const mockGit = {
			raw: jest.fn(),
		} as unknown as SimpleGit & { raw: jest.Mock }

		beforeEach(() => {
			subcomponentsScanner = new MetadataScanner(mockGit)
			jest.clearAllMocks()
		})

		describe("scanDirectory with packages", () => {
			it("should load subcomponents listed in metadata.yml", async () => {
				// Mock directory structure
				;(fs.readdir as jest.Mock).mockImplementation((path: any) => {
					const pathStr = path.toString()
					if (pathStr === "/test/repo") {
						return Promise.resolve([
							{
								name: "test-package",
								isDirectory: () => true,
								isFile: () => false,
							} as Dirent,
						])
					}
					if (pathStr === "/test/repo/test-package") {
						return Promise.resolve([
							{
								name: "metadata.en.yml",
								isDirectory: () => false,
								isFile: () => true,
							} as Dirent,
							{
								name: "subcomponent1",
								isDirectory: () => true,
								isFile: () => false,
							} as Dirent,
						])
					}
					if (pathStr === "/test/repo/test-package/subcomponent1") {
						return Promise.resolve([
							{
								name: "metadata.en.yml",
								isDirectory: () => false,
								isFile: () => true,
							} as Dirent,
						])
					}
					return Promise.resolve([])
				})

				// Mock file contents
				;(fs.readFile as jest.Mock).mockImplementation((path: any) => {
					const pathStr = path.toString()
					if (pathStr === "/test/repo/test-package/metadata.en.yml") {
						return Promise.resolve(
							JSON.stringify({
								name: "Test Package",
								description: "A test package",
								type: "package",
								version: "1.0.0",
								items: [
									{
										type: "mode",
										path: "subcomponent1",
									},
								],
							}),
						)
					}
					if (pathStr === "/test/repo/test-package/subcomponent1/metadata.en.yml") {
						return Promise.resolve(`
name: Test Mode
description: A test mode
type: mode
version: 1.0.0
`)
					}
					return Promise.resolve("")
				})

				// Mock git dates
				mockGit.raw.mockImplementation((...args: any[]) => {
					const path = args[0][args[0].length - 1]
					if (path.includes("/test/repo/test-package/subcomponent1")) {
						return Promise.resolve("2025-04-13T09:00:00-07:00")
					}
					if (path.includes("/test/repo/test-package")) {
						return Promise.resolve("2025-04-13T10:00:00-07:00")
					}
					return Promise.resolve("")
				})

				const items = await subcomponentsScanner.scanDirectory("/test/repo", "https://example.com")

				expect(items).toHaveLength(1)
				expect(items[0].type).toBe("package")
				expect(items[0].items).toHaveLength(1)
				expect(items[0].items![0]).toMatchObject({
					type: "mode",
					path: "subcomponent1",
					metadata: {
						name: "Test Mode",
						description: "A test mode",
						type: "mode",
						version: "1.0.0",
					},
					lastUpdated: "2025-04-13T09:00:00-07:00",
				})
				expect(items[0].url).toBe("https://example.com/tree/main/test-package")
				expect(items[0].path).toBe("test-package")
				expect(items[0].items![0].path).toBe("subcomponent1")
			})

			it("should load subcomponents from directory structure", async () => {
				// Mock directory structure
				;(fs.readdir as jest.Mock).mockImplementation((path: any) => {
					const pathStr = path.toString()
					if (pathStr === "/test/repo") {
						return Promise.resolve([
							{
								name: "test-package",
								isDirectory: () => true,
								isFile: () => false,
							} as Dirent,
						])
					}
					if (pathStr === "/test/repo/test-package") {
						return Promise.resolve([
							{
								name: "metadata.en.yml",
								isDirectory: () => false,
								isFile: () => true,
							} as Dirent,
							{
								name: "modes",
								isDirectory: () => true,
								isFile: () => false,
							} as Dirent,
						])
					}
					if (pathStr === "/test/repo/test-package/modes") {
						return Promise.resolve([
							{
								name: "test-mode",
								isDirectory: () => true,
								isFile: () => false,
							} as Dirent,
						])
					}
					if (pathStr === "/test/repo/test-package/modes/test-mode") {
						return Promise.resolve([
							{
								name: "metadata.en.yml",
								isDirectory: () => false,
								isFile: () => true,
							} as Dirent,
						])
					}
					return Promise.resolve([])
				})

				// Mock file contents
				;(fs.readFile as jest.Mock).mockImplementation((path: any) => {
					const pathStr = path.toString()
					if (pathStr === "/test/repo/test-package/metadata.en.yml") {
						return Promise.resolve(`
name: Test Package
description: A test package
type: package
version: 1.0.0
`)
					}
					if (pathStr === "/test/repo/test-package/modes/test-mode/metadata.en.yml") {
						return Promise.resolve(`
name: Directory Mode
description: A mode from directory
type: mode
version: 1.0.0
`)
					}
					return Promise.resolve("")
				})

				// Mock git dates
				mockGit.raw.mockImplementation((...args: any[]) => {
					const path = args[0][args[0].length - 1]
					if (path.includes("/test/repo/test-package/modes/test-mode")) {
						return Promise.resolve("2025-04-13T09:00:00-07:00")
					}
					if (path.includes("/test/repo/test-package")) {
						return Promise.resolve("2025-04-13T10:00:00-07:00")
					}
					return Promise.resolve("")
				})

				const items = await subcomponentsScanner.scanDirectory("/test/repo", "https://example.com")

				expect(items).toHaveLength(1)
				expect(items[0].type).toBe("package")
				expect(items[0].items).toHaveLength(1)
				expect(items[0].items![0]).toMatchObject({
					type: "mode",
					path: "modes/test-mode",
					metadata: {
						name: "Directory Mode",
						description: "A mode from directory",
						type: "mode",
						version: "1.0.0",
					},
					lastUpdated: "2025-04-13T09:00:00-07:00",
				})
			})

			it("should combine subcomponents from metadata and directory", async () => {
				// Mock directory structure
				;(fs.readdir as jest.Mock).mockImplementation((path: any) => {
					const pathStr = path.toString()
					if (pathStr === "/test/repo") {
						return Promise.resolve([
							{
								name: "test-package",
								isDirectory: () => true,
								isFile: () => false,
							} as Dirent,
						])
					}
					if (pathStr === "/test/repo/test-package") {
						return Promise.resolve([
							{
								name: "metadata.en.yml",
								isDirectory: () => false,
								isFile: () => true,
							} as Dirent,
							{
								name: "listed-mode",
								isDirectory: () => true,
								isFile: () => false,
							} as Dirent,
							{
								name: "unlisted-mode",
								isDirectory: () => true,
								isFile: () => false,
							} as Dirent,
						])
					}
					if (pathStr.includes("listed-mode") || pathStr.includes("unlisted-mode")) {
						return Promise.resolve([
							{
								name: "metadata.en.yml",
								isDirectory: () => false,
								isFile: () => true,
							} as Dirent,
						])
					}
					return Promise.resolve([])
				})

				// Mock file contents
				;(fs.readFile as jest.Mock).mockImplementation((path: any) => {
					const pathStr = path.toString()
					if (pathStr === "/test/repo/test-package/metadata.en.yml") {
						return Promise.resolve(
							JSON.stringify({
								name: "Test Package",
								description: "A test package",
								type: "package",
								version: "1.0.0",
								items: [
									{
										type: "mode",
										path: "listed-mode",
									},
								],
							}),
						)
					}
					if (pathStr === "/test/repo/test-package/listed-mode/metadata.en.yml") {
						return Promise.resolve(`
name: Listed Mode
description: A mode listed in metadata
type: mode
version: 1.0.0
`)
					}
					if (pathStr === "/test/repo/test-package/unlisted-mode/metadata.en.yml") {
						return Promise.resolve(`
name: Unlisted Mode
description: A mode from directory only
type: mode
version: 1.0.0
`)
					}
					return Promise.resolve("")
				})

				// Mock git dates
				mockGit.raw.mockImplementation((...args: any[]) => {
					const path = args[0][args[0].length - 1]
					if (path === "/test/repo/test-package/unlisted-mode") {
						return Promise.resolve("2025-04-13T08:00:00-07:00")
					}
					if (path === "/test/repo/test-package/listed-mode") {
						return Promise.resolve("2025-04-13T09:00:00-07:00")
					}
					return Promise.resolve("2025-04-13T10:00:00-07:00")
				})

				const items = await subcomponentsScanner.scanDirectory("/test/repo", "https://example.com")

				expect(items).toHaveLength(1)
				expect(items[0].type).toBe("package")
				expect(items[0].items).toHaveLength(2)

				// Should include both listed and unlisted modes
				const listedMode = items[0].items!.find((item) => item.metadata?.name === "Listed Mode")
				const unlistedMode = items[0].items!.find((item) => item.metadata?.name === "Unlisted Mode")

				expect(listedMode).toBeDefined()
				expect(unlistedMode).toBeDefined()

				expect(listedMode).toMatchObject({
					type: "mode",
					path: "listed-mode",
					metadata: {
						name: "Listed Mode",
						description: "A mode listed in metadata",
						type: "mode",
						version: "1.0.0",
					},
					lastUpdated: "2025-04-13T09:00:00-07:00",
				})

				expect(unlistedMode).toMatchObject({
					type: "mode",
					path: "unlisted-mode",
					metadata: {
						name: "Unlisted Mode",
						description: "A mode from directory only",
						type: "mode",
						version: "1.0.0",
					},
					lastUpdated: "2025-04-13T08:00:00-07:00",
				})
			})
		})
	})

	describe("Localization", () => {
		let localizedMetadataScanner: MetadataScanner

		beforeEach(() => {
			// Initialize with French locale
			const localizationOptions: LocalizationOptions = {
				userLocale: "fr",
				fallbackLocale: "en",
			}
			localizedMetadataScanner = new MetadataScanner(undefined, localizationOptions)
		})

		it("should use user locale when available", () => {
			// Create mock metadata with both user locale and English
			const metadata: LocalizedMetadata<ComponentMetadata> = {
				en: {
					name: "English Name",
					description: "English Description",
					version: "1.0.0",
					type: "mode",
				},
				fr: {
					name: "Nom Français",
					description: "Description Française",
					version: "1.0.0",
					type: "mode",
				},
			}

			// Call getLocalizedMetadata
			const result = (localizedMetadataScanner as any).getLocalizedMetadata(metadata)

			// Expect French metadata to be used
			expect(result).toBeDefined()
			expect(result.name).toBe("Nom Français")
			expect(result.description).toBe("Description Française")
		})

		it("should fall back to English when user locale not available", () => {
			// Create mock metadata with only English
			const metadata: LocalizedMetadata<ComponentMetadata> = {
				en: {
					name: "English Name",
					description: "English Description",
					version: "1.0.0",
					type: "mode",
				},
			}

			// Call getLocalizedMetadata
			const result = (localizedMetadataScanner as any).getLocalizedMetadata(metadata)

			// Expect English metadata to be used as fallback
			expect(result).toBeDefined()
			expect(result.name).toBe("English Name")
			expect(result.description).toBe("English Description")
		})

		it("should return null when neither user locale nor fallback locale is available", () => {
			// Create mock metadata with neither user locale nor English
			const metadata: LocalizedMetadata<ComponentMetadata> = {
				de: {
					name: "Deutscher Name",
					description: "Deutsche Beschreibung",
					version: "1.0.0",
					type: "mode",
				},
			}

			// Call getLocalizedMetadata
			const result = (localizedMetadataScanner as any).getLocalizedMetadata(metadata)

			// Expect null result
			expect(result).toBeNull()
		})
	})
	describe("Git Date Tracking", () => {
		let mockGit: jest.Mocked<SimpleGit>

		beforeEach(() => {
			// Setup git mock
			mockGit = {
				raw: jest.fn(),
			} as unknown as jest.Mocked<SimpleGit>

			// Create new MetadataScanner instance with mock git
			metadataScanner = new MetadataScanner(mockGit)

			// Mock directory structure
			;(fs.readdir as jest.Mock).mockImplementation((path: any, options?: any) => {
				if (path === "/test/repo") {
					return Promise.resolve([createMockDirent("component1", true)])
				}
				if (path === "/test/repo/component1") {
					return Promise.resolve([createMockDirent("metadata.en.yml", false)])
				}
				return Promise.resolve([])
			})

			// Mock file contents with proper YAML format
			;(fs.readFile as jest.Mock).mockImplementation((path: any) => {
				if (path.includes("metadata.en.yml")) {
					return Promise.resolve(`---
name: Test Component
description: A test component
type: mcp server
version: 1.0.0
`)
				}
				return Promise.resolve("")
			})
		})

		it("should use git log date when available", async () => {
			const mockDate = "2025-04-12T22:08:02-07:00"
			mockGit.raw.mockResolvedValue(mockDate)

			const items = await metadataScanner.scanDirectory("/test/repo", "https://example.com")

			expect(items).toHaveLength(1)
			expect(items[0].lastUpdated).toBe(mockDate)
			expect(mockGit.raw).toHaveBeenCalledWith([
				"log",
				"-1",
				"--format=%aI",
				"--",
				expect.stringContaining("component1"),
			])
		})

		it("should fall back to fs.stat when git log fails", async () => {
			const mockDate = new Date()
			mockGit.raw.mockRejectedValue(new Error("Git error"))

			// Mock directory structure (reuse from parent beforeEach)
			;(fs.readdir as jest.Mock).mockImplementation((path: any, options?: any) => {
				if (path === "/test/repo") {
					return Promise.resolve([createMockDirent("component1", true)])
				}
				if (path === "/test/repo/component1") {
					return Promise.resolve([createMockDirent("metadata.en.yml", false)])
				}
				return Promise.resolve([])
			})

			// Mock file contents (reuse from parent beforeEach)
			;(fs.readFile as jest.Mock).mockImplementation((path: any) => {
				if (path.includes("metadata.en.yml")) {
					return Promise.resolve(`---
name: Test Component
description: A test component
type: mcp server
version: 1.0.0
`)
				}
				return Promise.resolve("")
			})

			// Mock fs.stat to return a specific date
			;(fs.stat as jest.Mock).mockResolvedValue({
				mtime: mockDate,
				isFile: () => false,
				isDirectory: () => true,
			})

			const items = await metadataScanner.scanDirectory("/test/repo", "https://example.com")

			expect(items).toHaveLength(1)
			expect(items[0].lastUpdated).toBe(mockDate.toISOString())
			expect(mockGit.raw).toHaveBeenCalled()
			expect(fs.stat).toHaveBeenCalled()
		})

		it("should fall back to current date when both git and fs.stat fail", async () => {
			// Mock directory structure (reuse from parent beforeEach)
			;(fs.readdir as jest.Mock).mockImplementation((path: any, options?: any) => {
				if (path === "/test/repo") {
					return Promise.resolve([createMockDirent("component1", true)])
				}
				if (path === "/test/repo/component1") {
					return Promise.resolve([createMockDirent("metadata.en.yml", false)])
				}
				return Promise.resolve([])
			})

			// Mock file contents (reuse from parent beforeEach)
			;(fs.readFile as jest.Mock).mockImplementation((path: any) => {
				if (path.includes("metadata.en.yml")) {
					return Promise.resolve(`---
name: Test Component
description: A test component
type: mcp server
version: 1.0.0
`)
				}
				return Promise.resolve("")
			})

			const beforeTest = new Date()
			mockGit.raw.mockRejectedValue(new Error("Git error"))
			;(fs.stat as jest.Mock).mockRejectedValue(new Error("Stat error"))

			const items = await metadataScanner.scanDirectory("/test/repo", "https://example.com")
			const afterTest = new Date()

			expect(items).toHaveLength(1)
			expect(items[0].lastUpdated).toBeDefined()
			const lastUpdated = new Date(items[0].lastUpdated!)
			expect(lastUpdated.getTime()).toBeGreaterThanOrEqual(beforeTest.getTime())
			expect(lastUpdated.getTime()).toBeLessThanOrEqual(afterTest.getTime())
		})
	})
})

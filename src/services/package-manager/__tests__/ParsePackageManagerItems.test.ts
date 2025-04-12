import * as fs from "fs/promises"
import { MetadataScanner } from "../MetadataScanner"
import { PackageManagerItem } from "../types"
import { Dirent } from "fs"

// Mock fs/promises
jest.mock("fs/promises", () => ({
	readdir: jest.fn(),
	readFile: jest.fn(),
	stat: jest.fn(),
}))

describe("Parse Package Manager Items", () => {
	let metadataScanner: MetadataScanner
	const mockFs = fs as jest.Mocked<typeof fs>

	beforeEach(() => {
		metadataScanner = new MetadataScanner()
		jest.clearAllMocks()

		// Mock stat to always succeed
		mockFs.stat.mockResolvedValue({} as any)
	})

	describe("directory structure handling", () => {
		it("should parse items from mcp-servers directory", async () => {
			// Mock directory structure
			mockFs.readdir.mockImplementation((path: any, options?: any) => {
				const pathStr = path.toString()
				if (pathStr === "/mock/repo") {
					return Promise.resolve([
						{
							name: "mcp servers",
							isDirectory: () => true,
							isFile: () => false,
						} as Dirent,
					])
				}
				if (pathStr.includes("mcp servers")) {
					return Promise.resolve([
						{
							name: "file-analyzer",
							isDirectory: () => true,
							isFile: () => false,
						} as Dirent,
					])
				}
				if (pathStr.includes("file-analyzer")) {
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

			// Mock metadata file content
			mockFs.readFile.mockImplementation((path: any) => {
				const pathStr = path.toString()
				if (pathStr.includes("metadata.en.yml")) {
					return Promise.resolve(`
name: File Analyzer MCP Server
description: An MCP server that analyzes files
type: mcp server
version: 1.0.0
`)
				}
				return Promise.resolve("")
			})

			const items = await metadataScanner.scanDirectory("/mock/repo", "https://github.com/example/repo")

			expect(items).toHaveLength(1)
			expect(items[0].name).toBe("File Analyzer MCP Server")
			expect(items[0].type).toBe("mcp server")
		})

		it("should parse items from modes directory", async () => {
			// Mock directory structure
			mockFs.readdir.mockImplementation((path: any, options?: any) => {
				const pathStr = path.toString()
				if (pathStr === "/mock/repo") {
					return Promise.resolve([
						{
							name: "modes",
							isDirectory: () => true,
							isFile: () => false,
						} as Dirent,
					])
				}
				if (pathStr.includes("modes")) {
					return Promise.resolve([
						{
							name: "developer-mode",
							isDirectory: () => true,
							isFile: () => false,
						} as Dirent,
					])
				}
				if (pathStr.includes("developer-mode")) {
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

			// Mock metadata file content
			mockFs.readFile.mockImplementation((path: any) => {
				const pathStr = path.toString()
				if (pathStr.includes("metadata.en.yml")) {
					return Promise.resolve(`
name: Full-Stack Developer Mode
description: A mode for full-stack development
type: mode
version: 1.0.0
`)
				}
				return Promise.resolve("")
			})

			const items = await metadataScanner.scanDirectory("/mock/repo", "https://github.com/example/repo")

			expect(items).toHaveLength(1)
			expect(items[0].name).toBe("Full-Stack Developer Mode")
			expect(items[0].type).toBe("mode")
		})

		it("should parse items from multiple directories", async () => {
			// Mock directory structure
			mockFs.readdir.mockImplementation((path: any, options?: any) => {
				const pathStr = path.toString()
				if (pathStr === "/mock/repo") {
					return Promise.resolve([
						{
							name: "mcp servers",
							isDirectory: () => true,
							isFile: () => false,
						} as Dirent,
						{
							name: "modes",
							isDirectory: () => true,
							isFile: () => false,
						} as Dirent,
					])
				}
				if (pathStr.includes("mcp servers")) {
					return Promise.resolve([
						{
							name: "file-analyzer",
							isDirectory: () => true,
							isFile: () => false,
						} as Dirent,
					])
				}
				if (pathStr.includes("modes")) {
					return Promise.resolve([
						{
							name: "developer-mode",
							isDirectory: () => true,
							isFile: () => false,
						} as Dirent,
					])
				}
				if (pathStr.includes("file-analyzer") || pathStr.includes("developer-mode")) {
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

			// Mock metadata file content
			mockFs.readFile.mockImplementation((path: any) => {
				const pathStr = path.toString()
				if (pathStr.includes("file-analyzer")) {
					return Promise.resolve(`
name: File Analyzer MCP Server
description: An MCP server that analyzes files
type: mcp server
version: 1.0.0
`)
				}
				if (pathStr.includes("developer-mode")) {
					return Promise.resolve(`
name: Full-Stack Developer Mode
description: A mode for full-stack development
type: mode
version: 1.0.0
`)
				}
				return Promise.resolve("")
			})

			const items = await metadataScanner.scanDirectory("/mock/repo", "https://github.com/example/repo")

			expect(items).toHaveLength(2)

			// Check for MCP server item
			const mcpServerItem = items.find((item: PackageManagerItem) => item.type === "mcp server")
			expect(mcpServerItem).toBeDefined()
			expect(mcpServerItem?.name).toBe("File Analyzer MCP Server")

			// Check for mode item
			const modeItem = items.find((item: PackageManagerItem) => item.type === "mode")
			expect(modeItem).toBeDefined()
			expect(modeItem?.name).toBe("Full-Stack Developer Mode")
		})
	})
})

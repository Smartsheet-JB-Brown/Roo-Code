import * as path from "path"
import * as fs from "fs/promises"
import { Dirent } from "fs"
import { MetadataScanner } from "../MetadataScanner"
import { ComponentMetadata, PackageMetadata } from "../types"

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

describe("Package Scanning Tests", () => {
	let metadataScanner: MetadataScanner
	const mockBasePath = "/test/repo"
	const mockRepoUrl = "https://example.com/repo"

	beforeEach(() => {
		metadataScanner = new MetadataScanner()
		jest.resetAllMocks()
	})

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

import * as fs from "fs/promises"
import { MetadataScanner } from "../MetadataScanner"
import { Dirent } from "fs"
import { SimpleGit } from "simple-git"

// Mock fs/promises
jest.mock("fs/promises", () => ({
	readdir: jest.fn(),
	readFile: jest.fn(),
}))

// Mock only what we need from SimpleGit
const mockGit = {
	raw: jest.fn(),
} as unknown as SimpleGit & { raw: jest.Mock }

describe("Package Subcomponents", () => {
	let metadataScanner: MetadataScanner
	const mockFs = fs as jest.Mocked<typeof fs>

	beforeEach(() => {
		metadataScanner = new MetadataScanner(mockGit)
		jest.clearAllMocks()
	})

	describe("scanDirectory with packages", () => {
		it("should load subcomponents listed in metadata.yml", async () => {
			// Mock directory structure
			mockFs.readdir.mockImplementation((path: any) => {
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
			mockFs.readFile.mockImplementation((path: any) => {
				const pathStr = path.toString()
				if (pathStr === "/test/repo/test-package/metadata.en.yml") {
					return Promise.resolve(`
name: Test Package
description: A test package
type: package
version: 1.0.0
items:
  - type: mode
    path: subcomponent1
`)
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

			const items = await metadataScanner.scanDirectory("/test/repo", "https://example.com")

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
		})

		it("should load subcomponents from directory structure", async () => {
			// Mock directory structure
			mockFs.readdir.mockImplementation((path: any) => {
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
			mockFs.readFile.mockImplementation((path: any) => {
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

			const items = await metadataScanner.scanDirectory("/test/repo", "https://example.com")

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
			mockFs.readdir.mockImplementation((path: any) => {
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
			mockFs.readFile.mockImplementation((path: any) => {
				const pathStr = path.toString()
				if (pathStr === "/test/repo/test-package/metadata.en.yml") {
					return Promise.resolve(`
name: Test Package
description: A test package
type: package
version: 1.0.0
items:
  - type: mode
    path: listed-mode
`)
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

			const items = await metadataScanner.scanDirectory("/test/repo", "https://example.com")

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

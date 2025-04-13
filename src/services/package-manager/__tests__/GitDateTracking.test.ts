import * as fs from "fs/promises"
import { Dirent, Stats } from "fs"
import { SimpleGit } from "simple-git"
import { MetadataScanner } from "../MetadataScanner"

// Mock fs/promises
jest.mock("fs/promises")

// Mock simple-git
jest.mock("simple-git", () => {
	const mockGit = {
		raw: jest.fn(),
	}
	return jest.fn(() => mockGit)
})

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

describe("Git Date Tracking", () => {
	let metadataScanner: MetadataScanner
	let mockGit: jest.Mocked<SimpleGit>
	const mockFs = fs as jest.Mocked<typeof fs>

	beforeEach(() => {
		// Reset mocks
		jest.clearAllMocks()

		// Setup git mock
		mockGit = {
			raw: jest.fn(),
		} as unknown as jest.Mocked<SimpleGit>

		metadataScanner = new MetadataScanner(mockGit)
	})

	it("should use git log date when available", async () => {
		const mockDate = "2025-04-12T22:08:02-07:00"
		mockGit.raw.mockResolvedValue(mockDate)

		// Mock directory structure
		mockFs.readdir.mockImplementation((path: any, options?: any) => {
			return Promise.resolve([createMockDirent("component1", true)])
		})

		mockFs.readFile.mockImplementation((path: any) => {
			return Promise.resolve(`
name: Test Component
description: A test component
type: mcp server
version: 1.0.0
`)
		})

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

		// Mock fs.stat to return a specific date
		const mockStats = {
			mtime: mockDate,
			isFile: () => false,
			isDirectory: () => true,
			dev: 0,
			ino: 0,
			mode: 0,
			nlink: 0,
			uid: 0,
			gid: 0,
			rdev: 0,
			size: 0,
			blksize: 0,
			blocks: 0,
			atimeMs: 0,
			mtimeMs: 0,
			ctimeMs: 0,
			birthtimeMs: 0,
			atime: new Date(),
			ctime: new Date(),
			birthtime: new Date(),
		} as Stats

		mockFs.stat.mockResolvedValue(mockStats)

		// Mock directory structure
		mockFs.readdir.mockImplementation((path: any, options?: any) => {
			return Promise.resolve([createMockDirent("component1", true)])
		})

		mockFs.readFile.mockImplementation((path: any) => {
			return Promise.resolve(`
name: Test Component
description: A test component
type: mcp server
version: 1.0.0
`)
		})

		const items = await metadataScanner.scanDirectory("/test/repo", "https://example.com")

		expect(items).toHaveLength(1)
		expect(items[0].lastUpdated).toBe(mockDate.toISOString())
		expect(mockFs.stat).toHaveBeenCalled()
	})

	it("should fall back to current date when both git and fs.stat fail", async () => {
		const beforeTest = new Date()
		mockGit.raw.mockRejectedValue(new Error("Git error"))
		mockFs.stat.mockRejectedValue(new Error("Stat error"))

		// Mock directory structure
		mockFs.readdir.mockImplementation((path: any, options?: any) => {
			return Promise.resolve([createMockDirent("component1", true)])
		})

		mockFs.readFile.mockImplementation((path: any) => {
			return Promise.resolve(`
name: Test Component
description: A test component
type: mcp server
version: 1.0.0
`)
		})

		const items = await metadataScanner.scanDirectory("/test/repo", "https://example.com")
		const afterTest = new Date()

		expect(items).toHaveLength(1)
		expect(items[0].lastUpdated).toBeDefined()
		const lastUpdated = new Date(items[0].lastUpdated!)
		expect(lastUpdated.getTime()).toBeGreaterThanOrEqual(beforeTest.getTime())
		expect(lastUpdated.getTime()).toBeLessThanOrEqual(afterTest.getTime())
	})
})

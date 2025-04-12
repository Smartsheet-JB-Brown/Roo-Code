import * as fs from "fs/promises"
import { MetadataScanner } from "../MetadataScanner"
import { Dirent } from "fs"

// Mock fs/promises
jest.mock("fs/promises", () => ({
	readdir: jest.fn(),
	readFile: jest.fn(),
}))

describe("MetadataScanner", () => {
	let metadataScanner: MetadataScanner
	const mockFs = fs as jest.Mocked<typeof fs>

	beforeEach(() => {
		metadataScanner = new MetadataScanner()
		jest.clearAllMocks()
	})

	describe("scanDirectory", () => {
		it("should discover components with English metadata", async () => {
			// Mock directory structure
			mockFs.readdir.mockImplementation((path: any, options?: any) => {
				const pathStr = path.toString()
				if (pathStr === "/test/repo") {
					return Promise.resolve([
						{
							name: "component1",
							isDirectory: () => true,
							isFile: () => false,
						} as Dirent,
					])
				}
				if (pathStr.includes("component1")) {
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

			mockFs.readFile.mockImplementation((path: any) => {
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

			const items = await metadataScanner.scanDirectory("/test/repo", "https://example.com")

			expect(items).toHaveLength(1)
			expect(items[0].name).toBe("Test Component")
			expect(items[0].type).toBe("mcp server")
		})

		it("should skip components without English metadata", async () => {
			mockFs.readdir.mockImplementation((path: any, options?: any) => {
				const pathStr = path.toString()
				if (pathStr === "/test/repo") {
					return Promise.resolve([
						{
							name: "component1",
							isDirectory: () => true,
							isFile: () => false,
						} as Dirent,
					])
				}
				if (pathStr.includes("component1")) {
					return Promise.resolve([
						{
							name: "metadata.fr.yml",
							isDirectory: () => false,
							isFile: () => true,
						} as Dirent,
					])
				}
				return Promise.resolve([])
			})

			const items = await metadataScanner.scanDirectory("/test/repo", "https://example.com")

			expect(items).toHaveLength(0)
		})

		it("should handle invalid metadata files", async () => {
			mockFs.readdir.mockImplementation((path: any, options?: any) => {
				const pathStr = path.toString()
				if (pathStr === "/test/repo") {
					return Promise.resolve([
						{
							name: "component1",
							isDirectory: () => true,
							isFile: () => false,
						} as Dirent,
					])
				}
				if (pathStr.includes("component1")) {
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

			mockFs.readFile.mockImplementation((path: any) => {
				const pathStr = path.toString()
				if (pathStr.includes("metadata.en.yml")) {
					return Promise.resolve("invalid: yaml: content")
				}
				return Promise.resolve("")
			})

			const items = await metadataScanner.scanDirectory("/test/repo", "https://example.com")

			expect(items).toHaveLength(0)
		})

		it("should include source name in items when provided", async () => {
			mockFs.readdir.mockImplementation((path: any, options?: any) => {
				const pathStr = path.toString()
				if (pathStr === "/test/repo") {
					return Promise.resolve([
						{
							name: "component1",
							isDirectory: () => true,
							isFile: () => false,
						} as Dirent,
					])
				}
				if (pathStr.includes("component1")) {
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

			mockFs.readFile.mockImplementation((path: any) => {
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

			const items = await metadataScanner.scanDirectory("/test/repo", "https://example.com", "Custom Source")

			expect(items).toHaveLength(1)
			expect(items[0].sourceName).toBe("Custom Source")
		})
	})
})

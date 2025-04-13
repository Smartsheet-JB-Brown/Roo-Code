import { RepositoryStructureValidator } from "../../RepositoryStructureValidator"
import * as fs from "fs/promises"
import * as path from "path"
import { Dirent } from "fs"

describe("Repository Structure Validation Enhanced Tests", () => {
	let validator: RepositoryStructureValidator
	const mockBasePath = "/test/repo"

	beforeEach(() => {
		validator = new RepositoryStructureValidator()
	})

	const createMockDirent = (name: string, isDirectory: boolean): Dirent => ({
		name,
		isDirectory: () => isDirectory,
		isFile: () => !isDirectory,
		isBlockDevice: () => false,
		isCharacterDevice: () => false,
		isFIFO: () => false,
		isSocket: () => false,
		isSymbolicLink: () => false,
	})

	describe("directory structure validation", () => {
		it("should validate correct repository structure", async () => {
			const mockStructure = [
				createMockDirent("mcp servers", true),
				createMockDirent("modes", true),
				createMockDirent("packages", true),
				createMockDirent("metadata.en.yml", false),
			]
			jest.spyOn(fs, "readdir").mockResolvedValue(mockStructure)

			await expect(validator.validate(mockBasePath)).resolves.not.toThrow()
		})

		it("should handle missing required directories", async () => {
			const mockStructure = [createMockDirent("metadata.en.yml", false)]
			jest.spyOn(fs, "readdir").mockResolvedValue(mockStructure)

			await expect(validator.validate(mockBasePath)).rejects.toThrow("Missing required directories")
		})

		it("should validate nested directory structure", async () => {
			const mockStructure = [createMockDirent("mcp servers", true), createMockDirent("metadata.en.yml", false)]
			const mockServerDir = [createMockDirent("example-server", true), createMockDirent("metadata.en.yml", false)]
			jest.spyOn(fs, "readdir")
				.mockImplementationOnce(() => Promise.resolve(mockStructure))
				.mockImplementationOnce(() => Promise.resolve(mockServerDir))

			await expect(validator.validate(mockBasePath)).resolves.not.toThrow()
		})
	})

	describe("metadata validation", () => {
		beforeEach(() => {
			const mockStructure = [createMockDirent("mcp servers", true), createMockDirent("metadata.en.yml", false)]
			jest.spyOn(fs, "readdir").mockResolvedValue(mockStructure)
		})

		it("should validate correct metadata file", async () => {
			jest.spyOn(fs, "readFile").mockResolvedValue(
				Buffer.from(`
name: Test Repository
description: Test description
version: 1.0.0
type: repository`),
			)

			await expect(validator.validate(mockBasePath)).resolves.not.toThrow()
		})

		it("should handle missing required metadata fields", async () => {
			jest.spyOn(fs, "readFile").mockResolvedValue(
				Buffer.from(`
name: Test Repository
description: Test description`),
			)

			await expect(validator.validate(mockBasePath)).rejects.toThrow("Missing required metadata fields")
		})

		it("should validate metadata in all supported languages", async () => {
			const mockStructure = [
				createMockDirent("mcp servers", true),
				createMockDirent("metadata.en.yml", false),
				createMockDirent("metadata.es.yml", false),
				createMockDirent("metadata.ja.yml", false),
			]
			jest.spyOn(fs, "readdir").mockResolvedValue(mockStructure)
			jest.spyOn(fs, "readFile").mockImplementation((filePath) => {
				return Promise.resolve(
					Buffer.from(`
name: Test Repository
description: Test description
version: 1.0.0
type: repository`),
				)
			})

			await expect(validator.validate(mockBasePath)).resolves.not.toThrow()
		})
	})

	describe("error handling", () => {
		it("should handle filesystem errors gracefully", async () => {
			jest.spyOn(fs, "readdir").mockRejectedValue(new Error("Permission denied"))
			await expect(validator.validate(mockBasePath)).rejects.toThrow("Failed to validate repository structure")
		})

		it("should handle malformed YAML files", async () => {
			const mockStructure = [createMockDirent("mcp servers", true), createMockDirent("metadata.en.yml", false)]
			jest.spyOn(fs, "readdir").mockResolvedValue(mockStructure)
			jest.spyOn(fs, "readFile").mockResolvedValue(Buffer.from("invalid: yaml: content"))

			await expect(validator.validate(mockBasePath)).rejects.toThrow("Invalid metadata format")
		})

		it("should handle empty directories", async () => {
			jest.spyOn(fs, "readdir").mockResolvedValue([])
			await expect(validator.validate(mockBasePath)).rejects.toThrow("Empty repository")
		})
	})

	describe("security validation", () => {
		it("should prevent directory traversal", async () => {
			const mockStructure = [
				createMockDirent("mcp servers", true),
				createMockDirent("metadata.en.yml", false),
				createMockDirent("../external", true),
			]
			jest.spyOn(fs, "readdir").mockResolvedValue(mockStructure)

			await expect(validator.validate(mockBasePath)).rejects.toThrow("Invalid directory name")
		})

		it("should validate file extensions", async () => {
			const mockStructure = [
				createMockDirent("mcp servers", true),
				createMockDirent("metadata.en.yml", false),
				createMockDirent("script.js", false),
			]
			jest.spyOn(fs, "readdir").mockResolvedValue(mockStructure)

			await expect(validator.validate(mockBasePath)).rejects.toThrow("Invalid file type")
		})
	})
})

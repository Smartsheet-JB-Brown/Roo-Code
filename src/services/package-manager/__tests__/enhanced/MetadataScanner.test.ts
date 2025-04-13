import { MetadataScanner } from "../../MetadataScanner"
import * as fs from "fs/promises"
import * as path from "path"
import { PackageManagerItem } from "../../types"

describe("MetadataScanner Enhanced Tests", () => {
	let metadataScanner: MetadataScanner
	const mockBasePath = "/test/repo"

	beforeEach(() => {
		metadataScanner = new MetadataScanner()
		jest.spyOn(fs, "readdir").mockResolvedValue([])
		jest.spyOn(fs, "readFile").mockResolvedValue(Buffer.from(""))
	})

	describe("localization handling", () => {
		const mockMetadataFiles = {
			"metadata.en.yml": `
name: Test Component
description: Test description
version: 1.0.0
type: mcp server`,
			"metadata.es.yml": `
name: Componente de Prueba
description: Descripción de prueba
version: 1.0.0
type: mcp server`,
			"metadata.ja.yml": `
name: テストコンポーネント
description: テストの説明
version: 1.0.0
type: mcp server`,
		}

		beforeEach(() => {
			jest.spyOn(fs, "readdir").mockResolvedValue(Object.keys(mockMetadataFiles))
			jest.spyOn(fs, "readFile").mockImplementation((filePath) => {
				const fileName = path.basename(filePath.toString())
				return Promise.resolve(Buffer.from(mockMetadataFiles[fileName] || ""))
			})
		})

		it("should load correct localized metadata based on language", async () => {
			const items = await metadataScanner.scanDirectory(mockBasePath, "es")
			expect(items[0].name).toBe("Componente de Prueba")
			expect(items[0].description).toBe("Descripción de prueba")
		})

		it("should fallback to English when requested locale is not available", async () => {
			const items = await metadataScanner.scanDirectory(mockBasePath, "fr")
			expect(items[0].name).toBe("Test Component")
			expect(items[0].description).toBe("Test description")
		})

		it("should handle multiple locales in single directory", async () => {
			const languages = ["en", "es", "ja"]
			const results = await Promise.all(
				languages.map((lang) => metadataScanner.scanDirectory(mockBasePath, lang)),
			)

			expect(results[0][0].name).toBe("Test Component")
			expect(results[1][0].name).toBe("Componente de Prueba")
			expect(results[2][0].name).toBe("テストコンポーネント")
		})
	})

	describe("external items handling", () => {
		beforeEach(() => {
			jest.spyOn(fs, "readdir").mockResolvedValue(["metadata.en.yml"])
		})

		it("should parse package with external item references", async () => {
			jest.spyOn(fs, "readFile").mockResolvedValue(
				Buffer.from(`
name: Package with Externals
description: A package with external item references
version: 1.0.0
type: package
items:
  - type: mcp server
    path: ../external/server
  - type: mode
    path: ../external/mode`),
			)

			const items = await metadataScanner.scanDirectory(mockBasePath)
			const pkg = items[0] as PackageManagerItem

			expect(pkg.type).toBe("package")
			expect(pkg.items).toHaveLength(2)
			expect(pkg.items[0].type).toBe("mcp server")
			expect(pkg.items[0].path).toBe("../external/server")
		})

		it("should handle missing external items gracefully", async () => {
			jest.spyOn(fs, "readFile").mockResolvedValue(
				Buffer.from(`
name: Package with Missing Externals
description: A package with non-existent external references
version: 1.0.0
type: package
items:
  - type: mcp server
    path: ../missing/server`),
			)

			const items = await metadataScanner.scanDirectory(mockBasePath)
			expect(items[0].items).toHaveLength(1)
			expect(items[0].items[0].path).toBe("../missing/server")
		})

		it("should validate external item paths", async () => {
			jest.spyOn(fs, "readFile").mockResolvedValue(
				Buffer.from(`
name: Package with Invalid Path
description: A package with invalid external path
version: 1.0.0
type: package
items:
  - type: mcp server
    path: /absolute/path/not/allowed`),
			)

			await expect(metadataScanner.scanDirectory(mockBasePath)).rejects.toThrow("Invalid external item path")
		})
	})

	describe("error handling", () => {
		it("should handle missing metadata files gracefully", async () => {
			jest.spyOn(fs, "readdir").mockResolvedValue([])
			const items = await metadataScanner.scanDirectory(mockBasePath)
			expect(items).toHaveLength(0)
		})

		it("should handle malformed metadata files", async () => {
			jest.spyOn(fs, "readFile").mockResolvedValue(Buffer.from("invalid: yaml: content"))
			await expect(metadataScanner.scanDirectory(mockBasePath)).rejects.toThrow("Invalid metadata format")
		})

		it("should handle filesystem errors", async () => {
			jest.spyOn(fs, "readdir").mockRejectedValue(new Error("Permission denied"))
			await expect(metadataScanner.scanDirectory(mockBasePath)).rejects.toThrow("Failed to scan directory")
		})
	})
})

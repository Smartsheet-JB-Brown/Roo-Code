import * as vscode from "vscode"
import * as fs from "fs/promises"
import { GitFetcher } from "../GitFetcher"

// Mock fs/promises
jest.mock("fs/promises", () => ({
	stat: jest.fn(),
	readFile: jest.fn(),
	mkdir: jest.fn(),
	rm: jest.fn(),
}))

describe("Repository Structure Validation", () => {
	let gitFetcher: GitFetcher
	const mockFs = fs as jest.Mocked<typeof fs>

	beforeEach(() => {
		// Mock VSCode extension context
		const mockContext = {
			globalStorageUri: {
				fsPath: "/mock/storage/path",
			},
		} as vscode.ExtensionContext

		gitFetcher = new GitFetcher(mockContext)
		jest.clearAllMocks()

		// Setup basic mocks
		mockFs.stat.mockRejectedValue(new Error("File not found"))
	})

	// Helper function to access private method
	const validateRepositoryStructure = async (repoDir: string) => {
		return (gitFetcher as any).validateRepositoryStructure(repoDir)
	}

	describe("metadata.en.yml validation", () => {
		it("should throw error when metadata.en.yml is missing", async () => {
			// Mock fs.stat to simulate missing file
			mockFs.stat.mockRejectedValue(new Error("File not found"))

			// Call the method and expect it to throw
			await expect(validateRepositoryStructure("/mock/repo")).rejects.toThrow(
				"Repository is missing metadata.en.yml file",
			)
		})

		it("should pass when metadata.en.yml exists", async () => {
			// Mock fs.stat to simulate existing file
			mockFs.stat.mockResolvedValue({} as any)

			// Call the method and expect it not to throw
			await expect(validateRepositoryStructure("/mock/repo")).resolves.not.toThrow()
		})
	})
})

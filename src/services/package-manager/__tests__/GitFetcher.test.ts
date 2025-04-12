import * as vscode from "vscode"
import { GitFetcher } from "../GitFetcher"
import * as fs from "fs/promises"
import simpleGit, { SimpleGit } from "simple-git"

// Mock simpleGit
jest.mock("simple-git", () => {
	const mockGit = {
		clone: jest.fn(),
		pull: jest.fn(),
		revparse: jest.fn(),
		fetch: jest.fn(),
		clean: jest.fn(),
		raw: jest.fn(),
	}
	return jest.fn(() => mockGit)
})

// Mock fs/promises
jest.mock("fs/promises", () => ({
	mkdir: jest.fn(),
	stat: jest.fn(),
	rm: jest.fn(),
	readdir: jest.fn().mockResolvedValue([]),
	readFile: jest.fn().mockResolvedValue(`
name: Test Repository
description: Test Description
version: 1.0.0
`),
}))

// Mock vscode
const mockContext = {
	globalStorageUri: {
		fsPath: "/mock/storage/path",
	},
} as vscode.ExtensionContext

describe("GitFetcher", () => {
	let gitFetcher: GitFetcher
	const mockSimpleGit = simpleGit as jest.MockedFunction<typeof simpleGit>
	const testRepoUrl = "https://github.com/test/repo"
	const testRepoDir = "/mock/storage/path/package-manager-cache/repo"

	beforeEach(() => {
		jest.clearAllMocks()
		gitFetcher = new GitFetcher(mockContext)

		// Reset fs mock defaults
		;(fs.mkdir as jest.Mock).mockResolvedValue(undefined)
		;(fs.rm as jest.Mock).mockImplementation((path: string, options?: any) => {
			if (path === testRepoDir && options?.recursive && options?.force) {
				return Promise.resolve(undefined)
			}
			return Promise.reject(new Error("Invalid rm call"))
		})

		// Setup fs.stat mock for repository structure validation
		;(fs.stat as jest.Mock).mockImplementation((path: string) => {
			if (path.endsWith(".git")) return Promise.reject(new Error("ENOENT"))
			if (path.endsWith("metadata.en.yml")) return Promise.resolve(true)
			if (path.endsWith("README.md")) return Promise.resolve(true)
			return Promise.reject(new Error("ENOENT"))
		})

		// Setup default git mock behavior
		const mockGit = {
			clone: jest.fn().mockResolvedValue(undefined),
			pull: jest.fn().mockResolvedValue(undefined),
			revparse: jest.fn().mockResolvedValue("main"),
			// Add other required SimpleGit methods with no-op implementations
			addAnnotatedTag: jest.fn(),
			addConfig: jest.fn(),
			applyPatch: jest.fn(),
			listConfig: jest.fn(),
			addRemote: jest.fn(),
			addTag: jest.fn(),
			branch: jest.fn(),
			branchLocal: jest.fn(),
			checkout: jest.fn(),
			checkoutBranch: jest.fn(),
			checkoutLatestTag: jest.fn(),
			checkoutLocalBranch: jest.fn(),
			clean: jest.fn(),
			clearQueue: jest.fn(),
			commit: jest.fn(),
			cwd: jest.fn(),
			deleteLocalBranch: jest.fn(),
			deleteLocalBranches: jest.fn(),
			diff: jest.fn(),
			diffSummary: jest.fn(),
			exec: jest.fn(),
			fetch: jest.fn(),
			getRemotes: jest.fn(),
			init: jest.fn(),
			log: jest.fn(),
			merge: jest.fn(),
			mirror: jest.fn(),
			push: jest.fn(),
			pushTags: jest.fn(),
			raw: jest.fn(),
			rebase: jest.fn(),
			remote: jest.fn(),
			removeRemote: jest.fn(),
			reset: jest.fn(),
			revert: jest.fn(),
			show: jest.fn(),
			stash: jest.fn(),
			status: jest.fn(),
			subModule: jest.fn(),
			tag: jest.fn(),
			tags: jest.fn(),
			updateServerInfo: jest.fn(),
		} as unknown as SimpleGit
		mockSimpleGit.mockReturnValue(mockGit)
	})

	describe("fetchRepository", () => {
		it("should successfully clone a new repository", async () => {
			await expect(gitFetcher.fetchRepository(testRepoUrl)).resolves.toBeDefined()

			const mockGit = mockSimpleGit()
			expect(mockGit.clone).toHaveBeenCalledWith(testRepoUrl, testRepoDir)
			expect(mockGit.raw).toHaveBeenCalledWith(["clean", "-f", "-d"])
			expect(mockGit.raw).toHaveBeenCalledWith(["reset", "--hard", "HEAD"])
		})

		it("should pull existing repository", async () => {
			// Mock repository exists
			;(fs.stat as jest.Mock).mockImplementation((path: string) => {
				if (path.endsWith(".git")) return Promise.resolve(true)
				if (path.endsWith("metadata.en.yml")) return Promise.resolve(true)
				if (path.endsWith("README.md")) return Promise.resolve(true)
				return Promise.reject(new Error("ENOENT"))
			})

			await gitFetcher.fetchRepository(testRepoUrl)

			const mockGit = mockSimpleGit()
			expect(mockGit.fetch).toHaveBeenCalledWith("origin", "main")
			expect(mockGit.raw).toHaveBeenCalledWith(["reset", "--hard", "origin/main"])
			expect(mockGit.raw).toHaveBeenCalledWith(["clean", "-f", "-d"])
			expect(mockGit.clone).not.toHaveBeenCalled()
		})

		it("should handle clone failures", async () => {
			const error = new Error("fatal: repository not found")
			const mockGit = {
				...mockSimpleGit(),
				clone: jest.fn().mockRejectedValue(error),
				pull: jest.fn(),
				revparse: jest.fn(),
			} as unknown as SimpleGit
			mockSimpleGit.mockReturnValue(mockGit)

			await expect(gitFetcher.fetchRepository(testRepoUrl)).rejects.toThrow(
				"Failed to clone/pull repository: fatal: repository not found",
			)

			// Verify cleanup was called
			expect(fs.rm).toHaveBeenCalledWith(testRepoDir, { recursive: true, force: true })
		})

		it("should handle pull failures and re-clone", async () => {
			// Mock repository exists
			;(fs.stat as jest.Mock).mockImplementation((path: string) => {
				if (path.endsWith(".git")) return Promise.resolve(true)
				if (path.endsWith("metadata.en.yml")) return Promise.resolve(true)
				if (path.endsWith("README.md")) return Promise.resolve(true)
				return Promise.reject(new Error("ENOENT"))
			})

			// Reset fs.rm mock to track calls
			;(fs.rm as jest.Mock).mockReset()
			;(fs.rm as jest.Mock).mockImplementation((path: string, options?: any) => {
				if (path === testRepoDir && options?.recursive && options?.force) {
					return Promise.resolve(undefined)
				}
				return Promise.reject(new Error("Invalid rm call"))
			})

			const mockGit = {
				clone: jest.fn().mockResolvedValue(undefined),
				pull: jest.fn().mockRejectedValue(new Error("not a git repository")),
				revparse: jest.fn().mockResolvedValue("main"),
				fetch: jest.fn().mockRejectedValue(new Error("not a git repository")),
				clean: jest.fn(),
				raw: jest.fn(),
			} as unknown as SimpleGit
			mockSimpleGit.mockReturnValue(mockGit)

			await gitFetcher.fetchRepository(testRepoUrl)

			// Verify directory was removed and repository was re-cloned
			// First rm call is for cleanup before clone
			expect(fs.rm).toHaveBeenCalledWith(testRepoDir, { recursive: true, force: true })
			// Second rm call is after pull failure
			expect(fs.rm).toHaveBeenCalledWith(testRepoDir, { recursive: true, force: true })
			expect(mockGit.clone).toHaveBeenCalledWith(testRepoUrl, testRepoDir)
			expect(mockGit.raw).toHaveBeenCalledWith(["clean", "-f", "-d"])
			expect(mockGit.raw).toHaveBeenCalledWith(["reset", "--hard", "HEAD"])
		})

		it("should handle missing metadata.yml", async () => {
			// Mock repository exists but missing metadata
			;(fs.stat as jest.Mock).mockImplementation((path: string) => {
				if (path.endsWith("metadata.en.yml")) return Promise.reject(new Error("ENOENT"))
				return Promise.resolve(true)
			})

			await expect(gitFetcher.fetchRepository(testRepoUrl)).rejects.toThrow(
				"Repository is missing metadata.en.yml file",
			)
		})

		it("should handle missing README.md", async () => {
			// Mock repository exists but missing README
			;(fs.stat as jest.Mock).mockImplementation((path: string) => {
				if (path.endsWith("README.md")) return Promise.reject(new Error("ENOENT"))
				return Promise.resolve(true)
			})

			await expect(gitFetcher.fetchRepository(testRepoUrl)).rejects.toThrow(
				"Repository is missing README.md file",
			)
		})
	})
})

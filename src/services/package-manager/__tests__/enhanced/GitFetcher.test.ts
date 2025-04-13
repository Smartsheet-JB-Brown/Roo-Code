import { GitFetcher } from "../../GitFetcher"
import * as fs from "fs/promises"
import * as path from "path"

describe("GitFetcher Enhanced Tests", () => {
	let gitFetcher: GitFetcher
	const mockCacheDir = "/test/cache/package-manager"

	beforeEach(() => {
		gitFetcher = new GitFetcher(mockCacheDir)
		jest.spyOn(fs, "mkdir").mockResolvedValue(undefined)
		jest.spyOn(fs, "readdir").mockResolvedValue([])
	})

	describe("cache location handling", () => {
		it("should create and use correct cache directory structure", async () => {
			const mkdirSpy = jest.spyOn(fs, "mkdir")
			const repoUrl = "https://github.com/test/repo"
			const expectedCacheDir = path.join(mockCacheDir, "repo")

			await gitFetcher.fetchRepository(repoUrl)

			expect(mkdirSpy).toHaveBeenCalledWith(expectedCacheDir, { recursive: true })
		})

		it("should handle cache directory creation errors", async () => {
			jest.spyOn(fs, "mkdir").mockRejectedValue(new Error("Permission denied"))
			const repoUrl = "https://github.com/test/repo"

			await expect(gitFetcher.fetchRepository(repoUrl)).rejects.toThrow("Failed to create cache directory")
		})

		it("should clean up cache on invalid repository", async () => {
			const deleteSpy = jest.spyOn(fs, "rm").mockResolvedValue(undefined)
			const repoUrl = "https://github.com/invalid/repo"

			await expect(gitFetcher.fetchRepository(repoUrl)).rejects.toThrow()
			expect(deleteSpy).toHaveBeenCalled()
		})
	})

	describe("error handling", () => {
		it("should handle network timeouts gracefully", async () => {
			jest.spyOn(global, "fetch").mockRejectedValue(new Error("Network timeout"))
			const repoUrl = "https://github.com/test/repo"

			await expect(gitFetcher.fetchRepository(repoUrl)).rejects.toThrow("Failed to fetch repository")
		})

		it("should handle rate limiting errors", async () => {
			jest.spyOn(global, "fetch").mockRejectedValue(new Error("API rate limit exceeded"))
			const repoUrl = "https://github.com/test/repo"

			await expect(gitFetcher.fetchRepository(repoUrl)).rejects.toThrow("GitHub API rate limit exceeded")
		})
	})
})

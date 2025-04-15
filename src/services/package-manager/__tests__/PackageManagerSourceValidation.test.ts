import {
	isValidGitRepositoryUrl,
	validateSourceUrl,
	validateSourceName,
	validateSourceDuplicates,
	validateSource,
	validateSources,
	ValidationError,
} from "@package-manager/PackageManagerSourceValidation"
import { PackageManagerSource } from "@package-manager/types"

describe("PackageManagerSourceValidation", () => {
	describe("isValidGitRepositoryUrl", () => {
		const validUrls = [
			"https://github.com/username/repo",
			"https://github.com/username/repo.git",
			"https://gitlab.com/username/repo",
			"https://bitbucket.org/username/repo",
			"git@github.com:username/repo.git",
			"git@gitlab.com:username/repo.git",
			"git://github.com/username/repo.git",
		]

		const invalidUrls = [
			"",
			" ",
			"not-a-url",
			"http://invalid-domain.com/repo",
			"https://github.com", // Missing username/repo
			"git@github.com", // Missing repo
			"git://invalid-domain.com/repo.git",
		]

		test.each(validUrls)("should accept valid URL: %s", (url) => {
			expect(isValidGitRepositoryUrl(url)).toBe(true)
		})

		test.each(invalidUrls)("should reject invalid URL: %s", (url) => {
			expect(isValidGitRepositoryUrl(url)).toBe(false)
		})
	})

	describe("validateSourceUrl", () => {
		test("should accept valid URLs", () => {
			const errors = validateSourceUrl("https://github.com/username/repo")
			expect(errors).toHaveLength(0)
		})

		test("should reject empty URL", () => {
			const errors = validateSourceUrl("")
			expect(errors).toHaveLength(1)
			expect(errors[0]).toEqual({
				field: "url",
				message: "URL cannot be empty",
			})
		})

		test("should reject invalid URL format", () => {
			const errors = validateSourceUrl("not-a-url")
			expect(errors).toHaveLength(1)
			expect(errors[0]).toEqual({
				field: "url",
				message: "Invalid URL format",
			})
		})

		test("should reject URLs with non-visible characters", () => {
			const errors = validateSourceUrl("https://github.com/username/repo\t")
			expect(errors).toHaveLength(1)
			expect(errors[0]).toEqual({
				field: "url",
				message: "URL contains non-visible characters other than spaces",
			})
		})

		test("should reject non-Git repository URLs", () => {
			const errors = validateSourceUrl("https://example.com/path")
			expect(errors).toHaveLength(1)
			expect(errors[0]).toEqual({
				field: "url",
				message: "URL must be a valid Git repository URL (e.g., https://github.com/username/repo)",
			})
		})
	})

	describe("validateSourceName", () => {
		test("should accept valid names", () => {
			const errors = validateSourceName("Valid Name")
			expect(errors).toHaveLength(0)
		})

		test("should accept undefined name", () => {
			const errors = validateSourceName(undefined)
			expect(errors).toHaveLength(0)
		})

		test("should reject names longer than 20 characters", () => {
			const errors = validateSourceName("This name is way too long to be valid")
			expect(errors).toHaveLength(1)
			expect(errors[0]).toEqual({
				field: "name",
				message: "Name must be 20 characters or less",
			})
		})

		test("should reject names with non-visible characters", () => {
			const errors = validateSourceName("Invalid\tName")
			expect(errors).toHaveLength(1)
			expect(errors[0]).toEqual({
				field: "name",
				message: "Name contains non-visible characters other than spaces",
			})
		})
	})

	describe("validateSourceDuplicates", () => {
		const existingSources: PackageManagerSource[] = [
			{ url: "https://github.com/user1/repo1", name: "Source 1", enabled: true },
			{ url: "https://github.com/user2/repo2", name: "Source 2", enabled: true },
		]

		test("should accept unique sources", () => {
			const newSource: PackageManagerSource = {
				url: "https://github.com/user3/repo3",
				name: "Source 3",
				enabled: true,
			}
			const errors = validateSourceDuplicates(existingSources, newSource)
			expect(errors).toHaveLength(0)
		})

		test("should reject duplicate URLs (case insensitive)", () => {
			const newSource: PackageManagerSource = {
				url: "HTTPS://GITHUB.COM/USER1/REPO1",
				name: "Different Name",
				enabled: true,
			}
			const errors = validateSourceDuplicates(existingSources, newSource)
			expect(errors).toHaveLength(1)
			expect(errors[0].field).toBe("url")
			expect(errors[0].message).toContain("duplicate")
		})

		test("should reject duplicate names (case insensitive)", () => {
			const newSource: PackageManagerSource = {
				url: "https://github.com/user3/repo3",
				name: "SOURCE 1",
				enabled: true,
			}
			const errors = validateSourceDuplicates(existingSources, newSource)
			expect(errors).toHaveLength(1)
			expect(errors[0].field).toBe("name")
			expect(errors[0].message).toContain("duplicate")
		})

		test("should detect duplicates within source list", () => {
			const sourcesWithDuplicates: PackageManagerSource[] = [
				{ url: "https://github.com/user1/repo1", name: "Source 1", enabled: true },
				{ url: "https://github.com/user1/repo1", name: "Source 2", enabled: true }, // Duplicate URL
				{ url: "https://github.com/user3/repo3", name: "Source 1", enabled: true }, // Duplicate name
			]
			const errors = validateSourceDuplicates(sourcesWithDuplicates)
			expect(errors).toHaveLength(4) // Two URL duplicates (bidirectional) and two name duplicates (bidirectional)

			// Check for URL duplicates
			const urlErrors = errors.filter((e) => e.field === "url")
			expect(urlErrors).toHaveLength(2)
			expect(urlErrors[0].message).toContain("Source #1 has a duplicate URL with Source #2")
			expect(urlErrors[1].message).toContain("Source #2 has a duplicate URL with Source #1")

			// Check for name duplicates
			const nameErrors = errors.filter((e) => e.field === "name")
			expect(nameErrors).toHaveLength(2)
			expect(nameErrors[0].message).toContain("Source #1 has a duplicate name with Source #3")
			expect(nameErrors[1].message).toContain("Source #3 has a duplicate name with Source #1")
		})
	})

	describe("validateSource", () => {
		const existingSources: PackageManagerSource[] = [
			{ url: "https://github.com/user1/repo1", name: "Source 1", enabled: true },
		]

		test("should accept valid source", () => {
			const source: PackageManagerSource = {
				url: "https://github.com/user2/repo2",
				name: "Source 2",
				enabled: true,
			}
			const errors = validateSource(source, existingSources)
			expect(errors).toHaveLength(0)
		})

		test("should accumulate multiple validation errors", () => {
			const source: PackageManagerSource = {
				url: "https://github.com/user1/repo1", // Duplicate URL
				name: "This name is way too long to be valid\t", // Too long and has tab
				enabled: true,
			}
			const errors = validateSource(source, existingSources)
			expect(errors.length).toBeGreaterThan(1)
		})
	})

	describe("validateSources", () => {
		test("should accept valid source list", () => {
			const sources: PackageManagerSource[] = [
				{ url: "https://github.com/user1/repo1", name: "Source 1", enabled: true },
				{ url: "https://github.com/user2/repo2", name: "Source 2", enabled: true },
			]
			const errors = validateSources(sources)
			expect(errors).toHaveLength(0)
		})

		test("should detect multiple issues across sources", () => {
			const sources: PackageManagerSource[] = [
				{ url: "https://github.com/user1/repo1", name: "Source 1", enabled: true },
				{ url: "https://github.com/user1/repo1", name: "Source 1", enabled: true }, // Duplicate URL and name
				{ url: "invalid-url", name: "This name is way too long\t", enabled: true }, // Invalid URL and name
			]
			const errors = validateSources(sources)
			expect(errors.length).toBeGreaterThan(2)
		})

		test("should include source index in error messages", () => {
			const sources: PackageManagerSource[] = [{ url: "invalid-url", name: "Source 1", enabled: true }]
			const errors = validateSources(sources)
			expect(errors[0].message).toContain("Source #1")
		})
	})
})

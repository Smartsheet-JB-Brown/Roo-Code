import { isFilterActive, filterItems, sortItems, getDisplayedItems } from "../selectors"
import { PackageManagerItem } from "../../../../../src/services/package-manager/types"

describe("Package Manager Selectors", () => {
	const mockItems: PackageManagerItem[] = [
		{
			name: "Test Package",
			description: "A test package",
			type: "package",
			repoUrl: "test-url",
			url: "test-url",
			tags: ["test", "mock"],
		},
		{
			name: "Another Package",
			description: "Another test package",
			type: "package",
			repoUrl: "test-url-2",
			url: "test-url-2",
			tags: ["test", "another"],
			author: "Test Author",
		},
		{
			name: "Test Mode",
			description: "A test mode",
			type: "mode",
			repoUrl: "test-url-3",
			url: "test-url-3",
			tags: ["mode"],
			lastUpdated: "2025-04-13",
		},
	]

	describe("isFilterActive", () => {
		it("should return false when no filters are active", () => {
			expect(isFilterActive({ type: "", search: "", tags: [] })).toBe(false)
		})

		it("should return true when type filter is active", () => {
			expect(isFilterActive({ type: "package", search: "", tags: [] })).toBe(true)
		})

		it("should return true when search filter is active", () => {
			expect(isFilterActive({ type: "", search: "test", tags: [] })).toBe(true)
		})

		it("should return true when tags filter is active", () => {
			expect(isFilterActive({ type: "", search: "", tags: ["test"] })).toBe(true)
		})
	})

	describe("filterItems", () => {
		it("should return all items when no filters are active", () => {
			const result = filterItems(mockItems, { type: "", search: "", tags: [] })
			expect(result).toEqual(mockItems)
		})

		it("should filter by type", () => {
			const result = filterItems(mockItems, { type: "package", search: "", tags: [] })
			expect(result).toHaveLength(2)
			expect(result.every((item) => item.type === "package")).toBe(true)
		})

		it("should filter by search term in name", () => {
			const result = filterItems(mockItems, { type: "", search: "another", tags: [] })
			expect(result).toHaveLength(1)
			expect(result[0].name).toBe("Another Package")
		})

		it("should filter by search term in description", () => {
			const result = filterItems(mockItems, { type: "", search: "test package", tags: [] })
			expect(result).toHaveLength(2)
		})

		it("should filter by search term in author", () => {
			const result = filterItems(mockItems, { type: "", search: "test author", tags: [] })
			expect(result).toHaveLength(1)
			expect(result[0].author).toBe("Test Author")
		})

		it("should filter by tags", () => {
			const result = filterItems(mockItems, { type: "", search: "", tags: ["mock"] })
			expect(result).toHaveLength(1)
			expect(result[0].name).toBe("Test Package")
		})

		it("should combine multiple filters", () => {
			const result = filterItems(mockItems, { type: "package", search: "test", tags: ["mock"] })
			expect(result).toHaveLength(1)
			expect(result[0].name).toBe("Test Package")
		})
	})

	describe("sortItems", () => {
		it("should sort by name ascending", () => {
			const result = sortItems(mockItems, { by: "name", order: "asc" })
			expect(result[0].name).toBe("Another Package")
			expect(result[2].name).toBe("Test Package")
		})

		it("should sort by name descending", () => {
			const result = sortItems(mockItems, { by: "name", order: "desc" })
			expect(result[0].name).toBe("Test Package")
			expect(result[2].name).toBe("Another Package")
		})

		it("should sort by author", () => {
			const result = sortItems(mockItems, { by: "author", order: "asc" })
			// Items without author should come first
			expect(result[0].author).toBeUndefined()
			expect(result[2].author).toBe("Test Author")
		})

		it("should sort by lastUpdated", () => {
			const result = sortItems(mockItems, { by: "lastUpdated", order: "asc" })
			// Items without lastUpdated should come first
			expect(result[0].lastUpdated).toBeUndefined()
			expect(result[2].lastUpdated).toBe("2025-04-13")
		})
	})

	describe("getDisplayedItems", () => {
		it("should filter and sort items", () => {
			const result = getDisplayedItems(
				mockItems,
				{ type: "package", search: "", tags: [] },
				{ by: "name", order: "asc" },
			)
			expect(result).toHaveLength(2)
			expect(result[0].name).toBe("Another Package")
			expect(result[1].name).toBe("Test Package")
		})

		it("should handle empty results", () => {
			const result = getDisplayedItems(
				mockItems,
				{ type: "prompt", search: "", tags: [] },
				{ by: "name", order: "asc" },
			)
			expect(result).toHaveLength(0)
		})
	})
})

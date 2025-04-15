import { PackageManagerViewStateManager } from "../PackageManagerViewStateManager"
import { PackageManagerItem } from "@services/package-manager"

describe("PackageManagerViewStateManager", () => {
	let stateManager: PackageManagerViewStateManager

	const mockItems: PackageManagerItem[] = [
		{
			name: "B Component",
			description: "Second component",
			type: "mcp server",
			version: "1.0.0",
			lastUpdated: "2025-04-13T09:00:00-07:00",
			url: "https://example.com/b",
			repoUrl: "https://example.com",
			path: "b",
			items: [],
		},
		{
			name: "A Component",
			description: "First component",
			type: "mcp server",
			version: "1.0.0",
			lastUpdated: "2025-04-14T09:00:00-07:00",
			url: "https://example.com/a",
			repoUrl: "https://example.com",
			path: "a",
			items: [],
		},
	]

	beforeEach(() => {
		stateManager = new PackageManagerViewStateManager()
		stateManager.setItems(mockItems)
	})

	describe("sorting", () => {
		it("should sort items by name in ascending order", () => {
			stateManager.setSortBy("name")
			stateManager.setSortOrder("asc")

			const sortedItems = stateManager.getFilteredAndSortedItems()
			expect(sortedItems[0].name).toBe("A Component")
			expect(sortedItems[1].name).toBe("B Component")
		})

		it("should sort items by name in descending order", () => {
			stateManager.setSortBy("name")
			stateManager.setSortOrder("desc")

			const sortedItems = stateManager.getFilteredAndSortedItems()
			expect(sortedItems[0].name).toBe("B Component")
			expect(sortedItems[1].name).toBe("A Component")
		})

		it("should sort items by lastUpdated in ascending order", () => {
			stateManager.setSortBy("lastUpdated")
			stateManager.setSortOrder("asc")

			const sortedItems = stateManager.getFilteredAndSortedItems()
			expect(sortedItems[0].lastUpdated).toBe("2025-04-13T09:00:00-07:00")
			expect(sortedItems[1].lastUpdated).toBe("2025-04-14T09:00:00-07:00")
		})

		it("should sort items by lastUpdated in descending order", () => {
			stateManager.setSortBy("lastUpdated")
			stateManager.setSortOrder("desc")

			const sortedItems = stateManager.getFilteredAndSortedItems()
			expect(sortedItems[0].lastUpdated).toBe("2025-04-14T09:00:00-07:00")
			expect(sortedItems[1].lastUpdated).toBe("2025-04-13T09:00:00-07:00")
		})

		it("should maintain sort order when items are updated", () => {
			stateManager.setSortBy("name")
			stateManager.setSortOrder("asc")

			const newItem: PackageManagerItem = {
				name: "C Component",
				description: "Third component",
				type: "mcp server",
				version: "1.0.0",
				lastUpdated: "2025-04-15T09:00:00-07:00",
				url: "https://example.com/c",
				repoUrl: "https://example.com",
				path: "c",
				items: [],
			}

			stateManager.setItems([...mockItems, newItem])

			const sortedItems = stateManager.getFilteredAndSortedItems()
			expect(sortedItems[0].name).toBe("A Component")
			expect(sortedItems[1].name).toBe("B Component")
			expect(sortedItems[2].name).toBe("C Component")
		})
	})
})

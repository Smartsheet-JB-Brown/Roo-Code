import React from "react"
import { screen, fireEvent } from "@testing-library/react"
import { PackageManagerItemCard } from "../PackageManagerItemCard"
import { PackageManagerItem } from "../../../../../../src/services/package-manager/types"
import { renderWithProviders } from "@/test/test-utils"

// Mock vscode API
const mockPostMessage = jest.fn()
jest.mock("@/utils/vscode", () => ({
	vscode: {
		postMessage: (msg: any) => mockPostMessage(msg),
	},
}))

describe("PackageManagerItemCard", () => {
	const mockItem: PackageManagerItem = {
		name: "Test Package",
		description: "A test package",
		type: "package",
		repoUrl: "test-url",
		url: "test-url",
		tags: ["test", "mock"],
		items: [
			{
				type: "mcp server",
				path: "test/path",
				metadata: {
					name: "Test Server",
					description: "A test server",
					version: "1.0.0",
					type: "mcp server",
				},
			},
			{
				type: "mode",
				path: "test/path2",
				metadata: {
					name: "Test Mode",
					description: "A test mode",
					version: "2.0.0",
					type: "mode",
				},
			},
		],
		version: "1.0.0",
		author: "Test Author",
		lastUpdated: "2025-04-13",
	}

	const defaultProps = {
		item: mockItem,
		filters: { type: "", search: "", tags: [] },
		setFilters: jest.fn(),
		activeTab: "browse" as const,
		setActiveTab: jest.fn(),
	}

	beforeEach(() => {
		mockPostMessage.mockClear()
	})

	it("should render basic item information", () => {
		renderWithProviders(<PackageManagerItemCard {...defaultProps} />)

		expect(screen.getByText("Test Package")).toBeInTheDocument()
		expect(screen.getByText("A test package")).toBeInTheDocument()
		expect(screen.getByText("by Test Author")).toBeInTheDocument()
		expect(screen.getByText("Package")).toBeInTheDocument()
	})

	it("should render tags", () => {
		renderWithProviders(<PackageManagerItemCard {...defaultProps} />)

		expect(screen.getByText("test")).toBeInTheDocument()
		expect(screen.getByText("mock")).toBeInTheDocument()
	})

	it("should handle tag clicks", () => {
		const setFilters = jest.fn()
		renderWithProviders(<PackageManagerItemCard {...defaultProps} setFilters={setFilters} />)

		fireEvent.click(screen.getByText("test"))
		expect(setFilters).toHaveBeenCalledWith(
			expect.objectContaining({
				tags: ["test"],
			}),
		)
	})

	it("should render version and date information", () => {
		renderWithProviders(<PackageManagerItemCard {...defaultProps} />)

		expect(screen.getByText("1.0.0")).toBeInTheDocument()
		// Use a regex to match the date since it depends on the timezone
		expect(screen.getByText(/Apr \d{1,2}, 2025/)).toBeInTheDocument()
	})

	describe("URL handling", () => {
		it("should use sourceUrl directly when present and valid", () => {
			const itemWithSourceUrl = {
				...mockItem,
				sourceUrl: "https://example.com/direct-link",
				defaultBranch: "main",
				path: "some/path",
			}
			renderWithProviders(<PackageManagerItemCard {...defaultProps} item={itemWithSourceUrl} />)

			const button = screen.getByRole("button", { name: /^$/ }) // Button with no text, only icon
			fireEvent.click(button)

			expect(mockPostMessage).toHaveBeenCalledWith({
				type: "openExternal",
				url: "https://example.com/direct-link",
			})
		})

		it("should use repoUrl with git path when sourceUrl is not present", () => {
			const itemWithGitPath = {
				...mockItem,
				defaultBranch: "main",
				path: "some/path",
			}
			renderWithProviders(<PackageManagerItemCard {...defaultProps} item={itemWithGitPath} />)

			const button = screen.getByRole("button", { name: /Source/i })
			fireEvent.click(button)

			expect(mockPostMessage).toHaveBeenCalledWith({
				type: "openExternal",
				url: "test-url/tree/main/some/path",
			})
		})

		it("should show only icon when sourceUrl is present and valid", () => {
			const itemWithSourceUrl = {
				...mockItem,
				sourceUrl: "https://example.com/direct-link",
			}
			renderWithProviders(<PackageManagerItemCard {...defaultProps} item={itemWithSourceUrl} />)

			// Find the source button by its empty aria-label
			const button = screen.getByRole("button", {
				name: "", // Empty aria-label when sourceUrl is present
			})
			expect(button.querySelector(".codicon-link-external")).toBeInTheDocument()
			expect(button.textContent).toBe("") // Verify no text content
		})

		it("should show text label when sourceUrl is not present", () => {
			renderWithProviders(<PackageManagerItemCard {...defaultProps} />)

			// Find the source button by its aria-label
			const button = screen.getByRole("button", {
				name: "Source",
			})
			expect(button.querySelector(".codicon-link-external")).toBeInTheDocument()
			expect(button).toHaveTextContent(/Source/i)
		})
	})

	describe("Details section", () => {
		it("should render expandable details section when item has subcomponents", () => {
			renderWithProviders(<PackageManagerItemCard {...defaultProps} />)

			expect(screen.getByText("Component Details")).toBeInTheDocument()
		})

		it("should not render details section when item has no subcomponents", () => {
			const itemWithoutItems = { ...mockItem, items: [] }
			renderWithProviders(<PackageManagerItemCard {...defaultProps} item={itemWithoutItems} />)

			expect(screen.queryByText("Component Details")).not.toBeInTheDocument()
		})

		it("should show grouped items when expanded", () => {
			renderWithProviders(<PackageManagerItemCard {...defaultProps} />)

			fireEvent.click(screen.getByText("Component Details"))

			expect(screen.getByText("MCP Servers")).toBeInTheDocument()
			expect(screen.getByText("Modes")).toBeInTheDocument()

			// Check for items using getByRole and textContent
			const items = screen.getAllByRole("listitem")
			expect(items[0]).toHaveTextContent("Test Server")
			expect(items[0]).toHaveTextContent("A test server")
			expect(items[1]).toHaveTextContent("Test Mode")
			expect(items[1]).toHaveTextContent("A test mode")
		})

		it("should maintain proper order of items within groups", () => {
			renderWithProviders(<PackageManagerItemCard {...defaultProps} />)

			fireEvent.click(screen.getByText("Component Details"))

			const items = screen.getAllByRole("listitem")
			expect(items[0]).toHaveTextContent("Test Server")
			expect(items[1]).toHaveTextContent("Test Mode")
		})
	})
})

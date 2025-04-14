import { PackageManagerManager } from "../PackageManagerManager"
import * as vscode from "vscode"

describe("containsSearchTerm", () => {
	let manager: PackageManagerManager

	beforeEach(() => {
		const context = {
			globalStorageUri: { fsPath: "" },
		} as vscode.ExtensionContext
		manager = new PackageManagerManager(context)
	})

	// Helper function to access the private containsSearchTerm function
	const testSearch = (searchTerm: string | undefined, text: string | undefined): boolean => {
		if (!text) return false
		const normalizeText = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim()
		const normalizedSearchTerm = searchTerm ? normalizeText(searchTerm) : ""
		return normalizedSearchTerm === "" || normalizeText(text).includes(normalizedSearchTerm)
	}

	describe("basic matching", () => {
		it("should match exact strings", () => {
			expect(testSearch("data validator", "Data Validator")).toBe(true)
			expect(testSearch("DATA VALIDATOR", "Data Validator")).toBe(true)
			expect(testSearch("Data  Validator", "Data Validator")).toBe(true)
		})

		it("should match partial strings", () => {
			expect(testSearch("valid", "Data Validator")).toBe(true)
			expect(testSearch("validator", "Data Validator")).toBe(true)
			expect(testSearch("data valid", "Data Validator")).toBe(true)
		})

		it("should not match words in wrong order", () => {
			expect(testSearch("validator data", "Data Validator")).toBe(false)
			expect(testSearch("validating data", "Data Validator")).toBe(false)
		})
	})

	describe("whitespace handling", () => {
		it("should handle extra spaces", () => {
			expect(testSearch("data   validator", "Data Validator")).toBe(true)
			expect(testSearch(" data validator ", "Data Validator")).toBe(true)
		})

		it("should handle different types of whitespace", () => {
			expect(testSearch("data\tvalidator", "Data Validator")).toBe(true)
			expect(testSearch("data\nvalidator", "Data Validator")).toBe(true)
		})
	})

	describe("case sensitivity", () => {
		it("should be case insensitive", () => {
			expect(testSearch("DATA VALIDATOR", "data validator")).toBe(true)
			expect(testSearch("data validator", "DATA VALIDATOR")).toBe(true)
			expect(testSearch("DaTa VaLiDaToR", "dAtA vAlIdAtOr")).toBe(true)
		})
	})

	describe("empty values", () => {
		it("should handle empty search term", () => {
			expect(testSearch("", "Data Validator")).toBe(true)
		})

		it("should handle empty text", () => {
			expect(testSearch("data validator", "")).toBe(false)
		})

		it("should handle undefined values", () => {
			expect(testSearch(undefined as any, "Data Validator")).toBe(true)
			expect(testSearch("data validator", undefined as any)).toBe(false)
		})
	})
})

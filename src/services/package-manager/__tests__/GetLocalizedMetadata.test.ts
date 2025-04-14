import { MetadataScanner } from "../MetadataScanner"
import { ComponentMetadata, LocalizationOptions, LocalizedMetadata } from "../types"

describe("getLocalizedMetadata", () => {
	let metadataScanner: MetadataScanner

	beforeEach(() => {
		// Initialize with French locale
		const localizationOptions: LocalizationOptions = {
			userLocale: "fr",
			fallbackLocale: "en",
		}
		metadataScanner = new MetadataScanner(undefined, localizationOptions)
	})

	test("should use user locale when available", () => {
		// Create mock metadata with both user locale and English
		const metadata: LocalizedMetadata<ComponentMetadata> = {
			en: {
				name: "English Name",
				description: "English Description",
				version: "1.0.0",
				type: "mode",
			},
			fr: {
				name: "Nom Français",
				description: "Description Française",
				version: "1.0.0",
				type: "mode",
			},
		}

		// Call getLocalizedMetadata
		const result = (metadataScanner as any).getLocalizedMetadata(metadata)

		// Expect French metadata to be used
		expect(result).toBeDefined()
		expect(result.name).toBe("Nom Français")
		expect(result.description).toBe("Description Française")
	})

	test("should fall back to English when user locale not available", () => {
		// Create mock metadata with only English
		const metadata: LocalizedMetadata<ComponentMetadata> = {
			en: {
				name: "English Name",
				description: "English Description",
				version: "1.0.0",
				type: "mode",
			},
		}

		// Call getLocalizedMetadata
		const result = (metadataScanner as any).getLocalizedMetadata(metadata)

		// Expect English metadata to be used as fallback
		expect(result).toBeDefined()
		expect(result.name).toBe("English Name")
		expect(result.description).toBe("English Description")
	})

	test("should return null when neither user locale nor fallback locale is available", () => {
		// Create mock metadata with neither user locale nor English
		const metadata: LocalizedMetadata<ComponentMetadata> = {
			de: {
				name: "Deutscher Name",
				description: "Deutsche Beschreibung",
				version: "1.0.0",
				type: "mode",
			},
		}

		// Call getLocalizedMetadata
		const result = (metadataScanner as any).getLocalizedMetadata(metadata)

		// Expect null result
		expect(result).toBeNull()
	})
})

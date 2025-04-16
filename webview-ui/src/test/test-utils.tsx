import React from "react"
import { render } from "@testing-library/react"
import { TranslationProvider } from "@/i18n/TranslationContext"
import { ExtensionStateContext } from "@/context/ExtensionStateContext"
import i18next from "i18next"
import { initReactI18next } from "react-i18next"

// Mock vscode API
;(global as any).acquireVsCodeApi = () => ({
	postMessage: jest.fn(),
})

// Initialize i18next for tests
i18next.use(initReactI18next).init({
	lng: "en",
	fallbackLng: "en",
	interpolation: {
		escapeValue: false,
	},
	resources: {
		en: {
			package_manager: {
				// Type group translations
				"type_group.mcp_servers": "MCP Servers",
				"type_group.modes": "Modes",
				"type_group.prompts": "Prompts",
				"type_group.packages": "Packages",
				"type_group.match": "Match",
				"type_group.generic_type": "{{type}}s",

				// Item card translations
				"item_card.by_author": "by {{author}}",
				"item_card.type_package": "Package",
				"item_card.type_mode": "Mode",
				"item_card.type_mcp_server": "MCP Server",
				"item_card.type_prompt": "Prompt",
				"item_card.source": "Source",
				"item_card.component_details": "Component Details",
				"item_card.filter_by_tag": "Filter by tag",
				"item_card.by": "by",
			},
		},
	},
})

// Minimal mock state
const mockExtensionState = {
	language: "en",
	packageManagerSources: [{ url: "test-url", enabled: true }],
	setPackageManagerSources: jest.fn(),
	experiments: {
		search_and_replace: false,
		insert_content: false,
		powerSteering: false,
	},
}

export const renderWithProviders = (ui: React.ReactElement) => {
	return render(
		<ExtensionStateContext.Provider value={mockExtensionState as any}>
			<TranslationProvider>{ui}</TranslationProvider>
		</ExtensionStateContext.Provider>,
	)
}

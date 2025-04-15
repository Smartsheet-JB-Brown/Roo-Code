import i18next from "i18next"
import { initReactI18next } from "react-i18next"
import packageManagerEn from "../../src/i18n/locales/en/package_manager.json"

// Initialize i18next
i18next.use(initReactI18next).init({
	resources: {
		en: {
			package_manager: packageManagerEn,
		},
	},
	lng: "en",
	fallbackLng: "en",
	interpolation: {
		escapeValue: false,
	},
})

export const t = i18next.t
export default i18next

import { useState, useEffect } from "react"
import { PackageManagerViewStateManager, ViewState } from "./PackageManagerViewStateManager"

export function useStateManager() {
	const [manager] = useState(() => new PackageManagerViewStateManager())

	const [state, setState] = useState(() => manager.getState())

	useEffect(() => {
		const handleStateChange = (newState: ViewState) => {
			setState(newState)
		}

		const handleMessage = (event: MessageEvent) => {
			manager.handleMessage(event.data)
		}

		window.addEventListener("message", handleMessage)
		const unsubscribe = manager.onStateChange(handleStateChange)

		return () => {
			window.removeEventListener("message", handleMessage)
			unsubscribe()
			manager.cleanup()
		}
	}, [manager, state])

	return [state, manager] as const
}

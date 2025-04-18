import { useState, useEffect } from "react"
import { PackageManagerViewStateManager, ViewState } from "./PackageManagerViewStateManager"

export function useStateManager(existingManager?: PackageManagerViewStateManager) {
	const [manager] = useState(() => existingManager || new PackageManagerViewStateManager())
	const [state, setState] = useState(() => manager.getState())

	useEffect(() => {
		const handleStateChange = (newState: ViewState) => {
			setState((prevState) => {
				// Only update if something actually changed
				if (JSON.stringify(prevState) === JSON.stringify(newState)) {
					return prevState
				}
				return newState
			})
		}

		const handleMessage = (event: MessageEvent) => {
			manager.handleMessage(event.data)
		}

		window.addEventListener("message", handleMessage)
		const unsubscribe = manager.onStateChange(handleStateChange)

		return () => {
			window.removeEventListener("message", handleMessage)
			unsubscribe()
			// Don't cleanup the manager if it was provided externally
			if (!existingManager) {
				manager.cleanup()
			}
		}
	}, [manager, existingManager])

	return [state, manager] as const
}

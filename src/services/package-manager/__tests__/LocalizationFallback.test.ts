mockFs.readdir.mockImplementation((dir, options) => {
	console.log("Mock readdir called with:", dir)
	const result = [
		{ name: "metadata.en.yml", isFile: () => true, isDirectory: () => false },
		{ name: "metadata.fr.yml", isFile: () => true, isDirectory: () => false },
	] as any
	console.log("Mock readdir returning:", result)
	return Promise.resolve(result)
})

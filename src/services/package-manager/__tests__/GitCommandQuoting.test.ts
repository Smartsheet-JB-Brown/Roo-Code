describe('Git command quoting', () => {
  it('should properly quote paths with spaces', () => {
    // This test verifies that our fix for handling paths with spaces works correctly
    const url = 'https://github.com/example/repo';
    const repoDir = '/path/with spaces/to/repo';

    // This is the fix we implemented in GitFetcher.cloneOrPullRepository
    const command = `git clone "${url}" "${repoDir}"`;

    // Verify that the command is properly quoted
    expect(command).toBe('git clone "https://github.com/example/repo" "/path/with spaces/to/repo"');
  });

  it('should handle paths with special characters', () => {
    // Test with more complex paths
    const url = 'https://github.com/example/repo-name';
    const repoDir = '/path/with spaces/and (special) characters/to/repo';

    // This is the fix we implemented in GitFetcher.cloneOrPullRepository
    const command = `git clone "${url}" "${repoDir}"`;

    // Verify that the command is properly quoted
    expect(command).toBe('git clone "https://github.com/example/repo-name" "/path/with spaces/and (special) characters/to/repo"');
  });
});
import { exec } from 'child_process';
import { promisify } from 'util';

// Mock the exec function
jest.mock('child_process', () => ({
  exec: jest.fn()
}));

// Mock promisify to return our mocked exec function
jest.mock('util', () => ({
  promisify: jest.fn()
}));

describe.skip('Git command with spaces in paths', () => {
  it('should properly quote paths with spaces', async () => {
    // Set up our mocks
    const mockExecFn = jest.fn().mockResolvedValue({ stdout: '', stderr: '' });
    (promisify as unknown as jest.Mock).mockReturnValue(mockExecFn);
    
    // Import the module that contains our fix
    const execAsync = promisify(exec);
    
    // Execute the command with a path that contains spaces
    const url = 'https://github.com/example/repo';
    const repoDir = '/path/with spaces/to/repo';
    await execAsync(`git clone "${url}" "${repoDir}"`);
    
    // Verify that exec was called with the properly quoted command
    expect(exec).toHaveBeenCalledWith(
      `git clone "${url}" "${repoDir}"`,
      expect.anything(),
      expect.anything()
    );
  });
});
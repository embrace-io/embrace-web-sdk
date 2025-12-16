import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COLORS, log, logSection } from '../../scripts/build-config.js';

const CLI_FILE = 'dist/index.mjs';
const cliDir = join(import.meta.dirname, '..');

function run(cmd: string, cwd = cliDir) {
  return execSync(cmd, { cwd, encoding: 'utf-8', stdio: 'pipe' });
}

logSection('CLI Validation');

// ES compatibility check
log('Checking ES compatibility...', COLORS.blue);
run(`npx es-check es2022 ${CLI_FILE} --module --allow-hash-bang`);
log('  ✓ ES2022 compatible', COLORS.green);

// Integration test
log('Testing CLI execution...', COLORS.blue);
const tempDir = mkdtempSync(join(tmpdir(), 'embrace-cli-validate-'));

try {
  execSync('npm init -y', { cwd: tempDir, stdio: 'pipe' });
  execSync(`npm install ${cliDir}`, { cwd: tempDir, stdio: 'pipe' });

  const helpOutput = execSync('npx embrace-web-cli --help', {
    cwd: tempDir,
    encoding: 'utf-8',
  });

  if (!helpOutput.includes('Commands:')) {
    log('  ✗ No commands found in CLI help', COLORS.red);
    process.exit(1);
  }
  log('  ✓ CLI executes and has command structure', COLORS.green);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

log('\n✓ All CLI validations passed!', COLORS.green + COLORS.bold);

import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { resolve, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const now = new Date().toISOString();

// Read source directories directly: new migrations, tests and reports must not
// disappear from the consolidation merely because they have not been staged.
const sourceRoots = new Set(['apps', 'packages', 'scripts', 'tests', 'docs', 'TEMPLATES']);
const excludedDirectories = new Set([
  'node_modules',
  '.git',
  '.next',
  '.local',
  '.agents',
  '.codex',
  '.aws',
  'dist',
  'build',
  'out',
  'coverage',
  'test-results',
  'playwright-report',
  'tmp',
  'temp',
  '.tmp',
  '.cache',
  'cache',
  'logs',
  'private',
  'backups',
  'data',
]);
const sourceExtensions = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.css',
  '.scss',
  '.sql',
  '.prisma',
  '.toml',
  '.yaml',
  '.yml',
  '.html',
]);
const rootFiles = new Set(['.gitignore', '.prettierignore', 'Dockerfile']);

export function collectSourceFiles(root) {
  const collected = [];
  function visit(directory, prefix = '') {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const lower = entry.name.toLowerCase();
      // Never follow symlinks/junctions into private or out-of-workspace data.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (
          excludedDirectories.has(lower) ||
          lower.startsWith('.') ||
          (!prefix && !sourceRoots.has(entry.name))
        )
          continue;
        visit(resolve(directory, entry.name), relative);
      } else if (entry.isFile()) {
        if (
          lower.startsWith('.env') ||
          (/(?:credential|secret|password|session|token|private[-_.]?key)/i.test(basename(relative)) &&
            !/\.(?:[cm]?[jt]sx?|md)$/i.test(relative))
        )
          continue;
        if (/\.(?:local|private)\./i.test(lower) || lower === 'package-lock.json' || lower === 'monstro.txt')
          continue;
        if (!sourceExtensions.has(extname(lower)) && !(prefix === '' && rootFiles.has(entry.name))) continue;
        collected.push(relative);
      }
    }
  }
  visit(root);
  return collected.sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) generate();

function generate() {
  const rawFiles = collectSourceFiles(rootDir);

  const ignorePatterns = [
    'package-lock.json',
    'monstro.txt',
    /\.png$/i,
    /\.jpg$/i,
    /\.jpeg$/i,
    /\.gif$/i,
    /\.ico$/i,
    /\.woff2?$/i,
    /\.ttf$/i,
    /\.node$/i,
    /\.log$/i,
  ];

  const files = rawFiles
    .filter((file) => {
      return !ignorePatterns.some((pattern) =>
        typeof pattern === 'string' ? file === pattern : pattern.test(file),
      );
    })
    .sort();

  let header = '';
  header += '================================================================================\n';
  header += 'VEXOR / EIMAX - CONSOLIDAÇÃO COMPLETA DO CÓDIGO FONTE DO PROGRAMA (MONSTRO.TXT)\n';
  header += `Gerado em: ${now}\n`;
  header += `Diretório Base: ${rootDir}\n`;
  header += `Total de Arquivos: ${files.length}\n`;
  header += '================================================================================\n\n';

  header += 'ÍNDICE DOS ARQUIVOS INCLUÍDOS:\n';
  files.forEach((file, idx) => {
    const num = String(idx + 1).padStart(5, ' ');
    header += `${num}. ${file}\n`;
  });
  header += '\n================================================================================\n\n\n';

  let body = '';
  for (const file of files) {
    try {
      const filePath = resolve(rootDir, file);
      const content = readFileSync(filePath, 'utf8');
      const stats = statSync(filePath);
      const lineCount = content.split('\n').length;

      body += '################################################################################\n';
      body += `# ARQUIVO [${file}]\n`;
      body += `# TAMANHO: ${stats.size} bytes | LINHAS: ${lineCount}\n`;
      body += '################################################################################\n\n';
      body += content;
      body += '\n\n\n';
    } catch (err) {
      throw new Error(`Consolidação interrompida: não foi possível ler ${file}`, { cause: err });
    }
  }

  const fullOutput = header + body;
  const outputPath = resolve(rootDir, 'monstro.txt');
  writeFileSync(outputPath, fullOutput, 'utf8');

  const outputStats = statSync(outputPath);
  console.log(`✓ monstro.txt gerado com sucesso em: ${outputPath}`);
  console.log(`  - Total de arquivos consolidados: ${files.length}`);
  console.log(`  - Linhas totais: ${fullOutput.split('\n').length}`);
  console.log(`  - Tamanho: ${(outputStats.size / 1024).toFixed(2)} KB (${outputStats.size} bytes)`);
}

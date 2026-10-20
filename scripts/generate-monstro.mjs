import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const rootDir = resolve('.');
const now = new Date().toISOString();

// Get tracked files from git
const gitOutput = execSync('git ls-files', { encoding: 'utf8' });
const rawFiles = gitOutput
  .split('\n')
  .map((f) => f.trim())
  .filter(Boolean);

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
    console.warn(`Aviso: não foi possível ler ${file}: ${err.message}`);
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

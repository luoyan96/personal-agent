import {readFileSync,writeFileSync} from 'node:fs';
import ts from 'typescript';
const source=new URL('../packages/research-skills/src/import.ts',import.meta.url);
writeFileSync(new URL('../packages/research-skills/dist/import.cjs',import.meta.url),ts.transpileModule(readFileSync(source,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText);

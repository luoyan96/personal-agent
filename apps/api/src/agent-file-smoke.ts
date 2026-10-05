// Public synthetic PDF fixture and network-free parser smoke for deployment.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { extractAgentFile } from './agent-files.js'
export function syntheticPdf(texts=['SYNTHETIC PAGE ONE: The paper tests a small baseline.','SYNTHETIC PAGE TWO: Limitations include a tiny sample.'],encrypted=false):Buffer{
  const objects=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Kids [${texts.map((_,i)=>`${4+i*2} 0 R`).join(' ')}] /Count ${texts.length} >>`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  texts.forEach((text,i)=>{objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+i*2} 0 R >>`);const stream=`BT /F1 12 Tf 50 740 Td (${text.replace(/[\\()]/g,'\\$&')}) Tj ET`;objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`)})
  const encryptId=objects.length+1;if(encrypted)objects.push('<< /Filter /Standard /V 1 /R 2 /Length 40 /O <'+'00'.repeat(32)+'> /U <'+'00'.repeat(32)+'> /P -4 >>')
  let out='%PDF-1.4\n',offsets=[0];objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(out));out+=`${i+1} 0 obj\n${object}\nendobj\n`});const xref=Buffer.byteLength(out);out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R ${encrypted?`/Encrypt ${encryptId} 0 R /ID [<00112233445566778899aabbccddeeff><00112233445566778899aabbccddeeff>]`:''} >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(out)
}
export async function agentFileSmoke(outputPath?:string){
  const bytes=syntheticPdf();if(outputPath)writeFileSync(outputPath,bytes)
  const body=(bytes:Buffer)=>({filename:'synthetic.pdf',mediaType:'application/pdf' as const,contentBase64:bytes.toString('base64')})
  const result=await extractAgentFile(body(bytes))
  if(result.pages.length!==2||!result.pages[0]!.text.includes('PAGE ONE')||!result.pages[1]!.text.includes('PAGE TWO'))throw new Error('SYNTHETIC_PDF_FAILED')
  for(const [bytes,code] of [[syntheticPdf(['']),'FILE_NO_TEXT'],[syntheticPdf(['secret'],true),'FILE_ENCRYPTED'],[Buffer.from('%PDF-1.4\nbroken'),'FILE_PARSE_FAILED']] as const){let caught=false;try{await extractAgentFile(body(bytes))}catch(error){caught=(error as {code?:string}).code===code}if(!caught)throw new Error(code)}
  return {parser:'pdf-parse@2.4.5',pages:result.pages.length,characters:result.metadata.characterCount,empty:'FILE_NO_TEXT',encrypted:'FILE_ENCRYPTED',corrupt:'FILE_PARSE_FAILED'}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){console.log(JSON.stringify(await agentFileSmoke(process.argv[2])))}

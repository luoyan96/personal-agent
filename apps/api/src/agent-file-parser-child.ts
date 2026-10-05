// A disposable process: no account credentials, URL loading, rendering or OCR.
import { PDFParse } from 'pdf-parse'
const MAX_PAGES=200, MAX_CHARS=200000, MAX_RSS=256*1024*1024
let used=false
const memory=setInterval(()=>{if(process.memoryUsage().rss>MAX_RSS){process.send?.({error:'FILE_EXTRACTION_LIMIT'});process.exit(1)}},50)
process.on('message',async(raw:unknown)=>{
  if(used)return;used=true
  const value=raw as {base64:string},bytes=Buffer.from(value.base64,'base64')
  const parser=new PDFParse({data:new Uint8Array(bytes),isEvalSupported:false,useWorkerFetch:false,useSystemFonts:false,disableFontFace:true,isOffscreenCanvasSupported:false,isImageDecoderSupported:false,stopAtErrors:true})
  try{
    const info=await parser.getInfo()
    if(info.total<1||info.total>MAX_PAGES)throw new Error('FILE_EXTRACTION_LIMIT')
    const pages:{pageNumber:number;text:string}[]=[];let characters=0
    for(let pageNumber=1;pageNumber<=info.total;pageNumber++){
      const result=await parser.getText({partial:[pageNumber],pageJoiner:'',parseHyperlinks:false})
      const text=result.pages[0]?.text??'';characters+=text.length
      if(characters>MAX_CHARS||process.memoryUsage().rss>MAX_RSS)throw new Error('FILE_EXTRACTION_LIMIT')
      pages.push({pageNumber,text})
    }
    if(!pages.some(p=>p.text.trim()))throw new Error('FILE_NO_TEXT')
    process.send?.({pages})
  }catch(error){
    const name=error instanceof Error?error.name:'',message=error instanceof Error?error.message:''
    process.send?.({error:message==='FILE_EXTRACTION_LIMIT'||message==='FILE_NO_TEXT'?message:/Password/i.test(name)?'FILE_ENCRYPTED':'FILE_PARSE_FAILED'})
  }finally{clearInterval(memory);await parser.destroy().catch(()=>{});process.disconnect?.()}
})

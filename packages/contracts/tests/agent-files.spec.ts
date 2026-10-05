import {describe,it,expect} from 'vitest'
import {AgentFileMessage,AgentFileSelection,AgentFileRead,routes} from '../src/index.js'
describe('Agent local file contracts',()=>{
 it('rejects URLs, paths, malformed base64 and authority fields',()=>{
  const body={filename:'synthetic.pdf',mediaType:'application/pdf',contentBase64:'eA=='}
  expect(AgentFileMessage.safeParse(body).success).toBe(true)
  for(const patch of [{filename:'../x.pdf'},{contentBase64:'https://example.invalid/file'},{url:'https://example.invalid/file'},{ownerId:'other'},{mediaType:'application/zip'}])expect(AgentFileMessage.safeParse({...body,...patch}).success).toBe(false)
  expect(AgentFileSelection.safeParse({messageId:'m',pageNumbers:[0]}).success).toBe(false)
  expect(AgentFileRead.safeParse({messageId:'m',filename:'x',pageCount:1,characterCount:5,ranges:[],partial:true}).success).toBe(true)
  expect(routes.agentFileMessage.idempotent).toBe(true)
 })
})

import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { Config } from './config.js'

export type ImCall=(path:string,body:unknown,token?:string,operationID?:string)=>Promise<Record<string,unknown>>
export class ImUnavailable extends Error { constructor(readonly reason:'not_configured'|'policy_not_configured'|'backend_unreachable'|'provisioning_failed'){super(reason)} }
export function imConfiguration(config:Config){
  const c=config.openIm
  if(!c.apiURL||!c.publicApiURL||!c.publicWsURL||!c.secretFile||!c.callbackKeyFile)throw new ImUnavailable('not_configured')
  if(!c.policyEnforced)throw new ImUnavailable('policy_not_configured')
  try{if(!/^[a-f0-9]{64}$/.test(readFileSync(c.callbackKeyFile,'utf8').trim()))throw new Error();if(!readFileSync(c.secretFile,'utf8').trim())throw new Error()}catch{throw new ImUnavailable('not_configured')}
  return {apiAddr:c.publicApiURL,wsAddr:c.publicWsURL,serverVersion:'3.8.3' as const,sdkVersion:'3.8.3-patch.15.1' as const}
}
export class OpenImClient {
  private adminToken:string|null=null
  private adminUntil=0
  constructor(readonly config:Config,readonly call:ImCall=async(path,body,token,operationID)=>{
    let response:Response
    try{response=await fetch(`${config.openIm.apiURL}${path}`,{method:'POST',headers:{'Content-Type':'application/json',operationID:operationID??randomUUID(),...(token?{token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(7000),redirect:'error'})}catch{throw new ImUnavailable('backend_unreachable')}
    if(!response.ok)throw new ImUnavailable('backend_unreachable')
    try{const value=await response.json() as {errCode:number;data?:Record<string,unknown>};if(value.errCode!==0)throw new ImUnavailable('provisioning_failed');return value.data??{}}catch(error){if(error instanceof ImUnavailable)throw error;throw new ImUnavailable('backend_unreachable')}
  }){}
  async request(path:string,body:unknown,operationID?:string){
    imConfiguration(this.config)
    if(!this.adminToken||this.adminUntil<Date.now()){
      const data=await this.call('/auth/get_admin_token',{userID:this.config.openIm.adminID,secret:readFileSync(this.config.openIm.secretFile!,'utf8').trim()})
      if(typeof data.token!=='string'||!data.token)throw new ImUnavailable('provisioning_failed')
      this.adminToken=data.token;this.adminUntil=Date.now()+Math.min(Number(data.expireTimeSeconds)||300,300)*1000
    }
    return this.call(path,body,this.adminToken,operationID??randomUUID())
  }
  async ensureUser(userID:string,nickname:string){
    const existing=await this.request('/user/get_users_info',{userIDs:[userID]})
    if(!Array.isArray(existing.usersInfo)||!existing.usersInfo.some((user:{userID?:string})=>user.userID===userID)){
      try{await this.request('/user/user_register',{users:[{userID,nickname,faceURL:''}]})}catch(error){const again=await this.request('/user/get_users_info',{userIDs:[userID]});if(!Array.isArray(again.usersInfo)||!again.usersInfo.some((user:{userID?:string})=>user.userID===userID))throw error}
    }
    await this.request('/user/update_user_info',{userInfo:{userID,nickname,faceURL:''}})
  }
}

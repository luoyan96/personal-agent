import { isAbsolute, resolve } from 'node:path'

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const mode = env.NODE_ENV ?? 'development'
  if (!['development', 'test', 'production'].includes(mode)) throw new Error('Invalid NODE_ENV')
  // All identities require a real password-backed session, including development.
  if (env.DEV_AUTH_MEMBER || env.FIXTURE_MODE || env.AUTH_BYPASS) throw new Error('Authentication bypass and fixture mode are unsupported')
  if (mode === 'production' && (!env.DATABASE_PATH || !env.BLOB_ROOT)) throw new Error('Production requires DATABASE_PATH and BLOB_ROOT')
  const databasePath = resolve(env.DATABASE_PATH ?? '.runtime/platform.sqlite')
  const blobRoot = resolve(env.BLOB_ROOT ?? '.runtime/blobs')
  if (mode === 'production' && (!isAbsolute(env.DATABASE_PATH!) || !isAbsolute(env.BLOB_ROOT!))) throw new Error('Production data paths must be absolute')
  const port = Number(env.PORT ?? 3100)
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT')
  const origin = env.APP_ORIGIN ?? `http://127.0.0.1:${port}`
  if (new URL(origin).origin !== origin || !['http:', 'https:'].includes(new URL(origin).protocol)) throw new Error('APP_ORIGIN must be an exact HTTP origin')
  if (mode === 'production' && (!env.APP_ORIGIN || !origin.startsWith('https://'))) throw new Error('Production requires HTTPS APP_ORIGIN')
  const credentialKeyFile = env.LAB_CREDENTIAL_KEY_FILE ?? null
  if (credentialKeyFile && !isAbsolute(credentialKeyFile)) throw new Error('LAB_CREDENTIAL_KEY_FILE must be absolute')
  const address=(name:string,protocols:string[],publicEndpoint=true)=>{const value=env[name]??null;if(value){const parsed=new URL(value);if(!protocols.includes(parsed.protocol)||parsed.username||parsed.password||parsed.search||parsed.hash)throw new Error(`Invalid ${name}`);if(publicEndpoint&&mode==='production'&&!['https:','wss:'].includes(parsed.protocol))throw new Error(`Production requires secure ${name}`)}return value?.replace(/\/$/,'')??null}
  const secretPath=(name:string)=>{const value=env[name]??null;if(value&&!isAbsolute(value))throw new Error(`${name} must be absolute`);return value}
  const openIm={apiURL:address('OPENIM_API_URL',['http:','https:'],false),publicApiURL:address('OPENIM_PUBLIC_API_URL',['http:','https:']),publicWsURL:address('OPENIM_PUBLIC_WS_URL',['ws:','wss:']),adminID:env.OPENIM_ADMIN_ID??'imAdmin',secretFile:secretPath('OPENIM_SECRET_FILE'),callbackKeyFile:secretPath('OPENIM_CALLBACK_KEY_FILE'),policyEnforced:env.OPENIM_POLICY_ENFORCED==='1'}
  return { aiEnabled: env.B3_AI_ENABLED === '1', model: env.DEEPSEEK_MODEL ?? 'deepseek-flash', credentialKeyFile, mode, databasePath, blobRoot, host: env.HOST ?? '127.0.0.1', port, origin, openIm }
}
export type Config = ReturnType<typeof readConfig>

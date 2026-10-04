import { errorStatus } from '@research-agent-platform/contracts'

export class ApiError extends Error {
  constructor(public readonly code: keyof typeof errorStatus, public readonly validationField?: AuthValidationField) { super(code) }
}
export type AuthValidationField = 'username'|'password'|'inviteCode'|'displayName'
export function fail(code: keyof typeof errorStatus, validationField?: AuthValidationField): never { throw new ApiError(code,validationField) }

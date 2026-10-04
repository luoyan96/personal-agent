import { z } from 'zod'

// Keep account identity case-sensitive. Only surrounding whitespace is removed;
// internal whitespace, zero-width characters and Unicode lookalikes remain invalid.
export const AccountUsername = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/)
// Passwords are preserved exactly. Transport body limits bound request size.
export const AccountPassword = z.string().min(8)
export const RegistrationCode = z.string().trim().min(20).max(128).regex(/^[A-Za-z0-9_-]+$/)

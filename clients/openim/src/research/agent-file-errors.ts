import { ResearchApiError } from "./api";
import { FileFetchError } from "./firstPartyFile";

/** An uncertain acknowledgement is retried with the retained body and key;
 * permanent file/permission errors require the user to change the input.
 */
export function retryableAgentFileError(error: unknown): boolean {
  if (error instanceof FileFetchError) return error.retryable;
  return error instanceof ResearchApiError && (
    ["REQUEST_TIMEOUT", "INVALID_RESPONSE", "NETWORK_ERROR", "SERVICE_UNAVAILABLE",
      "INTERNAL_ERROR", "FILE_PARSE_TIMEOUT"].includes(error.code) ||
    error.status >= 500
  );
}

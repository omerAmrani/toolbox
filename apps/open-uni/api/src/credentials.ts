// Per-request credentials — supplied by the client on each call, used
// in-memory for the life of that request only, never written to disk/DB.
export interface OpalCredentials {
  username: string;
  password: string;
  id: string;
}

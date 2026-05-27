import path from 'path';
import { rmSync, existsSync } from 'fs';

export default function globalTeardown() {
  const tempDb = path.resolve(__dirname, '../../open-uni-recorder-api/temp-db');
  if (existsSync(tempDb)) {
    rmSync(tempDb, { recursive: true, force: true });
  }
}

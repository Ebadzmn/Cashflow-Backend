import { JwtPayload } from 'jsonwebtoken';
import type { Server as SocketIOServer } from 'socket.io';

declare global {
  // Global declarations require `var` so the property is available on globalThis.
  // eslint-disable-next-line no-var
  var io: SocketIOServer | undefined;

  namespace Express {
    // Express request augmentation relies on interface declaration merging.
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface Request {
      user: JwtPayload;
      requestId: string;
    }
  }
}

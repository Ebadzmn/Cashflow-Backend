/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import passport from 'passport';
import { User } from '../app/modules/user/user.model';
import strategies from './strategies';
import { errorLogger, logger } from '../shared/logger';

import { IUser } from '../app/modules/user/user.interface';

/**
 * Passport Configuration
 * Initializes Passport with all configured strategies and serialization
 * Handles user serialization/deserialization for session management
 */

// Serialize user to session
passport.serializeUser((user: any, done) => {
  const userId = ((user as any)._id as { toString(): string }).toString();
  done(null, userId);
});

// Deserialize user from session
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    errorLogger.error('Error deserializing user', error);
    done(error);
  }
});

/**
 * Initialize all available strategies
 * Skips strategies that have missing credentials
 * This allows the app to run without OAuth credentials configured
 */
export const initializePassport = () => {
  strategies.forEach(({ name, strategy, enabled }) => {
    if (!enabled || !strategy) {
      return;
    }

    try {
      passport.use(strategy);
      logger.info(
        `✓ ${name.charAt(0).toUpperCase() + name.slice(1)} OAuth strategy initialized`,
      );
    } catch (error) {
      errorLogger.error(`Error initializing ${name} strategy`, error);
    }
  });
};

export default passport;

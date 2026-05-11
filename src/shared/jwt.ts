import jwt, { Secret, SignOptions } from 'jsonwebtoken';

const createError = require('http-errors');
const passportJwt = require('passport-jwt');

// Ensure that the JWT_SECRET environment variable is defined
const secret: Secret = process.env.JWT_SECRET!;
if (!secret) {
  throw new Error('JWT_SECRET environment variable is not defined.');
}

export const jwtStrategy = new passportJwt.Strategy({
  secretOrKey: secret,
  jwtFromRequest: passportJwt.ExtractJwt.fromAuthHeaderAsBearerToken() },
   async (payload: any, next: any) => {

  const userId = payload.id;
  if (!userId) return next(createError(401));

  return next(null, payload);
});

/**
 * Generates a JSON Web Token.
 *
 * @param payload - The payload to sign.
 * @param expiresIn - The expiration time for the token (e.g., "1h") or false for no expiration.
 * @returns The signed JWT as a string.
 */
export function generateToken(payload: unknown, expiresIn: any | false = false): string {
  if (!payload) {
    throw new Error('No payload to generate JWT token.');
  }

  // Create sign options based on the expiresIn value.
  const options: SignOptions = expiresIn ? { expiresIn } : {};
  return jwt.sign(payload, secret, options);
}
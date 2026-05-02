import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'digiactiva-dev-secret-2025'
);

const JWT_EXPIRY = '7d';

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  activeWorkspaceId?: string;
}

/**
 * Sign a JWT token with the given payload
 */
export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .setIssuer('digiactiva')
    .setAudience('digiactiva-api')
    .sign(JWT_SECRET);
}

/**
 * Verify a JWT token and return the payload, or null if invalid
 */
export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: 'digiactiva',
      audience: 'digiactiva-api',
    });
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      role: payload.role as string,
      activeWorkspaceId: payload.activeWorkspaceId as string | undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Hash a password using bcryptjs
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}

/**
 * Compare a plain-text password against a bcrypt hash
 */
export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Extract Bearer token from Authorization header
 */
export function extractBearerToken(
  authHeader: string | null
): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}

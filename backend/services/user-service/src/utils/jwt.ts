import jwt, { SignOptions } from 'jsonwebtoken';
import { JwtUserPayload } from '../types/auth';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

export function generateToken(
  payload: JwtUserPayload,
  expiresIn: SignOptions['expiresIn'] = '30d',
) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

export function verifyToken(token: string) {
  return jwt.verify(token, JWT_SECRET);
}
 
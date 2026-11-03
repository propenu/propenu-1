import { JwtPayload } from "jsonwebtoken";

export type UserRole =
  | "admin"
  | "sales_manager"
  | "regional_manager"
  | "sales_agent"
  | "user";

export interface JwtUserPayload extends JwtPayload {
   _id: string;
  sub: string;    
  email: string;
  name: string;
  phone?: string;
  roleId?: string | undefined; 
  roleName: string;
  permissions: string[];
  impersonation?: boolean;
  readOnly?: boolean;
  impersonatorSub?: string;
  impersonatorName?: string;
}

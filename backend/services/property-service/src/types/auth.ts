import { JwtPayload } from "jsonwebtoken";
import { Types } from "mongoose";

export type UserRole =
  | "super_admin"
  | "admin"
  | "sales_manager"
  | "regional_manager"
  | "sales_agent"
  | "accounts"
  | "digital_marketing"
  | "customer_care"
  | "user"
  | "builder"
  | "builder_staff";

export interface JwtUserPayload extends JwtPayload {
    _id: Types.ObjectId;   // 👈 REQUIRED
  sub: string;    
  email: string;
  name: string;
  roleId?: string | undefined; 
  roleName?: string | undefined;
  permissions: string[];
  impersonation?: boolean;
  readOnly?: boolean;
  impersonatorSub?: string;
  impersonatorName?: string;
}
